/**
 * synth-processor.ts — Web Worker
 *
 * Renders instrument track notes into stereo Float32Array buffers using pure
 * DSP math (no Web Audio API — workers have no access to it).
 *
 * Architecture
 * ────────────
 * • InstrumentEngine  — pluggable interface: today two DSP engines (piano,
 *   drums), tomorrow sample-based engines that load real audio files.
 *   Swapping an engine out requires no changes to the worker protocol.
 *
 * • Per-note cache    — each rendered note is stored in a Map keyed by a
 *   fingerprint: "${instrumentId}:${pitchKey}:${durationBeats}:${bpm}:${sr}".
 *   Only cache-miss notes are re-synthesised; all others are reused.
 *
 * • Mixing            — every per-note buffer is summed sample-by-sample at
 *   the correct frame offset. Overlapping notes mix correctly because we are
 *   accumulating floats before any clipping.  After mixing a soft-knee
 *   limiter (tanh) prevents hard clipping.
 *
 * • Cancellation      — each render request carries a seqNum. A new request
 *   for the same trackId cancels the previous one (same pattern as the
 *   existing waveform-processor worker).
 *
 * • Transferable      — result Float32Arrays are transferred (zero-copy) back
 *   to the main thread.
 *
 * Message protocol
 * ────────────────
 * Main → Worker:  SynthRequest
 * Worker → Main:  SynthResponse  |  SynthError
 */

import type { PlacedNoteID } from "../features/nodes/instrument/instrument-node";
import type { AudioTrackID } from "../lib/audio/track/track";
import type { InstrumentPitchKey, MusicInstrumentType } from "../lib/music/instruments";

// ─── Protocol types (also exported for the main-thread wrapper) ───────────────

/** A single placed note sent from the main thread. */
export interface SynthNote {
  /** Unique stable note id (nanoid). */
  id: PlacedNoteID;
  pitchKey: InstrumentPitchKey;
  /** Beat position from track start. */
  startBeat: number;
  /** Duration in beats. */
  durationBeats: number;
}

/** Request sent from the main thread to the worker. */
export interface SynthRequest {
  /** Stable track identifier. */
  trackId: AudioTrackID;
  /** Monotonically increasing per-track; supersedes any lower seqNum. */
  seqNum: number;
  instrumentType: MusicInstrumentType;
  bpm: number;
  /** Target sample rate (e.g. 44100 or 48000). */
  sampleRate: number;
  notes: SynthNote[];
}

/** Successful response from the worker. */
export interface SynthResponse {
  trackId: AudioTrackID;
  seqNum: number;
  /** Left-channel PCM samples. */
  left: Float32Array;
  /** Right-channel PCM samples. */
  right: Float32Array;
  /**
   * True when the track has no notes — the buffer is a single silent sample.
   * The main thread should remove the AudioTrack from the player.
   */
  empty: boolean;
}

/** Error response (render was not completed). */
export interface SynthError {
  trackId: AudioTrackID;
  seqNum: number;
  error: string;
}

// ─── Instrument engine interface ──────────────────────────────────────────────

/**
 * An InstrumentEngine knows how to render a single note into a pair of
 * Float32Arrays (stereo, unnormalised, typically in [-1, 1]).
 *
 * Upgrading from synthesised to sample-based audio means providing a new
 * class that implements this interface — the worker loop is unchanged.
 */
interface InstrumentEngine {
  /**
   * Render one note to a stereo buffer.
   *
   * @param pitchKey      Instrument-specific pitch/pad identifier.
   * @param durationSec  Note duration in seconds (sustain length).
   * @param sampleRate   Target sample rate in Hz.
   * @returns            [left, right] Float32Arrays of equal length.
   *                     The length encodes the full sound including release.
   */
  renderNote(
    pitchKey: InstrumentPitchKey,
    durationSec: number,
    sampleRate: number,
  ): [Float32Array, Float32Array];
}

// ─── DSP helpers ──────────────────────────────────────────────────────────────

/** Fill `buf` with white noise in [-1, 1]. */
function fillNoise(buf: Float32Array): void {
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.random() * 2 - 1;
  }
}

/**
 * Apply a linear ADSR envelope (additive ramp segments) to `buf` in-place.
 *
 * All times are in seconds; they are converted to sample indices internally.
 */
function applyEnvelope(
  buf: Float32Array,
  sampleRate: number,
  opts: {
    attackSec: number;
    decayEndSec: number;
    sustainLevel: number;
    releaseStartSec: number;
    releaseEndSec: number;
    peakLevel: number;
  },
): void {
  const sr = sampleRate;
  const attackEnd = Math.round(opts.attackSec * sr);
  const decayEnd = Math.round(opts.decayEndSec * sr);
  const releaseStart = Math.round(opts.releaseStartSec * sr);
  const releaseEnd = Math.min(Math.round(opts.releaseEndSec * sr), buf.length);

  for (let i = 0; i < buf.length; i++) {
    let gain: number;
    if (i < attackEnd) {
      gain = (i / attackEnd) * opts.peakLevel;
    } else if (i < decayEnd) {
      const t = (i - attackEnd) / (decayEnd - attackEnd);
      gain = opts.peakLevel + t * (opts.sustainLevel - opts.peakLevel);
    } else if (i < releaseStart) {
      gain = opts.sustainLevel;
    } else if (i < releaseEnd) {
      const t = (i - releaseStart) / (releaseEnd - releaseStart);
      gain = opts.sustainLevel * (1 - t);
    } else {
      gain = 0;
    }
    buf[i] *= gain;
  }
}

/**
 * Apply a simple exponential-decay envelope to `buf` in-place.
 * Decays from `peakLevel` to near-zero over `decaySec` seconds.
 */
function applyExpDecay(
  buf: Float32Array,
  sampleRate: number,
  peakLevel: number,
  decaySec: number,
): void {
  const tau = decaySec / 6; // ~6 time constants ≈ silent
  for (let i = 0; i < buf.length; i++) {
    buf[i] *= peakLevel * Math.exp(-i / (tau * sampleRate));
  }
}

/** Apply a one-pole high-pass filter in-place (removes DC / very low freqs). */
function highPassInPlace(buf: Float32Array, cutoffHz: number, sampleRate: number): void {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  let prev = 0;
  let prevIn = 0;
  for (let i = 0; i < buf.length; i++) {
    const cur = alpha * (prev + buf[i] - prevIn);
    prevIn = buf[i];
    prev = cur;
    buf[i] = cur;
  }
}

/** Apply a one-pole low-pass filter in-place. */
function lowPassInPlace(buf: Float32Array, cutoffHz: number, sampleRate: number): void {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < buf.length; i++) {
    prev = prev + alpha * (buf[i] - prev);
    buf[i] = prev;
  }
}

/** Apply a one-pole band-pass filter in-place (HP then LP). */
function bandPassInPlace(buf: Float32Array, centerHz: number, sampleRate: number): void {
  highPassInPlace(buf, centerHz * 0.7, sampleRate);
  lowPassInPlace(buf, centerHz * 1.3, sampleRate);
}

/**
 * Synthesise a sine oscillator with optional frequency envelope (pitch sweep).
 *
 * @param frames      Output length in samples.
 * @param sampleRate  Sample rate in Hz.
 * @param startHz     Starting frequency.
 * @param endHz       End frequency (linear sweep over `sweepSec`).
 * @param sweepSec    Duration of pitch sweep.
 * @param amplitude   Peak amplitude.
 */
function sineOsc(
  frames: number,
  sampleRate: number,
  startHz: number,
  endHz: number,
  sweepSec: number,
  amplitude = 1,
): Float32Array {
  const out = new Float32Array(frames);
  const sweepFrames = Math.round(sweepSec * sampleRate);
  let phase = 0;

  for (let i = 0; i < frames; i++) {
    const t = Math.min(i, sweepFrames) / sweepFrames;
    const freq = startHz + t * (endHz - startHz);
    out[i] = amplitude * Math.sin(phase);
    phase += (2 * Math.PI * freq) / sampleRate;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
  }
  return out;
}

/** Convert MIDI note number to Hz. */
function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Build the PITCH_ID → MIDI map once. */
const PITCH_ID_TO_MIDI: Record<InstrumentPitchKey, number> = (() => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const map: Record<InstrumentPitchKey, number> = {};
  for (let octave = 2; octave <= 6; octave++) {
    for (let n = 0; n < 12; n++) {
      map[`${names[n]}${octave}`] = (octave + 1) * 12 + n;
    }
  }
  return map;
})();

// ─── Piano DSP engine ─────────────────────────────────────────────────────────

class PianoSynthEngine implements InstrumentEngine {
  renderNote(
    pitchKey: InstrumentPitchKey,
    durationSec: number,
    sampleRate: number,
  ): [Float32Array, Float32Array] {
    const midi = PITCH_ID_TO_MIDI[pitchKey];
    if (midi === undefined) {
      const empty = new Float32Array(1);
      return [empty, empty.slice()];
    }

    const freq = midiToHz(midi);
    // Total render length: note duration + 350 ms release tail
    const releaseSec = 0.35;
    const frames = Math.ceil((durationSec + releaseSec) * sampleRate);

    // Fundamental triangle wave
    // Triangle: integrate square wave, or approximate via sin terms
    const fundamental = new Float32Array(frames);
    let phase1 = 0;
    for (let i = 0; i < frames; i++) {
      // Triangle approximation: sin - sin(3x)/9 + sin(5x)/25 ...
      fundamental[i] = Math.sin(phase1) - Math.sin(3 * phase1) / 9 + Math.sin(5 * phase1) / 25;
      phase1 += (2 * Math.PI * freq) / sampleRate;
      if (phase1 > 2 * Math.PI) phase1 -= 2 * Math.PI;
    }

    // Brightness: sine one octave up at 50% volume
    const bright = new Float32Array(frames);
    let phase2 = 0;
    for (let i = 0; i < frames; i++) {
      bright[i] = 0.5 * Math.sin(phase2);
      phase2 += (2 * Math.PI * freq * 2) / sampleRate;
      if (phase2 > 2 * Math.PI) phase2 -= 2 * Math.PI;
    }

    // Mix
    const mix = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      mix[i] = fundamental[i] + bright[i];
    }

    // ADSR envelope
    const attackSec = 0.005;
    const decayEndSec = 0.1;
    const sustainLevel = 0.25;
    const releaseStartSec = Math.max(durationSec - 0.05, 0.05);
    const releaseEndSec = releaseStartSec + releaseSec;
    const peakLevel = 0.4;

    applyEnvelope(mix, sampleRate, {
      attackSec,
      decayEndSec,
      sustainLevel,
      releaseStartSec,
      releaseEndSec,
      peakLevel,
    });

    // Piano is mono; use same buffer for both channels
    return [mix, mix.slice()];
  }
}

// ─── Drum DSP engine ──────────────────────────────────────────────────────────

class DrumSynthEngine implements InstrumentEngine {
  renderNote(
    pitchKey: InstrumentPitchKey,
    _durationSec: number,
    sampleRate: number,
  ): [Float32Array, Float32Array] {
    let mono: Float32Array;

    switch (pitchKey) {
      case "kick":
        mono = this.renderKick(sampleRate);
        break;
      case "snare":
        mono = this.renderSnare(sampleRate);
        break;
      case "hihat-open":
        mono = this.renderHiHat(sampleRate, true);
        break;
      case "hihat-closed":
        mono = this.renderHiHat(sampleRate, false);
        break;
      case "crash":
        mono = this.renderCymbal(sampleRate, true);
        break;
      case "ride":
        mono = this.renderCymbal(sampleRate, false);
        break;
      case "tom-hi":
        mono = this.renderTom(sampleRate, "hi");
        break;
      case "tom-mid":
        mono = this.renderTom(sampleRate, "mid");
        break;
      case "tom-lo":
        mono = this.renderTom(sampleRate, "lo");
        break;
      default:
        mono = new Float32Array(1);
        break;
    }

    return [mono, mono.slice()];
  }

  private renderKick(sampleRate: number): Float32Array {
    const decaySec = 0.36;
    const frames = Math.ceil(decaySec * sampleRate);
    // Pitch sweep 160 → 40 Hz over 150 ms
    const osc = sineOsc(frames, sampleRate, 160, 40, 0.15, 1);
    applyExpDecay(osc, sampleRate, 0.8, decaySec);
    return osc;
  }

  private renderSnare(sampleRate: number): Float32Array {
    const frames = Math.ceil(0.25 * sampleRate);

    // Noise component (band-passed around 1800 Hz)
    const noise = new Float32Array(frames);
    fillNoise(noise);
    bandPassInPlace(noise, 1800, sampleRate);
    applyExpDecay(noise, sampleRate, 0.6, 0.2);

    // Body: pitch sweep 200 → 80 Hz over 80 ms
    const body = sineOsc(frames, sampleRate, 200, 80, 0.08, 0.4);
    applyExpDecay(body, sampleRate, 1, 0.1);

    // Mix
    for (let i = 0; i < frames; i++) noise[i] += body[i];
    return noise;
  }

  private renderHiHat(sampleRate: number, isOpen: boolean): Float32Array {
    const dur = isOpen ? 0.5 : 0.08;
    const frames = Math.ceil((dur + 0.01) * sampleRate);
    const noise = new Float32Array(frames);
    fillNoise(noise);
    highPassInPlace(noise, 7000, sampleRate);
    applyExpDecay(noise, sampleRate, 0.4, dur);
    return noise;
  }

  private renderCymbal(sampleRate: number, isCrash: boolean): Float32Array {
    const dur = isCrash ? 1.5 : 1;
    const frames = Math.ceil((dur + 0.05) * sampleRate);
    const noise = new Float32Array(frames);
    fillNoise(noise);
    highPassInPlace(noise, isCrash ? 5000 : 6000, sampleRate);
    bandPassInPlace(noise, isCrash ? 8000 : 9000, sampleRate);
    const peak = isCrash ? 0.5 : 0.35;
    applyExpDecay(noise, sampleRate, peak, dur);
    return noise;
  }

  private renderTom(sampleRate: number, variant: "hi" | "mid" | "lo"): Float32Array {
    const freqMap = { hi: 180, mid: 130, lo: 90 } as const;
    const endFreq = freqMap[variant];
    const startFreq = endFreq * 1.5;
    const decaySec = 0.31;
    const frames = Math.ceil(decaySec * sampleRate);
    const osc = sineOsc(frames, sampleRate, startFreq, endFreq, 0.15, 1);
    applyExpDecay(osc, sampleRate, 0.6, decaySec);
    return osc;
  }
}

// ─── Engine registry ──────────────────────────────────────────────────────────

/**
 * Engine registry — add sample-based engines here when audio samples become
 * available.  The registry is keyed by SynthInstrumentId so the worker loop
 * never needs to change.
 */
const ENGINES: Record<MusicInstrumentType, InstrumentEngine> = {
  piano: new PianoSynthEngine(),
  drums: new DrumSynthEngine(),
};

// ─── Per-note render cache ────────────────────────────────────────────────────

/**
 * Cache key encodes everything that affects the rendered output of one note.
 * When samples are introduced the key will include a sample-set version/hash.
 */
function noteFingerprint(
  instrumentId: MusicInstrumentType,
  pitchKey: InstrumentPitchKey,
  durationBeats: number,
  bpm: number,
  sampleRate: number,
): string {
  return `${instrumentId}:${pitchKey}:${durationBeats}:${bpm}:${sampleRate}`;
}

/** Cache: fingerprint → [leftChannel, rightChannel] */
const noteCache = new Map<string, [Float32Array, Float32Array]>();

/** Maximum number of cached rendered notes. Oldest entries are evicted (FIFO). */
const NOTE_CACHE_MAX_SIZE = 500;

// ─── Cancellation ─────────────────────────────────────────────────────────────

/** Latest seqNum seen per trackId. */
const latestSeqNum = new Map<AudioTrackID, number>();

function isCancelled(trackId: AudioTrackID, seqNum: number): boolean {
  return (latestSeqNum.get(trackId) ?? seqNum) > seqNum;
}

// ─── Render pipeline ──────────────────────────────────────────────────────────

const TAIL_PADDING_SEC = 2;

function renderTrack(req: SynthRequest): SynthResponse {
  const { trackId, seqNum, instrumentType: instrumentId, bpm, sampleRate, notes } = req;

  // Empty track — return a silent 1-sample buffer.
  if (notes.length === 0) {
    const silent = new Float32Array(1);
    return {
      trackId,
      seqNum,
      left: silent,
      right: silent.slice(),
      empty: true,
    };
  }

  const engine = ENGINES[instrumentId];
  const secPerBeat = 60 / bpm;

  // Step 1 — render any cache-miss notes.
  for (const note of notes) {
    if (isCancelled(trackId, seqNum)) break;

    const fp = noteFingerprint(instrumentId, note.pitchKey, note.durationBeats, bpm, sampleRate);
    if (!noteCache.has(fp)) {
      const durationSec = note.durationBeats * secPerBeat;
      const [l, r] = engine.renderNote(note.pitchKey, durationSec, sampleRate);
      // Evict oldest entry if cache is full (FIFO — Map preserves insertion order).
      if (noteCache.size >= NOTE_CACHE_MAX_SIZE) {
        const oldest = noteCache.keys().next().value;
        if (oldest !== undefined) noteCache.delete(oldest);
      }
      noteCache.set(fp, [l, r]);
    }
  }

  if (isCancelled(trackId, seqNum)) {
    // Return empty — the main thread will discard this response.
    const silent = new Float32Array(1);
    return {
      trackId,
      seqNum,
      left: silent,
      right: silent.slice(),
      empty: true,
    };
  }

  // Step 2 — determine the total output length.
  let totalFrames = 0;
  for (const note of notes) {
    const fp = noteFingerprint(instrumentId, note.pitchKey, note.durationBeats, bpm, sampleRate);
    const cached = noteCache.get(fp);
    if (!cached) continue;
    const startFrame = Math.round(note.startBeat * secPerBeat * sampleRate);
    const endFrame = startFrame + cached[0].length;
    if (endFrame > totalFrames) totalFrames = endFrame;
  }

  // Add tail padding so release tails aren't cut off.
  totalFrames += Math.ceil(TAIL_PADDING_SEC * sampleRate);

  // Step 3 — mix all note buffers into the master output.
  // Accumulate as float64 to preserve precision during summing.
  const masterL = new Float64Array(totalFrames);
  const masterR = new Float64Array(totalFrames);

  for (const note of notes) {
    const fp = noteFingerprint(instrumentId, note.pitchKey, note.durationBeats, bpm, sampleRate);
    const cached = noteCache.get(fp);
    if (!cached) continue;

    const [noteL, noteR] = cached;
    const startFrame = Math.round(note.startBeat * secPerBeat * sampleRate);

    // Sum samples — overlapping notes accumulate correctly here.
    const len = Math.min(noteL.length, totalFrames - startFrame);
    for (let i = 0; i < len; i++) {
      masterL[startFrame + i] += noteL[i];
      masterR[startFrame + i] += noteR[i];
    }
  }

  // Step 4 — soft-knee limiting via tanh to prevent hard clipping.
  // tanh(x) ≈ x for small x, smoothly saturates towards ±1 for large x.
  const outL = new Float32Array(totalFrames);
  const outR = new Float32Array(totalFrames);
  for (let i = 0; i < totalFrames; i++) {
    outL[i] = Math.tanh(masterL[i]);
    outR[i] = Math.tanh(masterR[i]);
  }

  return { trackId, seqNum, left: outL, right: outR, empty: false };
}

// ─── Worker message handler ───────────────────────────────────────────────────

function isValidSynthNote(note: unknown): note is SynthNote {
  if (!note || typeof note !== "object") return false;
  const n = note as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    n.id.length > 0 &&
    typeof n.pitchKey === "string" &&
    n.pitchKey.length > 0 &&
    typeof n.startBeat === "number" &&
    Number.isFinite(n.startBeat) &&
    n.startBeat >= 0 &&
    typeof n.durationBeats === "number" &&
    n.durationBeats > 0 &&
    Number.isFinite(n.durationBeats)
  );
}

function isValidSynthRequest(req: unknown): req is SynthRequest {
  if (!req || typeof req !== "object") return false;
  const r = req as Record<string, unknown>;
  return (
    typeof r.trackId === "string" &&
    r.trackId.length > 0 &&
    typeof r.seqNum === "number" &&
    Number.isFinite(r.seqNum) &&
    r.seqNum >= 0 &&
    (r.instrumentType === "piano" || r.instrumentType === "drums") &&
    typeof r.bpm === "number" &&
    r.bpm > 0 &&
    r.bpm < 1000 &&
    typeof r.sampleRate === "number" &&
    r.sampleRate >= 8_000 &&
    r.sampleRate <= 384_000 &&
    Array.isArray(r.notes) &&
    r.notes.length <= 10_000 &&
    r.notes.every(isValidSynthNote)
  );
}

self.addEventListener("message", (e: MessageEvent<unknown>) => {
  // Note: e.origin is always "" for same-origin worker messages per spec.
  // Trust is structurally enforced — only the owning InstrumentTrack holds
  // a reference to this worker and posts messages to it.

  const req = e.data as Partial<SynthRequest> | null | undefined;
  if (!isValidSynthRequest(req)) {
    const errResponse: SynthError = {
      trackId: String(req?.trackId ?? "unknown"),
      seqNum: Number(req?.seqNum ?? 0),
      error: "Invalid SynthRequest message payload.",
    };
    self.postMessage(errResponse);
    return;
  }

  // Register this as the latest seqNum for the track — any in-progress render
  // for a lower seqNum will detect this and bail out.
  latestSeqNum.set(req.trackId, req.seqNum);

  try {
    const response = renderTrack(req);

    // Transfer the Float32Arrays (zero-copy) back to the main thread.
    self.postMessage(response, {
      transfer: [response.left.buffer, response.right.buffer],
    });
  } catch (err) {
    const errResponse: SynthError = {
      trackId: req.trackId,
      seqNum: req.seqNum,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errResponse);
  }
});

export default null;
