// features/effects/dsp/balance.ts
// Pure-DSP stereo balance processor.
// Uses the same L/R gain formulas as StereoBalanceNode.ts so offline
// rendering matches the real-time Web Audio result.

import type { BalanceEffect } from "../types";
import type { DspContext } from "./types";

function toLeft(balance: number): number {
  return balance > 0 ? 1 - balance : 1;
}

function toRight(balance: number): number {
  return balance > 0 ? 1 : 1 + balance;
}

/**
 * Apply stereo balance by scaling L/R channels independently.
 * No-op when value is 0 (centre) or when the buffer is mono.
 */
export function processBalanceEffect(
  channels: Float32Array[],
  effect: BalanceEffect,
  _ctx: DspContext,
): void {
  if (channels.length < 2 || effect.value === 0) return;

  const lGain = toLeft(effect.value);
  const rGain = toRight(effect.value);
  const left = channels[0];
  const right = channels[1];

  for (let i = 0; i < left.length; i++) {
    left[i] *= lGain;
    right[i] *= rGain;
  }
}
