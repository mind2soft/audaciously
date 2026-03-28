// features/effects/dsp/gain.ts
// Pure-DSP gain processor — multiply all samples by a scalar value.

import type { GainEffect } from "../types";
import type { DspContext } from "./types";

/** Apply gain: multiply every sample by `effect.value`. No-op when value is 1. */
export function processGainEffect(
  channels: Float32Array[],
  effect: GainEffect,
  _ctx: DspContext,
): void {
  const { value } = effect;
  if (value === 1) return;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      ch[i] *= value;
    }
  }
}
