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
 * Main → Worker:  EffectProcessRequest
 * Worker → Main:  EffectProcessResponse  |  EffectProcessError
 */

import { processEffectPipeline } from "../features/effects/dsp/pipeline";
import type { AudioEffect } from "../features/effects/types";

// ─── Protocol types (also imported by the main-thread wrapper) ────────────────

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

// ─── Per-node cancellation ────────────────────────────────────────────────────

/** Tracks the highest seqNum received per nodeId. */
const latestSeqNum = new Map<string, number>();

function isCancelled(nodeId: string, seqNum: number): boolean {
  return (latestSeqNum.get(nodeId) ?? 0) > seqNum;
}

// ─── Input validation ─────────────────────────────────────────────────────────

function isValidRequest(msg: unknown): msg is EffectProcessRequest {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.nodeId === "string" &&
    typeof m.seqNum === "number" &&
    Array.isArray(m.channels) &&
    typeof m.sampleRate === "number" &&
    Array.isArray(m.effects)
  );
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.addEventListener("message", (evt: MessageEvent) => {
  const req = evt.data;

  if (!isValidRequest(req)) {
    const errResponse: EffectProcessError = {
      nodeId: String((req as Record<string, unknown>)?.nodeId ?? "unknown"),
      seqNum: Number((req as Record<string, unknown>)?.seqNum ?? 0),
      error: "Invalid EffectProcessRequest message payload.",
    };
    self.postMessage(errResponse);
    return;
  }

  const { nodeId, seqNum, channels, sampleRate, effects } = req;

  // Register as latest — any in-progress render for a lower seqNum bails out.
  latestSeqNum.set(nodeId, Math.max(latestSeqNum.get(nodeId) ?? 0, seqNum));

  // Already superseded before we even started.
  if (isCancelled(nodeId, seqNum)) return;

  const duration = (channels[0]?.length ?? 0) / sampleRate;
  const ctx = { sampleRate, duration, offset: 0 };

  try {
    const completed = processEffectPipeline(channels, effects, ctx, () =>
      isCancelled(nodeId, seqNum),
    );

    // Cancelled mid-pipeline — discard silently.
    if (!completed) return;

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
});

export default null;
