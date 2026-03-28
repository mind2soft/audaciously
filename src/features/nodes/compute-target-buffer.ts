// features/nodes/compute-target-buffer.ts
// computeTargetBuffer — pre-bakes effects into an AudioBuffer via the
// effect-processor Web Worker (pure-DSP, off–main-thread).
//
// Called by useInstrumentNode and useRecordedNode whenever the source buffer or
// effects list changes. The result is stored as `targetBuffer` on the node.
//
// Zero-copy optimisation: if no effects are enabled, `source` is returned as-is
// (same reference). The caller should not mutate the returned buffer.

import { createEffectWorkerClient } from "../../lib/audio/effectWorker";
import type { AudioEffect } from "../effects/types";

// Module-level client — one instance is sufficient for the whole application.
// The underlying worker uses per-node seqNum cancellation.
const effectClient = createEffectWorkerClient();

/**
 * Pre-bake all enabled effects from `effects` into a new AudioBuffer using the
 * effect-processor Web Worker (runs entirely off the main thread).
 *
 * Returns `source` unchanged when no effects are enabled (zero-copy — avoids
 * an unnecessary render pass).
 *
 * @param source  The original (unprocessed) AudioBuffer.
 * @param effects The effect chain to bake in.
 * @param nodeId  Unique node identifier for cancellation/debounce.
 * @returns       A resolved AudioBuffer with effects applied, or `source` if no
 *                enabled effects exist.
 */
export async function computeTargetBuffer(
  source: AudioBuffer,
  effects: AudioEffect[],
  nodeId: string,
): Promise<AudioBuffer> {
  const enabled = effects.filter((e) => e.enabled);

  // Zero-copy fast path: no enabled effects → return the source unchanged.
  if (enabled.length === 0) return source;

  return effectClient.process(source, effects, nodeId);
}
