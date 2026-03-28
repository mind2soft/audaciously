// features/effects/dsp/pipeline.ts
// Pure-DSP effect pipeline — processes an ordered list of effects on raw
// Float32Array channel data.  No Web Audio API dependency.
//
// Runs entirely in a synchronous loop (designed for a Web Worker).
// Returns a PipelineResult with completion status and updated state.

import type { AudioEffect } from "../types";
import { processBalanceEffect } from "./balance";
import { processFadeInEffect } from "./fade-in";
import { processFadeOutEffect } from "./fade-out";
import { processGainEffect } from "./gain";
import { processSplitEffect } from "./split";
import type { DspContext, PipelineResult, PipelineState } from "./types";
import { createPipelineState } from "./types";
import { processVolumeEffect } from "./volume";

/**
 * Process a full effect pipeline on the given channel data (in-place).
 *
 * @param channels     Mutable Float32Array per channel.
 * @param effects      Ordered effect list (only enabled effects are applied).
 * @param ctx          Sample rate, duration, offset, globalOffset, totalDuration.
 * @param isCancelled  Checked between effects and inside long-running effects
 *                     (volume automation).  Return `true` to abort.
 * @param state        Pipeline state from the previous chunk (null for first
 *                     chunk or single-shot processing).
 * @returns            Completion status and updated pipeline state.
 */
export function processEffectPipeline(
  channels: Float32Array[],
  effects: AudioEffect[],
  ctx: DspContext,
  isCancelled: () => boolean,
  state?: PipelineState | null,
): PipelineResult {
  const currentState = state ?? createPipelineState();
  const enabled = effects.filter((e) => e.enabled);

  for (const effect of enabled) {
    if (isCancelled()) return { completed: false, state: currentState };

    switch (effect.type) {
      case "gain":
        processGainEffect(channels, effect, ctx);
        break;
      case "balance":
        processBalanceEffect(channels, effect, ctx);
        break;
      case "fadeIn":
        processFadeInEffect(channels, effect, ctx);
        break;
      case "fadeOut":
        processFadeOutEffect(channels, effect, ctx);
        break;
      case "volume":
        if (!processVolumeEffect(channels, effect, ctx, isCancelled))
          return { completed: false, state: currentState };
        break;
      case "split":
        if (!processSplitSubPipeline(channels, effect, ctx, isCancelled, currentState))
          return { completed: false, state: currentState };
        break;
    }
  }

  return { completed: true, state: currentState };
}

/**
 * Internal helper for split — runs sub-pipelines for L/R channels.
 * Threads the same PipelineState through both sub-chains.
 */
function processSplitSubPipeline(
  channels: Float32Array[],
  effect: Extract<AudioEffect, { type: "split" }>,
  ctx: DspContext,
  isCancelled: () => boolean,
  state: PipelineState,
): boolean {
  return processSplitEffect(channels, effect, ctx, isCancelled, (ch, fx, c, cancel) => {
    const result = processEffectPipeline(ch, fx, c, cancel, state);
    return result.completed;
  });
}
