// features/effects/types.ts
// All AudioEffect interfaces and the union type.
// See: .opencode/context/refactor/05-audio-effects.md

export type AudioEffectType = "gain" | "balance" | "fadeIn" | "fadeOut" | "split" | "volume";

export type FadeCurve = "linear" | "logarithmic" | "exponential" | "sine";

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
  /** Shape of the fade curve. Default: 'linear'. */
  curve: FadeCurve;
}

export interface FadeOutEffect extends AudioEffectBase {
  type: "fadeOut";
  /** Duration of the fade in seconds ending at offset + totalDuration. Default: 0.5. */
  duration: number;
  /** Shape of the fade curve. Default: 'linear'. */
  curve: FadeCurve;
}

export interface SplitEffect extends AudioEffectBase {
  type: "split";
  /**
   * Effects applied to the L (left) channel mono path.
   * Only mono-compatible effects (gain, fadeIn, fadeOut, volume) are allowed.
   */
  left: AudioEffect[];
  /**
   * Effects applied to the R (right) channel mono path.
   * Only mono-compatible effects (gain, fadeIn, fadeOut, volume) are allowed.
   */
  right: AudioEffect[];
}

export interface VolumeKeyframe {
  time: number; // 0..1 normalized position in the audio
  value: number; // 0..2 gain multiplier
}

export interface VolumeEffect extends AudioEffectBase {
  type: "volume";
  keyframes: VolumeKeyframe[];
}

export type AudioEffect =
  | GainEffect
  | BalanceEffect
  | FadeInEffect
  | FadeOutEffect
  | SplitEffect
  | VolumeEffect;
