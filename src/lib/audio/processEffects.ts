/**
 * processEffects.ts — unified main-thread client for effect processing.
 *
 * ONE worker instance, ONE exported function. Internally routes to the
 * single-shot or chunked protocol based on buffer duration.
 *
 * Cancellation is via AbortSignal — aborting rejects the promise and
 * ignores any later worker response. The worker uses an internal seqNum
 * to skip stale processing (optimisation only).
 *
 * Usage:
 *   const buffer = await processEffects(source, effects, signal);
 */

import type { AudioEffect } from "../../features/effects/types";
import type {
  ChunkContinueRequest,
  ChunkFinalizeRequest,
  ChunkInitRequest,
  ChunkResponse,
  EffectProcessError,
  EffectProcessRequest,
  EffectProcessResponse,
} from "../../workers/effect-processor";
import EffectWorker from "../../workers/effect-processor?worker";

// ─── Single shared worker instance ────────────────────────────────────────────

const worker = new EffectWorker();

// ─── Internal seqNum (passed to worker so it can skip stale processing) ───────

let seqCounter = 0;

// ─── Configuration ────────────────────────────────────────────────────────────

/** Buffers shorter than this use the single-shot path. */
const CHUNK_THRESHOLD_SEC = 30;
const CHUNK_DURATION_SEC = 10;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Process `source` through the effect pipeline in a Web Worker.
 *
 * Automatically uses single-shot for short buffers (<30s) and chunked
 * processing for long buffers (≥30s) — this is an internal implementation
 * detail, not an API boundary.
 *
 * @param source           The unprocessed AudioBuffer.
 * @param effects          Ordered effect list.
 * @param signal           AbortSignal — abort to cancel and reject.
 * @param nodeId           Unique node identifier — the worker uses this for
 *                         per-node seqNum cancellation so concurrent nodes
 *                         don't cancel each other.
 * @param pristineChannels Optional pristine Float32Array[] snapshots to use
 *                         instead of source.getChannelData() — immune to
 *                         browser-level AudioBuffer sample data corruption.
 * @returns                Processed AudioBuffer with effects baked in.
 */
export function processEffects(
  source: AudioBuffer,
  effects: AudioEffect[],
  signal: AbortSignal,
  nodeId = "effect-pipeline",
  pristineChannels?: Float32Array[],
): Promise<AudioBuffer> {
  signal.throwIfAborted();

  if (source.duration < CHUNK_THRESHOLD_SEC) {
    return singleShot(source, effects, signal, nodeId, pristineChannels);
  }
  return chunked(source, effects, signal, nodeId, pristineChannels);
}

// ─── Single-shot (short buffers) ──────────────────────────────────────────────

function singleShot(
  source: AudioBuffer,
  effects: AudioEffect[],
  signal: AbortSignal,
  nodeId: string,
  pristineChannels?: Float32Array[],
): Promise<AudioBuffer> {
  const seqNum = ++seqCounter;
  const sampleRate = source.sampleRate;
  const numChannels = source.numberOfChannels;

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(new Float32Array(pristineChannels?.[ch] ?? source.getChannelData(ch)));
  }

  return new Promise<AudioBuffer>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    function onMessage(evt: MessageEvent<EffectProcessResponse | EffectProcessError>): void {
      const data = evt.data;
      if (data.seqNum !== seqNum) return;

      cleanup();

      if ("error" in data) {
        reject(new Error(data.error));
        return;
      }

      const length = data.channels[0]?.length ?? 0;
      const tmpCtx = new OfflineAudioContext(numChannels, length, sampleRate);
      const audioBuffer = tmpCtx.createBuffer(numChannels, length, sampleRate);
      for (let ch = 0; ch < numChannels; ch++) {
        audioBuffer.copyToChannel(data.channels[ch] as Float32Array<ArrayBuffer>, ch);
      }
      resolve(audioBuffer);
    }

    function cleanup(): void {
      worker.removeEventListener("message", onMessage);
      signal.removeEventListener("abort", onAbort);
    }

    worker.addEventListener("message", onMessage);

    const request: EffectProcessRequest = {
      nodeId,
      seqNum,
      channels,
      sampleRate,
      effects,
    };
    worker.postMessage(request, { transfer: channels.map((c) => c.buffer) });
  });
}

// ─── Chunked (long buffers) ───────────────────────────────────────────────────

function chunked(
  source: AudioBuffer,
  effects: AudioEffect[],
  signal: AbortSignal,
  nodeId: string,
  pristineChannels?: Float32Array[],
): Promise<AudioBuffer> {
  const seqNum = ++seqCounter;
  const sampleRate = source.sampleRate;
  const numChannels = source.numberOfChannels;
  const totalSamples = source.length;
  const totalDuration = source.duration;
  const chunkSizeSamples = Math.floor(CHUNK_DURATION_SEC * sampleRate);
  const numChunks = Math.ceil(totalSamples / chunkSizeSamples);

  return new Promise<AudioBuffer>((resolve, reject) => {
    const processedChunks: (Float32Array[] | undefined)[] = Array.from({ length: numChunks });
    let nextChunkToSend = 0;

    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    function onMessage(evt: MessageEvent<ChunkResponse | EffectProcessError>): void {
      const data = evt.data;
      if (data.seqNum !== seqNum) return;

      if ("error" in data) {
        cleanup();
        reject(new Error(data.error));
        return;
      }

      if (data.type !== "chunk-response") return;

      processedChunks[data.chunkIndex] = data.channels;

      if (processedChunks.every((c) => c !== undefined)) {
        cleanup();
        resolve(
          stitchChunks(processedChunks as Float32Array[][], numChannels, totalSamples, sampleRate),
        );
        return;
      }

      sendNextChunk();
    }

    function cleanup(): void {
      worker.removeEventListener("message", onMessage);
      signal.removeEventListener("abort", onAbort);
    }

    function extractChunk(chunkIndex: number): Float32Array[] {
      const start = chunkIndex * chunkSizeSamples;
      const end = Math.min(start + chunkSizeSamples, totalSamples);
      const len = end - start;
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < numChannels; ch++) {
        if (pristineChannels?.[ch]) {
          // Use pristine data — immune to browser-level corruption.
          channels.push(pristineChannels[ch].slice(start, end));
        } else {
          const slice = new Float32Array(len);
          source.copyFromChannel(slice, ch, start);
          channels.push(slice);
        }
      }
      return channels;
    }

    function sendNextChunk(): void {
      if (signal.aborted) return;
      if (nextChunkToSend >= numChunks) return;

      const chunkIndex = nextChunkToSend++;
      const channels = extractChunk(chunkIndex);
      const isFirst = chunkIndex === 0;
      const isLast = chunkIndex === numChunks - 1;

      if (isFirst) {
        const req: ChunkInitRequest = {
          type: "chunk-init",
          nodeId,
          seqNum,
          effects,
          sampleRate,
          totalDuration,
          totalSamples,
          chunkIndex,
          channels,
        };
        worker.postMessage(req, { transfer: channels.map((c) => c.buffer) });
      } else if (isLast) {
        const req: ChunkFinalizeRequest = {
          type: "chunk-finalize",
          nodeId,
          seqNum,
          chunkIndex,
          channels,
        };
        worker.postMessage(req, { transfer: channels.map((c) => c.buffer) });
      } else {
        const req: ChunkContinueRequest = {
          type: "chunk-continue",
          nodeId,
          seqNum,
          chunkIndex,
          channels,
        };
        worker.postMessage(req, { transfer: channels.map((c) => c.buffer) });
      }
    }

    worker.addEventListener("message", onMessage);
    sendNextChunk();
  });
}

// ─── Stitching ────────────────────────────────────────────────────────────────

function stitchChunks(
  chunks: Float32Array[][],
  numChannels: number,
  totalSamples: number,
  sampleRate: number,
): AudioBuffer {
  const ctx = new OfflineAudioContext(numChannels, totalSamples, sampleRate);
  const buffer = ctx.createBuffer(numChannels, totalSamples, sampleRate);
  let offset = 0;

  for (const chunk of chunks) {
    const chunkLen = chunk[0]?.length ?? 0;
    for (let ch = 0; ch < numChannels; ch++) {
      buffer.copyToChannel(chunk[ch] as Float32Array<ArrayBuffer>, ch, offset);
    }
    offset += chunkLen;
  }

  return buffer;
}
