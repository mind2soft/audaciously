// features/effects/index.ts — re-exports everything from the effects feature.

import {
  createBalanceEffect,
  createFadeInEffect,
  createFadeOutEffect,
  createGainEffect,
  createSplitEffect,
  createVolumeEffect,
} from "../effects";

import type { AudioEffect, AudioEffectType } from "./types";

export { applyEffectChain } from "./apply-effects";
export { applyBalanceEffect, createBalanceEffect } from "./balance";
export { applyFadeInEffect, createFadeInEffect } from "./fade-in";
export { applyFadeOutEffect, createFadeOutEffect } from "./fade-out";
export { applyGainEffect, createGainEffect } from "./gain";
export { createSplitEffect } from "./split";
export type {
  AudioEffect,
  AudioEffectBase,
  AudioEffectType,
  BalanceEffect,
  FadeCurve,
  FadeInEffect,
  FadeOutEffect,
  GainEffect,
  SplitEffect,
  VolumeEffect,
  VolumeKeyframe,
} from "./types";
export { createVolumeEffect } from "./volume";

export function createEffectByType(type: AudioEffectType): AudioEffect {
  switch (type) {
    case "gain":
      return createGainEffect();
    case "balance":
      return createBalanceEffect();
    case "fadeIn":
      return createFadeInEffect();
    case "fadeOut":
      return createFadeOutEffect();
    case "split":
      return createSplitEffect();
    case "volume":
      return createVolumeEffect();
  }
}
