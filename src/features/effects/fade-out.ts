// features/effects/fade-out.ts
// FadeOutEffect factory and WebAudio wiring.
// See: .opencode/context/refactor/05-audio-effects.md

import { nanoid } from "nanoid";
import type { FadeOutEffect } from "./types";

/** Create a new FadeOutEffect with defaults. */
export function createFadeOutEffect(id?: string): FadeOutEffect {
  return {
    id: id ?? nanoid(),
    type: "fadeOut",
    enabled: true,
    duration: 0.5,
    curve: "linear",
  };
}

/**
 * Wire a FadeOutEffect into a WebAudio graph.
 * Applies a linear ramp from 1 → 0 over `effect.duration` seconds,
 * ending at contextTime + effectContext.offset + effectContext.duration.
 *
 * Connects inputNode → GainNode → outputNode.
 * Returns the created GainNode for later cleanup.
 */
export function applyFadeOutEffect(
  context: BaseAudioContext,
  effect: FadeOutEffect,
  inputNode: AudioNode,
  outputNode: AudioNode,
  effectContext: { offset: number; duration: number },
  contextTime: number,
): GainNode {
  const gainNode = context.createGain();
  const endTime = contextTime + effectContext.offset + effectContext.duration;
  const startTime = endTime - effect.duration;

  gainNode.gain.setValueAtTime(1, startTime);
  gainNode.gain.linearRampToValueAtTime(0, endTime);

  inputNode.connect(gainNode);
  gainNode.connect(outputNode);
  return gainNode;
}
