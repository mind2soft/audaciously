// features/effects/gain.ts
// GainEffect factory and WebAudio wiring.
// See: .opencode/context/refactor/05-audio-effects.md

import { nanoid } from "nanoid";
import type { GainEffect } from "./types";

/** Create a new GainEffect with defaults. */
export function createGainEffect(id?: string): GainEffect {
  return {
    id: id ?? nanoid(),
    type: "gain",
    enabled: true,
    value: 1,
  };
}

/**
 * Wire a GainEffect into a WebAudio graph.
 * Connects inputNode → GainNode → outputNode.
 * Returns the created GainNode for later cleanup.
 */
export function applyGainEffect(
  context: BaseAudioContext,
  effect: GainEffect,
  inputNode: AudioNode,
  outputNode: AudioNode,
): GainNode {
  const gainNode = context.createGain();
  gainNode.gain.value = effect.value;
  inputNode.connect(gainNode);
  gainNode.connect(outputNode);
  return gainNode;
}
