/**
 * effect-processor.ts — Web Worker
 *
 * Processes an audio effect pipeline on raw Float32Array channel data using
 * pure DSP math (no Web Audio API — workers have no access to it).
 *
 * Architecture
 * ────────────
 * • Each effect type has an independent DSP module under
 *   features/effects/dsp/ — pure functions operating on Float32Array[].
 *
 * • The pipeline orchestrator (dsp/pipeline.ts) chains them in order,
 *   checking for cancellation between stages.
 *
 * • Cancellation uses per-node seqNum — a newer request for the same nodeId
 *   causes any in-progress render to bail out.
 *
 * • Result Float32Arrays are transferred (zero-copy) back to the main thread.
 *
 * Message protocol
 * ────────────────
 * Main → Worker:  EffectProcessRequest  |  ChunkInitRequest | ChunkContinueRequest | ChunkFinalizeRequest
 * Worker → Main:  EffectProcessResponse |  EffectProcessError | ChunkResponse
 */

import { processEffectPipeline } from "../features/effects/dsp/pipeline";
import type { PipelineState } from "../features/effects/dsp/types";
import {
  createChunkContext,
  createPipelineState,
  createSingleShotContext,
} from "../features/effects/dsp/types";
import type { AudioEffect } from "../features/effects/types";

// ─── Single-shot protocol types (also imported by the main-thread wrapper) ────

export interface EffectProcessRequest {
  nodeId: string;
  seqNum: number;
  /** One Float32Array per channel (transferred — ownership moves to worker). */
  channels: Float32Array[];
  sampleRate: number;
  effects: AudioEffect[];
}

export interface EffectProcessResponse {
  nodeId: string;
  seqNum: number;
  /** Processed channel data (transferred back — zero-copy). */
  channels: Float32Array[];
}

export interface EffectProcessError {
  nodeId: string;
  seqNum: number;
  error: string;
}

// ─── Chunked protocol types ───────────────────────────────────────────────────

/** Initialise a chunked session — sends effects config + first chunk. */
export interface ChunkInitRequest {
  type: "chunk-init";
  nodeId: string;
  seqNum: number;
  effects: AudioEffect[];
  sampleRate: number;
  totalDuration: number;
  totalSamples: number;
  chunkIndex: number;
  channels: Float32Array[];
}

/** Continue — sends next chunk, worker resumes from held state. */
export interface ChunkContinueRequest {
  type: "chunk-continue";
  nodeId: string;
  seqNum: number;
  chunkIndex: number;
  channels: Float32Array[];
}

/** Finalize — sends last chunk, worker clears state after processing. */
export interface ChunkFinalizeRequest {
  type: "chunk-finalize";
  nodeId: string;
  seqNum: number;
  chunkIndex: number;
  channels: Float32Array[];
}

/** Response for all chunk message types. */
export interface ChunkResponse {
  type: "chunk-response";
  nodeId: string;
  seqNum: number;
  chunkIndex: number;
  channels: Float32Array[];
}

export type ChunkRequest = ChunkInitRequest | ChunkContinueRequest | ChunkFinalizeRequest;

// ─── Per-node state ───────────────────────────────────────────────────────────

/** Tracks the highest seqNum received per nodeId. */
const latestSeqNum = new Map<string, number>();

function isCancelled(nodeId: string, seqNum: number): boolean {
  return (latestSeqNum.get(nodeId) ?? 0) > seqNum;
}

/** Active chunked sessions keyed by nodeId. */
interface ChunkSession {
  effects: AudioEffect[];
  sampleRate: number;
  totalDuration: number;
  totalSamples: number;
  chunkSize: number;
  state: PipelineState;
  seqNum: number;
}

const chunkSessions = new Map<string, ChunkSession>();

// ─── Input validation ─────────────────────────────────────────────────────────

function isValidRequest(msg: unknown): msg is EffectProcessRequest {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.nodeId === "string" &&
    typeof m.seqNum === "number" &&
    Array.isArray(m.channels) &&
    typeof m.sampleRate === "number" &&
    Array.isArray(m.effects) &&
    !("type" in m) // distinguish from chunk messages
  );
}

function isChunkRequest(msg: unknown): msg is ChunkRequest {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.type === "string" &&
    (m.type === "chunk-init" || m.type === "chunk-continue" || m.type === "chunk-finalize")
  );
}

// ─── Single-shot handler ──────────────────────────────────────────────────────

function handleSingleShot(req: EffectProcessRequest): void {
  const { nodeId, seqNum, channels, sampleRate, effects } = req;

  latestSeqNum.set(nodeId, Math.max(latestSeqNum.get(nodeId) ?? 0, seqNum));
  if (isCancelled(nodeId, seqNum)) return;

  const duration = (channels[0]?.length ?? 0) / sampleRate;
  const ctx = createSingleShotContext(sampleRate, duration);

  try {
    const result = processEffectPipeline(channels, effects, ctx, () => isCancelled(nodeId, seqNum));

    if (!result.completed) return;

    const response: EffectProcessResponse = { nodeId, seqNum, channels };
    self.postMessage(response, {
      transfer: channels.map((c) => c.buffer),
    });
  } catch (err) {
    const errResponse: EffectProcessError = {
      nodeId,
      seqNum,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errResponse);
  }
}

// ─── Chunked handler ──────────────────────────────────────────────────────────

function handleChunkInit(req: ChunkInitRequest): void {
  const { nodeId, seqNum, effects, sampleRate, totalDuration, totalSamples, chunkIndex, channels } =
    req;

  latestSeqNum.set(nodeId, Math.max(latestSeqNum.get(nodeId) ?? 0, seqNum));

  // Clear any stale session for this node.
  chunkSessions.delete(nodeId);

  if (isCancelled(nodeId, seqNum)) return;

  const chunkSize = channels[0]?.length ?? 0;
  const session: ChunkSession = {
    effects,
    sampleRate,
    totalDuration,
    totalSamples,
    chunkSize,
    state: createPipelineState(),
    seqNum,
  };
  chunkSessions.set(nodeId, session);

  processChunk(nodeId, seqNum, chunkIndex, channels, session);
}

function handleChunkContinue(req: ChunkContinueRequest | ChunkFinalizeRequest): void {
  const { nodeId, seqNum, chunkIndex, channels } = req;

  latestSeqNum.set(nodeId, Math.max(latestSeqNum.get(nodeId) ?? 0, seqNum));
  if (isCancelled(nodeId, seqNum)) {
    chunkSessions.delete(nodeId);
    return;
  }

  const session = chunkSessions.get(nodeId);
  if (!session || session.seqNum !== seqNum) {
    chunkSessions.delete(nodeId);
    return;
  }

  processChunk(nodeId, seqNum, chunkIndex, channels, session);

  // Finalize: clear session state after last chunk.
  if (req.type === "chunk-finalize") {
    chunkSessions.delete(nodeId);
  }
}

function processChunk(
  nodeId: string,
  seqNum: number,
  chunkIndex: number,
  channels: Float32Array[],
  session: ChunkSession,
): void {
  const chunkLen = channels[0]?.length ?? 0;
  const globalOffset = (chunkIndex * session.chunkSize) / session.sampleRate;
  const chunkDuration = chunkLen / session.sampleRate;

  const ctx = createChunkContext(
    session.sampleRate,
    chunkDuration,
    globalOffset,
    session.totalDuration,
  );

  try {
    const result = processEffectPipeline(
      channels,
      session.effects,
      ctx,
      () => isCancelled(nodeId, seqNum),
      session.state,
    );

    if (!result.completed) {
      chunkSessions.delete(nodeId);
      return;
    }

    session.state = result.state;

    const response: ChunkResponse = {
      type: "chunk-response",
      nodeId,
      seqNum,
      chunkIndex,
      channels,
    };
    self.postMessage(response, {
      transfer: channels.map((c) => c.buffer),
    });
  } catch (err) {
    chunkSessions.delete(nodeId);
    const errResponse: EffectProcessError = {
      nodeId,
      seqNum,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errResponse);
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.addEventListener("message", (evt: MessageEvent) => {
  const req = evt.data;

  if (isChunkRequest(req)) {
    if (req.type === "chunk-init") handleChunkInit(req);
    else handleChunkContinue(req);
    return;
  }

  if (isValidRequest(req)) {
    handleSingleShot(req);
    return;
  }

  const errResponse: EffectProcessError = {
    nodeId: String((req as Record<string, unknown>)?.nodeId ?? "unknown"),
    seqNum: Number((req as Record<string, unknown>)?.seqNum ?? 0),
    error: "Invalid message payload.",
  };
  self.postMessage(errResponse);
});

export default null;
