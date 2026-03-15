// features/effects/balance.ts
// BalanceEffect factory and WebAudio wiring.
// See: .opencode/context/refactor/05-audio-effects.md
//
// Uses StereoBalanceNode (src/lib/audio/node/StereoBalanceNode.ts) which
// models balance (equal-power cross-fade between L/R) rather than panning.

import { nanoid } from "nanoid";
import type { BalanceEffect } from "./types";
import createStereoBalanceNode, {
  type StereoBalanceNode,
} from "../../lib/audio/node/StereoBalanceNode";

/** Create a new BalanceEffect with defaults. */
export function createBalanceEffect(id?: string): BalanceEffect {
  return {
    id: id ?? nanoid(),
    type: "balance",
    enabled: true,
    value: 0,
  };
}

/**
 * Wire a BalanceEffect into a WebAudio graph.
 * Connects inputNode → StereoBalanceNode → outputNode.
 * Returns the created StereoBalanceNode for later cleanup.
 */
export function applyBalanceEffect(
  context: BaseAudioContext,
  effect: BalanceEffect,
  inputNode: AudioNode,
  outputNode: AudioNode,
): StereoBalanceNode {
  const balanceNode = createStereoBalanceNode(context, { balance: effect.value });
  inputNode.connect(balanceNode);
  balanceNode.connect(outputNode);
  return balanceNode;
}
