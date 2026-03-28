// features/effects/dsp/split.ts
// Pure-DSP split processor — routes L/R channels through independent sub-chains.
//
// Receives the pipeline runner as a callback to avoid circular imports
// (pipeline → split → pipeline).

import type { AudioEffect, SplitEffect } from "../types";
import type { DspContext } from "./types";

/**
 * Apply a stereo split: channel 0 is processed through `effect.left`,
 * channel 1 through `effect.right`.  Each sub-chain receives a single-channel
 * array (mono-compatible effects only — see SplitEffect type doc).
 *
 * No-op when the buffer is mono (< 2 channels).
 * Returns `false` if cancelled.
 *
 * @param runPipeline  Reference to `processEffectPipeline` — injected to
 *                     break the circular import between pipeline ↔ split.
 */
export function processSplitEffect(
  channels: Float32Array[],
  effect: SplitEffect,
  ctx: DspContext,
  isCancelled: () => boolean,
  runPipeline: (
    ch: Float32Array[],
    fx: AudioEffect[],
    c: DspContext,
    cancel: () => boolean,
  ) => boolean,
): boolean {
  if (channels.length < 2) return true;

  // Left sub-chain — channel 0 only.
  if (!runPipeline([channels[0]], effect.left, ctx, isCancelled)) return false;

  // Right sub-chain — channel 1 only.
  if (!runPipeline([channels[1]], effect.right, ctx, isCancelled)) return false;

  return true;
}
