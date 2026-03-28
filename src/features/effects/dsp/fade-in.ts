// features/effects/dsp/fade-in.ts
// Pure-DSP fade-in processor — ramps gain from 0 → 1 over the fade duration.
//
// Chunk-aware: uses globalOffset + totalDuration so a chunk starting mid-fade
// applies the correct portion of the envelope.

import type { FadeCurve, FadeInEffect } from "../types";
import type { DspContext } from "./types";

/** Envelope value (0 → 1) at the given ratio through the fade. */
function fadeInEnvelope(ratio: number, curve: FadeCurve): number {
  switch (curve) {
    case "linear":
      return ratio;
    case "logarithmic":
      // Fast start, slow finish — perceived as smooth in audio.
      return Math.log10(1 + 9 * ratio);
    case "exponential":
      // Slow start, fast finish — inverse of logarithmic.
      return (10 ** ratio - 1) / 9;
    case "sine":
      return Math.sin(ratio * Math.PI * 0.5);
  }
}

/**
 * Apply fade-in: samples within the global fade region (0 to `effect.duration`
 * seconds from the start of the full buffer) are scaled by an envelope that
 * ramps 0 → 1.  Samples beyond the fade are untouched.
 *
 * For single-shot processing (globalOffset=0), behaviour is identical to the
 * original non-chunked version.
 */
export function processFadeInEffect(
  channels: Float32Array[],
  effect: FadeInEffect,
  ctx: DspContext,
): void {
  const chunkLen = channels[0]?.length ?? 0;
  if (chunkLen === 0) return;

  // Global fade region: sample 0 to fadeSamples in the full buffer.
  const fadeSamplesGlobal = Math.floor(effect.duration * ctx.sampleRate);
  if (fadeSamplesGlobal <= 0) return;

  // This chunk covers global sample range [chunkStart, chunkStart + chunkLen).
  const chunkStart = Math.round(ctx.globalOffset * ctx.sampleRate);

  // If the entire chunk is past the fade region, nothing to do.
  if (chunkStart >= fadeSamplesGlobal) return;

  // Intersection: local sample indices that overlap the fade region.
  const localStart = 0; // fade always starts at global sample 0
  const localEnd = Math.min(chunkLen, fadeSamplesGlobal - chunkStart);

  const invFade = 1 / fadeSamplesGlobal;

  for (const ch of channels) {
    for (let i = localStart; i < localEnd; i++) {
      const globalSample = chunkStart + i;
      ch[i] *= fadeInEnvelope(globalSample * invFade, effect.curve);
    }
  }
}
