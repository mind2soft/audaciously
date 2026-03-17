// features/effects/fade-in.ts
// FadeInEffect factory and WebAudio wiring.
// See: .opencode/context/refactor/05-audio-effects.md

import { nanoid } from "nanoid";
import type { FadeInEffect } from "./types";

/** Create a new FadeInEffect with defaults. */
export function createFadeInEffect(id?: string): FadeInEffect {
  return {
    id: id ?? nanoid(),
    type: "fadeIn",
    enabled: true,
    duration: 0.5,
    curve: "linear",
  };
}

/**
 * Wire a FadeInEffect into a WebAudio graph.
 * Applies a linear ramp from 0 → 1 over `effect.duration` seconds,
 * starting at contextTime + effectContext.offset.
 *
 * Connects inputNode → GainNode → outputNode.
 * Returns the created GainNode for later cleanup.
 */
export function applyFadeInEffect(
  context: BaseAudioContext,
  effect: FadeInEffect,
  inputNode: AudioNode,
  outputNode: AudioNode,
  effectContext: { offset: number; duration: number },
  contextTime: number,
): GainNode {
  const gainNode = context.createGain();
  const startTime = contextTime + effectContext.offset;
  const endTime = startTime + effect.duration;

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(1, endTime);

  inputNode.connect(gainNode);
  gainNode.connect(outputNode);
  return gainNode;
}
