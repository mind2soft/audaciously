// features/effects/apply-effects.ts
// applyEffectChain — applies an ordered list of effects to a WebAudio graph.
// See: .opencode/context/refactor/05-audio-effects.md

import { applyBalanceEffect } from "./balance";
import { applyFadeInEffect } from "./fade-in";
import { applyFadeOutEffect } from "./fade-out";
import { applyGainEffect } from "./gain";
import type { AudioEffect } from "./types";

/**
 * Applies a list of effects to a WebAudio graph by chaining them between
 * inputNode and outputNode.
 *
 * Only enabled effects are applied. The chain is built in array order, so
 * the first effect receives input directly from inputNode.
 *
 * @param context       The active AudioContext.
 * @param inputNode     The source node to apply effects to.
 * @param outputNode    The destination node.
 * @param effects       Ordered list of effects to apply.
 * @param effectContext Playback offset and total duration (seconds).
 * @param contextTime   The AudioContext.currentTime at playback start.
 * @returns             All created WebAudio nodes (disconnect + null them on stop).
 */
export function applyEffectChain(
  context: BaseAudioContext,
  inputNode: AudioNode,
  outputNode: AudioNode,
  effects: AudioEffect[],
  effectContext: { offset: number; duration: number },
  contextTime: number,
): AudioNode[] {
  const enabled = effects.filter((e) => e.enabled);

  if (enabled.length === 0) {
    inputNode.connect(outputNode);
    return [];
  }

  const createdNodes: AudioNode[] = [];

  // Build the chain: inputNode → node₀ → node₁ → … → outputNode
  // We thread `prev` through, starting with inputNode.
  let prev: AudioNode = inputNode;

  for (let i = 0; i < enabled.length; i++) {
    const effect = enabled[i];
    const next: AudioNode = i === enabled.length - 1 ? outputNode : context.createGain();

    // The individual apply-* functions connect prev → effectNode → next internally,
    // but for non-terminal nodes we need to be careful: they all connect to `next`
    // which is a plain passthrough GainNode. We thread them manually instead.

    switch (effect.type) {
      case "gain": {
        const node = applyGainEffect(context, effect, prev, next);
        createdNodes.push(node);
        break;
      }
      case "balance": {
        const node = applyBalanceEffect(context, effect, prev, next);
        createdNodes.push(node);
        break;
      }
      case "fadeIn": {
        const node = applyFadeInEffect(context, effect, prev, next, effectContext, contextTime);
        createdNodes.push(node);
        break;
      }
      case "fadeOut": {
        const node = applyFadeOutEffect(context, effect, prev, next, effectContext, contextTime);
        createdNodes.push(node);
        break;
      }
      case "split":
      case "volume":
        // Not yet wired into WebAudio — pass-through for now
        prev.connect(next);
        break;
    }

    if (next !== outputNode) {
      // `next` is an intermediate passthrough GainNode we created above —
      // track it for cleanup and advance prev.
      createdNodes.push(next);
      prev = next;
    }
  }

  return createdNodes;
}
