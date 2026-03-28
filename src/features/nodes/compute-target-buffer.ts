// features/nodes/compute-target-buffer.ts
// computeTargetBuffer — pre-bakes effects into an AudioBuffer via the
// effect-processor Web Worker (pure-DSP, off–main-thread).
//
// Delegates to processEffects which internally routes to single-shot or
// chunked processing based on buffer duration.
//
// Zero-copy optimisation: if no effects are enabled, `source` is returned as-is
// (same reference). The caller should not mutate the returned buffer.

import { processEffects } from "../../lib/audio/processEffects";
import type { AudioEffect } from "../effects/types";

/**
 * Pre-bake all enabled effects into a new AudioBuffer using the
 * effect-processor Web Worker (runs entirely off the main thread).
 *
 * Returns `source` unchanged when no effects are enabled (zero-copy).
 *
 * @param source   The original (unprocessed) AudioBuffer.
 * @param effects  The effect chain to bake in.
 * @param signal   AbortSignal — abort to cancel processing.
 * @param nodeId   Unique node identifier — forwarded to the worker for per-node
 *                 seqNum cancellation so concurrent nodes don't interfere.
 * @returns        Processed AudioBuffer with effects applied.
 */
export async function computeTargetBuffer(
  source: AudioBuffer,
  effects: AudioEffect[],
  signal: AbortSignal,
  nodeId?: string,
): Promise<AudioBuffer> {
  signal.throwIfAborted();

  const enabled = effects.filter((e) => e.enabled);

  // Zero-copy fast path: no enabled effects → return the source unchanged.
  if (enabled.length === 0) return source;

  return processEffects(source, enabled, signal, nodeId);
}
