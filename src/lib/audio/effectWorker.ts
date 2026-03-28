/**
 * effectWorker.ts — main-thread wrapper for the effect-processor Web Worker.
 *
 * Mirrors the pattern used by synthWorker.ts:
 * a single long-lived worker instance, promise-based API, cancellation via
 * per-node seqNums so rapid effect edits only produce one final render.
 *
 * Additionally provides an optional debounce: when the same nodeId is
 * submitted again within `debounceMs`, the previous timer is cleared and
 * only the latest request is dispatched to the worker.
 *
 * Usage
 * ─────
 *   const client = createEffectWorkerClient();
 *   const buffer: AudioBuffer = await client.process(sourceBuffer, effects, nodeId);
 *
 * The returned AudioBuffer can be stored directly as `targetBuffer`.
 */

import type { AudioEffect } from "../../features/effects/types";
import type {
  EffectProcessError,
  EffectProcessRequest,
  EffectProcessResponse,
} from "../../workers/effect-processor";
import EffectWorker from "../../workers/effect-processor?worker";

// ─── Shared worker instance ───────────────────────────────────────────────────

const worker = new EffectWorker();

// ─── Pending promises ─────────────────────────────────────────────────────────

interface PendingProcess {
  seqNum: number;
  resolve(buffer: AudioBuffer): void;
  reject(reason?: unknown): void;
}

/** nodeId → latest pending promise. */
const pending = new Map<string, PendingProcess>();

// ─── Response handler ─────────────────────────────────────────────────────────

worker.addEventListener(
  "message",
  (evt: MessageEvent<EffectProcessResponse | EffectProcessError>) => {
    const data = evt.data;
    const entry = pending.get(data.nodeId);

    // Ignore stale responses (superseded by a newer seqNum).
    if (entry?.seqNum !== data.seqNum) return;

    pending.delete(data.nodeId);

    if ("error" in data) {
      entry.reject(new Error(data.error));
      return;
    }

    // Reassemble Float32Arrays into an AudioBuffer.
    // Use a temporary OfflineAudioContext just to construct the buffer with
    // the correct sample rate.  This is instantaneous (no rendering).
    const numChannels = data.channels.length;
    const length = data.channels[0]?.length ?? 0;
    // We need a sampleRate — it was sent in the request but is not echoed back.
    // Store it alongside the pending entry (see process() below).
    const sampleRate = (entry as PendingProcessInternal).sampleRate;

    const tmpCtx = new OfflineAudioContext(numChannels, length, sampleRate);
    const audioBuffer = tmpCtx.createBuffer(numChannels, length, sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      audioBuffer.copyToChannel(data.channels[ch] as Float32Array<ArrayBuffer>, ch);
    }
    entry.resolve(audioBuffer);
  },
);

// ─── Internal type with sampleRate ────────────────────────────────────────────

interface PendingProcessInternal extends PendingProcess {
  sampleRate: number;
}

// ─── Debounce timers ──────────────────────────────────────────────────────────

/** nodeId → debounce timeout handle. */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── SeqNum counters ──────────────────────────────────────────────────────────

const seqNums = new Map<string, number>();

function nextSeqNum(nodeId: string): number {
  const n = (seqNums.get(nodeId) ?? 0) + 1;
  seqNums.set(nodeId, n);
  return n;
}

// ─── Client interface & factory ───────────────────────────────────────────────

export interface EffectWorkerClient {
  /**
   * Process `source` through the effect pipeline in a Web Worker.
   *
   * @param source     The unprocessed AudioBuffer.
   * @param effects    Ordered effect list.
   * @param nodeId     Unique node identifier (for cancellation/debounce).
   * @param debounceMs Delay before dispatching to the worker (default 0 — immediate).
   *                   Rapid calls within this window coalesce into one worker dispatch.
   * @returns          Processed AudioBuffer with effects baked in.
   *
   * If a newer request arrives for the same nodeId before the worker responds,
   * the previous promise is rejected with a superseded error.
   */
  process(
    source: AudioBuffer,
    effects: AudioEffect[],
    nodeId: string,
    debounceMs?: number,
  ): Promise<AudioBuffer>;
}

/**
 * Create an EffectWorkerClient.
 *
 * A single client instance is sufficient for the whole application — the
 * underlying worker uses per-node seqNum cancellation to handle rapid edits.
 */
export function createEffectWorkerClient(): EffectWorkerClient {
  return {
    process(
      source: AudioBuffer,
      effects: AudioEffect[],
      nodeId: string,
      debounceMs = 0,
    ): Promise<AudioBuffer> {
      const seqNum = nextSeqNum(nodeId);

      // Cancel (reject) any in-flight request for this node.
      const prev = pending.get(nodeId);
      if (prev) {
        prev.reject(new Error("effect-processor: superseded by newer request"));
        pending.delete(nodeId);
      }

      // Clear any pending debounce timer.
      const prevTimer = debounceTimers.get(nodeId);
      if (prevTimer !== undefined) {
        clearTimeout(prevTimer);
        debounceTimers.delete(nodeId);
      }

      // Clone channel data for transfer (getChannelData returns a reference
      // into the AudioBuffer's internal storage — we must not detach it).
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < source.numberOfChannels; ch++) {
        channels.push(new Float32Array(source.getChannelData(ch)));
      }

      const sampleRate = source.sampleRate;

      return new Promise<AudioBuffer>((resolve, reject) => {
        const entry: PendingProcessInternal = {
          seqNum,
          sampleRate,
          resolve,
          reject,
        };
        pending.set(nodeId, entry);

        const dispatch = () => {
          debounceTimers.delete(nodeId);

          // Verify this is still the latest request after the debounce wait.
          if ((seqNums.get(nodeId) ?? 0) > seqNum) return;

          const request: EffectProcessRequest = {
            nodeId,
            seqNum,
            channels,
            sampleRate,
            effects,
          };

          worker.postMessage(request, {
            transfer: channels.map((c) => c.buffer),
          });
        };

        if (debounceMs > 0) {
          debounceTimers.set(nodeId, setTimeout(dispatch, debounceMs));
        } else {
          dispatch();
        }
      });
    },
  };
}
