// features/effects/index.ts — re-exports everything from the effects feature.

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
