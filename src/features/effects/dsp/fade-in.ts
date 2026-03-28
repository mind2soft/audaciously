// features/effects/dsp/fade-in.ts
// Pure-DSP fade-in processor — ramps gain from 0 → 1 over the fade duration.

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
 * Apply fade-in: samples from 0 to `effect.duration` seconds are scaled
 * by an envelope that ramps from 0 to 1.  Samples beyond the fade are untouched.
 */
export function processFadeInEffect(
  channels: Float32Array[],
  effect: FadeInEffect,
  ctx: DspContext,
): void {
  const fadeSamples = Math.min(
    Math.floor(effect.duration * ctx.sampleRate),
    channels[0]?.length ?? 0,
  );
  if (fadeSamples <= 0) return;

  const invFade = 1 / fadeSamples;
  for (const ch of channels) {
    for (let i = 0; i < fadeSamples; i++) {
      ch[i] *= fadeInEnvelope(i * invFade, effect.curve);
    }
  }
}
