// features/effects/dsp/fade-out.ts
// Pure-DSP fade-out processor — ramps gain from 1 → 0 over the fade duration.

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
 * Apply fade-out: the last `effect.duration` seconds are scaled by an
 * envelope that ramps from 1 to 0.  Samples before the fade are untouched.
 */
export function processFadeOutEffect(
  channels: Float32Array[],
  effect: FadeOutEffect,
  ctx: DspContext,
): void {
  const totalSamples = channels[0]?.length ?? 0;
  const fadeSamples = Math.min(Math.floor(effect.duration * ctx.sampleRate), totalSamples);
  if (fadeSamples <= 0) return;

  const fadeStart = totalSamples - fadeSamples;
  const invFade = 1 / fadeSamples;

  for (const ch of channels) {
    for (let i = 0; i < fadeSamples; i++) {
      ch[fadeStart + i] *= fadeOutEnvelope(i * invFade, effect.curve);
    }
  }
}
