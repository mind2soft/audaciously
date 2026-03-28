// features/effects/dsp/fade-out.ts
// Pure-DSP fade-out processor — ramps gain from 1 → 0 over the fade duration.
//
// Chunk-aware: uses globalOffset + totalDuration so a chunk covering only the
// tail of the buffer applies the correct portion of the envelope.

import type { FadeCurve, FadeOutEffect } from "../types";
import type { DspContext } from "./types";

/** Envelope value (1 → 0) at the given ratio through the fade. */
function fadeOutEnvelope(ratio: number, curve: FadeCurve): number {
  switch (curve) {
    case "linear":
      return 1 - ratio;
    case "logarithmic":
      return Math.log10(1 + 9 * (1 - ratio));
    case "exponential":
      return (10 ** (1 - ratio) - 1) / 9;
    case "sine":
      return Math.cos(ratio * Math.PI * 0.5);
  }
}

/**
 * Apply fade-out: the last `effect.duration` seconds of the full buffer are
 * scaled by an envelope that ramps 1 → 0.  Samples before the fade are
 * untouched.
 *
 * For single-shot processing (globalOffset=0, totalDuration=duration), behaviour
 * is identical to the original non-chunked version.
 */
export function processFadeOutEffect(
  channels: Float32Array[],
  effect: FadeOutEffect,
  ctx: DspContext,
): void {
  const chunkLen = channels[0]?.length ?? 0;
  if (chunkLen === 0) return;

  // Global fade region starts at (totalSamples - fadeSamples).
  const totalSamplesGlobal = Math.round(ctx.totalDuration * ctx.sampleRate);
  const fadeSamplesGlobal = Math.min(
    Math.floor(effect.duration * ctx.sampleRate),
    totalSamplesGlobal,
  );
  if (fadeSamplesGlobal <= 0) return;

  const fadeStartGlobal = totalSamplesGlobal - fadeSamplesGlobal;

  // This chunk covers global sample range [chunkStart, chunkEnd).
  const chunkStart = Math.round(ctx.globalOffset * ctx.sampleRate);
  const chunkEnd = chunkStart + chunkLen;

  // If the entire chunk is before the fade region, nothing to do.
  if (chunkEnd <= fadeStartGlobal) return;

  // Intersection: local sample indices that overlap the fade region.
  const localStart = Math.max(0, fadeStartGlobal - chunkStart);
  const localEnd = chunkLen;

  const invFade = 1 / fadeSamplesGlobal;

  for (const ch of channels) {
    for (let i = localStart; i < localEnd; i++) {
      const globalSample = chunkStart + i;
      const fadeProgress = globalSample - fadeStartGlobal;
      ch[i] *= fadeOutEnvelope(fadeProgress * invFade, effect.curve);
    }
  }
}
