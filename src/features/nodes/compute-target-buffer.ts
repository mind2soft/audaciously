// features/nodes/compute-target-buffer.ts
// computeTargetBuffer — pre-bakes effects into an AudioBuffer via the
// effect-processor Web Worker (pure-DSP, off–main-thread).
//
// Delegates to processEffects which internally routes to single-shot or
// chunked processing based on buffer duration.
//
// Defensive copy: even with no effects enabled, a separate buffer is returned
// so downstream consumers can never mutate the original sourceBuffer.

import { processEffects } from "../../lib/audio/processEffects";
import type { AudioEffect } from "../effects/types";

/**
 * Pre-bake all enabled effects into a new AudioBuffer using the
 * effect-processor Web Worker (runs entirely off the main thread).
 *
 * Returns a defensive copy when no effects are enabled (zero-copy).
 *
 * @param source           The original (unprocessed) AudioBuffer.
 * @param effects          The effect chain to bake in.
 * @param signal           AbortSignal — abort to cancel processing.
 * @param nodeId           Unique node identifier — forwarded to the worker for
 *                         per-node seqNum cancellation so concurrent nodes
 *                         don't interfere.
 * @param pristineChannels Optional pristine Float32Array[] snapshots to use
 *                         instead of source.getChannelData() — immune to
 *                         browser-level AudioBuffer sample data corruption.
 * @returns                Processed AudioBuffer with effects applied.
 */
export async function computeTargetBuffer(
  source: AudioBuffer,
  effects: AudioEffect[],
  signal: AbortSignal,
  nodeId?: string,
  pristineChannels?: Float32Array[],
): Promise<AudioBuffer> {
  signal.throwIfAborted();

  const enabled = effects.filter((e) => e.enabled);

  // Defensive copy: even with no effects we must return a separate buffer so
  // that downstream consumers can never mutate the original sourceBuffer.
  if (enabled.length === 0) {
    const { numberOfChannels, length, sampleRate } = source;
    const ctx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    const copy = ctx.createBuffer(numberOfChannels, length, sampleRate);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      copy.copyToChannel(
        (pristineChannels?.[ch] ?? source.getChannelData(ch)) as Float32Array<ArrayBuffer>,
        ch,
      );
    }
    return copy;
  }

  return processEffects(source, enabled, signal, nodeId, pristineChannels);
}
