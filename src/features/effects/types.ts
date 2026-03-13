// features/effects/types.ts
// All AudioEffect interfaces and the union type.
// See: .opencode/context/refactor/05-audio-effects.md

export type AudioEffectType = "gain" | "balance" | "fadeIn" | "fadeOut";

export interface AudioEffectBase {
  readonly id: string;
  type: AudioEffectType;
  /** Whether this effect is active. Default: true. */
  enabled: boolean;
}

export interface GainEffect extends AudioEffectBase {
  type: "gain";
  /** >= 0. 1 = unity, < 1 = attenuate, > 1 = amplify. Default: 1. */
  value: number;
}

export interface BalanceEffect extends AudioEffectBase {
  type: "balance";
  /** -1 (full left) to 1 (full right). Default: 0. */
  value: number;
}

export interface FadeInEffect extends AudioEffectBase {
  type: "fadeIn";
  /** Duration of the fade in seconds from the playback offset. Default: 0.5. */
  duration: number;
}

export interface FadeOutEffect extends AudioEffectBase {
  type: "fadeOut";
  /** Duration of the fade in seconds ending at offset + totalDuration. Default: 0.5. */
  duration: number;
}

export type AudioEffect = GainEffect | BalanceEffect | FadeInEffect | FadeOutEffect;
