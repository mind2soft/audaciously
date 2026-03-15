// features/nodes/compute-target-buffer.ts
// computeTargetBuffer — pre-bakes effects into an AudioBuffer via OfflineAudioContext.
//
// Called by useInstrumentNode and useRecordedNode whenever the source buffer or
// effects list changes. The result is stored as `targetBuffer` on the node.
//
// Zero-copy optimisation: if no effects are enabled, `source` is returned as-is
// (same reference). The caller should not mutate the returned buffer.

import type { AudioEffect } from "../effects/types";
import { applyEffectChain } from "../effects/apply-effects";

/**
 * Pre-bake all enabled effects from `effects` into a new AudioBuffer using an
 * OfflineAudioContext.  Returns `source` unchanged when no effects are enabled
 * (zero-copy — avoids an unnecessary render pass).
 *
 * @param source  The original (unprocessed) AudioBuffer.
 * @param effects The effect chain to bake in.
 * @returns       A resolved AudioBuffer with effects applied, or `source` if no
 *                enabled effects exist.
 */
export async function computeTargetBuffer(
  source: AudioBuffer,
  effects: AudioEffect[],
): Promise<AudioBuffer> {
  const enabled = effects.filter((e) => e.enabled);

  // Zero-copy fast path: no enabled effects → return the source unchanged.
  if (enabled.length === 0) return source;

  const offCtx = new OfflineAudioContext(
    source.numberOfChannels,
    source.length,
    source.sampleRate,
  );

  const bufSrc = offCtx.createBufferSource();
  bufSrc.buffer = source;

  // applyEffectChain accepts BaseAudioContext — OfflineAudioContext qualifies.
  applyEffectChain(
    offCtx,
    bufSrc,
    offCtx.destination,
    effects,
    { offset: 0, duration: source.duration },
    0,
  );

  bufSrc.start(0);
  return offCtx.startRendering();
}
