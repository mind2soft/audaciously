/**
 * synthWorker.ts — main-thread wrapper for the synth-processor Web Worker.
 *
 * Mirrors the pattern used by waveform.ts / waveform-processor.ts:
 * a single long-lived worker instance, promise-based API, cancellation via
 * per-track seqNums so rapid note edits only produce one final render.
 *
 * Usage
 * ─────
 *   const client = createSynthWorkerClient();
 *   const buffer: AudioBuffer = await client.render(track, sampleRate);
 *
 * The returned AudioBuffer can be handed directly to createAudioBufferSequence
 * and added to the player as a regular AudioTrack — no special treatment needed.
 */

import SynthWorker from "../../workers/synth-processor?worker";
import type {
  SynthRequest,
  SynthResponse,
  SynthError,
  SynthNote,
} from "../../workers/synth-processor";
import type { InstrumentTrack } from "./instrument-track";

// ─── Shared worker instance ───────────────────────────────────────────────────

// One worker is shared across all tracks (the worker serialises its own work
// and uses per-track cancellation to stay responsive).
const worker = new SynthWorker();

// ─── Pending promises ─────────────────────────────────────────────────────────

type PendingRender = {
  seqNum: number;
  resolve(buffer: AudioBuffer): void;
  reject(reason?: unknown): void;
};

/** trackId → latest pending promise */
const pending = new Map<string, PendingRender>();

// ─── Response handler ─────────────────────────────────────────────────────────

worker.addEventListener(
  "message",
  (evt: MessageEvent<SynthResponse | SynthError>) => {
    const data = evt.data;
    const entry = pending.get(data.trackId);

    // Ignore stale responses (superseded by a newer seqNum).
    if (!entry || entry.seqNum !== data.seqNum) return;

    pending.delete(data.trackId);

    if ("error" in data) {
      entry.reject(new Error((data as SynthError).error));
      return;
    }

    const response = data as SynthResponse;

    if (response.empty) {
      // Signal "nothing to play" via a rejected promise so the caller can
      // remove the AudioTrack from the player cleanly.
      entry.reject(new SynthEmptyTrackSignal());
      return;
    }

    // Assemble the AudioBuffer from the transferred Float32Arrays.
    // Use a detached OfflineAudioContext just to create the AudioBuffer with
    // the correct sample rate.  This is instantaneous (no rendering).
    const tmpCtx = new OfflineAudioContext(2, response.left.length, DEFAULT_SAMPLE_RATE);
    const audioBuffer = tmpCtx.createBuffer(2, response.left.length, DEFAULT_SAMPLE_RATE);
    audioBuffer.copyToChannel(response.left as Float32Array<ArrayBuffer>, 0);
    audioBuffer.copyToChannel(response.right as Float32Array<ArrayBuffer>, 1);

    entry.resolve(audioBuffer);
  }
);

// ─── Sentinel error class ─────────────────────────────────────────────────────

/**
 * Thrown (as a rejection) when a track has no notes to render.
 * useInstrumentPlayback checks for this to remove the AudioTrack.
 */
export class SynthEmptyTrackSignal extends Error {
  constructor() {
    super("synth: empty track");
    this.name = "SynthEmptyTrackSignal";
  }
}

// ─── Client interface & factory ───────────────────────────────────────────────

const DEFAULT_SAMPLE_RATE = 44100;

export interface SynthWorkerClient {
  /**
   * Render all notes in `track` into an AudioBuffer.
   *
   * If the track is empty, the promise rejects with `SynthEmptyTrackSignal`.
   * Any in-flight render for the same track is cancelled automatically.
   *
   * @param track       The instrument track to render.
   * @param sampleRate  Target sample rate (default 44100).
   */
  render(track: InstrumentTrack, sampleRate?: number): Promise<AudioBuffer>;
}

/** Per-client seqNum counters, keyed by trackId. */
const seqNums = new Map<string, number>();

function nextSeqNum(trackId: string): number {
  const n = (seqNums.get(trackId) ?? 0) + 1;
  seqNums.set(trackId, n);
  return n;
}

/**
 * Create a SynthWorkerClient.
 *
 * A single client instance is sufficient for the whole application; create
 * one at the composable level and reuse it across all tracks.
 */
export function createSynthWorkerClient(): SynthWorkerClient {
  return {
    render(track: InstrumentTrack, sampleRate = DEFAULT_SAMPLE_RATE): Promise<AudioBuffer> {
      const trackId = track.id;
      const seqNum = nextSeqNum(trackId);

      // Cancel (reject) any in-flight render for this track.
      const prev = pending.get(trackId);
      if (prev) {
        prev.reject(new Error("synth: superseded by newer render"));
        pending.delete(trackId);
      }

      return new Promise<AudioBuffer>((resolve, reject) => {
        pending.set(trackId, { seqNum, resolve, reject });

        const notes: SynthNote[] = track.notes.map((n) => ({
          id: n.id,
          pitchId: n.pitchId,
          startBeat: n.startBeat,
          durationBeats: n.durationBeats,
        }));

        const request: SynthRequest = {
          trackId,
          seqNum,
          instrumentId: track.instrumentId as import("../../workers/synth-processor").SynthInstrumentId,
          bpm: track.bpm,
          sampleRate,
          notes,
        };

        worker.postMessage(request);
      });
    },
  };
}
