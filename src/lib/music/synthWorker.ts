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
import type { MusicInstrumentType, InstrumentPitchKey } from "./instruments";
import type { AudioTrackID } from "../audio/track/track";
import type { PlacedNoteID } from "../../features/nodes/instrument/instrument-node";

// ─── Minimal render options ───────────────────────────────────────────────────

/**
 * The subset of an InstrumentAudioTrack that the synth worker actually needs.
 * Keeping this minimal avoids coupling synthWorker to the full track type.
 */
export interface SynthRenderOptions {
  trackId: AudioTrackID;
  instrumentType: MusicInstrumentType;
  bpm: number;
  notes: ReadonlyArray<{
    id: PlacedNoteID;
    pitchKey: InstrumentPitchKey;
    startBeat: number;
    durationBeats: number;
  }>;
  sampleRate?: number;
}

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
const pending = new Map<AudioTrackID, PendingRender>();

// ─── Response handler ─────────────────────────────────────────────────────────

worker.addEventListener(
  "message",
  (evt: MessageEvent<SynthResponse | SynthError>) => {
    const data = evt.data;
    const entry = pending.get(data.trackId);

    // Ignore stale responses (superseded by a newer seqNum).
    if (entry?.seqNum !== data.seqNum) return;

    pending.delete(data.trackId);

    if ("error" in data) {
      entry.reject(new Error(data.error));
      return;
    }

    if (data.empty) {
      // Signal "nothing to play" via a rejected promise so the caller can
      // remove the AudioTrack from the player cleanly.
      entry.reject(new SynthEmptyTrackSignal());
      return;
    }

    // Assemble the AudioBuffer from the transferred Float32Arrays.
    // Use a detached OfflineAudioContext just to create the AudioBuffer with
    // the correct sample rate.  This is instantaneous (no rendering).
    const tmpCtx = new OfflineAudioContext(
      2,
      data.left.length,
      DEFAULT_SAMPLE_RATE,
    );
    const audioBuffer = tmpCtx.createBuffer(
      2,
      data.left.length,
      DEFAULT_SAMPLE_RATE,
    );
    audioBuffer.copyToChannel(data.left as Float32Array<ArrayBuffer>, 0);
    audioBuffer.copyToChannel(data.right as Float32Array<ArrayBuffer>, 1);
    entry.resolve(audioBuffer);
  },
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
   * Render all notes in `options` into an AudioBuffer.
   *
   * If the track is empty, the promise rejects with `SynthEmptyTrackSignal`.
   * Any in-flight render for the same track is cancelled automatically.
   *
   * @param options     Minimal track data needed for synthesis.
   * @param sampleRate  Target sample rate (default 44100).
   */
  render(options: SynthRenderOptions): Promise<AudioBuffer>;
}

/** Per-client seqNum counters, keyed by trackId. */
const seqNums = new Map<AudioTrackID, number>();

function nextSeqNum(trackId: AudioTrackID): number {
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
    render(options: SynthRenderOptions): Promise<AudioBuffer> {
      const trackId = options.trackId;
      const seqNum = nextSeqNum(trackId);

      // Cancel (reject) any in-flight render for this track.
      const prev = pending.get(trackId);
      if (prev) {
        prev.reject(new Error("synth: superseded by newer render"));
        pending.delete(trackId);
      }

      return new Promise<AudioBuffer>((resolve, reject) => {
        pending.set(trackId, { seqNum, resolve, reject });

        const notes: SynthNote[] = options.notes.map((n) => ({
          id: n.id,
          pitchKey: n.pitchKey,
          startBeat: n.startBeat,
          durationBeats: n.durationBeats,
        }));

        const request: SynthRequest = {
          trackId,
          seqNum,
          instrumentType: options.instrumentType,
          bpm: options.bpm,
          sampleRate: options.sampleRate ?? DEFAULT_SAMPLE_RATE,
          notes,
        };

        worker.postMessage(request);
      });
    },
  };
}
