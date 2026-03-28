// features/effects/dsp/pipeline.ts
// Pure-DSP effect pipeline — processes an ordered list of effects on raw
// Float32Array channel data.  No Web Audio API dependency.
//
// Runs entirely in a synchronous loop (designed for a Web Worker).
// Returns false when cancelled so the caller can discard the buffer.

import type { AudioEffect } from "../types";
import { processBalanceEffect } from "./balance";
import { processFadeInEffect } from "./fade-in";
import { processFadeOutEffect } from "./fade-out";
import { processGainEffect } from "./gain";
import { processSplitEffect } from "./split";
import type { DspContext } from "./types";
import { processVolumeEffect } from "./volume";

/**
 * Process a full effect pipeline on the given channel data (in-place).
 *
 * @param channels     Mutable Float32Array per channel.
 * @param effects      Ordered effect list (only enabled effects are applied).
 * @param ctx          Sample rate, duration, offset.
 * @param isCancelled  Checked between effects and inside long-running effects
 *                     (volume automation).  Return `true` to abort.
 * @returns `true` if the pipeline completed, `false` if cancelled.
 */
export function processEffectPipeline(
  channels: Float32Array[],
  effects: AudioEffect[],
  ctx: DspContext,
  isCancelled: () => boolean,
): boolean {
  const enabled = effects.filter((e) => e.enabled);

  for (const effect of enabled) {
    if (isCancelled()) return false;

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
        if (!processVolumeEffect(channels, effect, ctx, isCancelled)) return false;
        break;
      case "split":
        if (!processSplitEffect(channels, effect, ctx, isCancelled, processEffectPipeline))
          return false;
        break;
    }
  }

  return true;
}
