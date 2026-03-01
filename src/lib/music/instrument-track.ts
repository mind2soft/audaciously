import { nanoid } from "nanoid";
import type { MusicInstrumentId, NoteDuration } from "./instruments";
import { MUSIC_INSTRUMENTS, NOTE_BEATS } from "./instruments";
import { baseSecondWidthInPixels } from "../util/formatTime";

// ─── Time signature ───────────────────────────────────────────────────────────

export interface TimeSignature {
  /** Beats per measure (numerator). */
  beatsPerMeasure: number;
  /** Note value that receives one beat (denominator, e.g. 4 = quarter note). */
  beatUnit: number;
}

export const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  beatsPerMeasure: 4,
  beatUnit: 4,
};

// ─── Placed note ──────────────────────────────────────────────────────────────

export interface PlacedNote {
  id: string;
  /** Beat index from the start of the track (0-based, float allowed). */
  startBeat: number;
  /** Duration in beats. */
  durationBeats: number;
  /** Pitch ID matching one of the instrument's pitches[].id values. */
  pitchId: string;
}

// ─── Instrument track ─────────────────────────────────────────────────────────

export interface InstrumentTrack {
  id: string;
  name: string;
  instrumentId: MusicInstrumentId;
  timeSignature: TimeSignature;
  /** Tempo in beats per minute. */
  bpm: number;
  notes: PlacedNote[];
  muted: boolean;
  locked: boolean;
  /** Track output volume, 0–1. Mirrored to the hidden AudioTrack in the player. */
  volume: number;
  /** Currently selected note type for placement. */
  selectedNoteType: NoteDuration;
  /**
   * Shared scroll offset (px) for the pitch axis.
   * Both InstrumentTrackHeader and InstrumentTrackView read/write this.
   */
  pitchScrollTop: number;
  /**
   * When true the track content area shows the rendered waveform instead of
   * the piano roll editor.  Toggled from the track header.
   */
  showWaveform: boolean;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createInstrumentTrack(
  name: string,
  instrumentId: MusicInstrumentId
): InstrumentTrack {
  return {
    id: nanoid(),
    name,
    instrumentId,
    timeSignature: { ...DEFAULT_TIME_SIGNATURE },
    bpm: 120,
    notes: [],
    muted: false,
    locked: false,
    volume: 1,
    selectedNoteType: "quarter",
    pitchScrollTop: 0,
    showWaveform: false,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Seconds per beat given a BPM value. */
export function getSecondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

/** Seconds per measure. */
export function getSecondsPerMeasure(
  bpm: number,
  timeSignature: TimeSignature
): number {
  return getSecondsPerBeat(bpm) * timeSignature.beatsPerMeasure;
}

/** Duration in beats of a note type (respects the track's beat unit). */
export function getNoteDurationBeats(
  duration: NoteDuration,
  beatUnit: number = 4
): number {
  // NOTE_BEATS is defined relative to a quarter note (beatUnit 4).
  // Adjust proportionally if the beatUnit is different.
  return NOTE_BEATS[duration] * (4 / beatUnit);
}

/** Duration in seconds of a note type for a given track. */
export function getNoteDurationSeconds(
  duration: NoteDuration,
  bpm: number,
  beatUnit: number = 4
): number {
  return getNoteDurationBeats(duration, beatUnit) * getSecondsPerBeat(bpm);
}

/**
 * Convert a beat position to pixels.
 * @param beat      Beat index from track start
 * @param bpm       Track BPM
 * @param ratio     Timeline ratio (the timeline's internal ratio, not raw px/sec)
 */
export function beatToPixel(beat: number, bpm: number, ratio: number): number {
  return beat * getSecondsPerBeat(bpm) * ratio * baseSecondWidthInPixels;
}

/**
 * Convert a pixel offset to the nearest beat (snapped).
 * @param px        Pixel offset from track left edge
 * @param bpm       Track BPM
 * @param ratio     Timeline ratio (the timeline's internal ratio, not raw px/sec)
 * @param snapBeats Beat subdivision to snap to (e.g. 0.25 = sixteenth)
 */
export function pixelToBeatSnapped(
  px: number,
  bpm: number,
  ratio: number,
  snapBeats: number = 0.25
): number {
  const rawBeat = px / (getSecondsPerBeat(bpm) * ratio * baseSecondWidthInPixels);
  return Math.max(0, Math.round(rawBeat / snapBeats) * snapBeats);
}

/**
 * How many total pitch rows exist for a given instrument.
 */
export function getInstrumentRowCount(instrumentId: MusicInstrumentId): number {
  return MUSIC_INSTRUMENTS[instrumentId].pitches.length;
}

/**
 * Row height (px) for a given instrument.
 */
export function getInstrumentRowHeight(instrumentId: MusicInstrumentId): number {
  return MUSIC_INSTRUMENTS[instrumentId].rowHeight;
}

/**
 * Total pitch area height in pixels (all rows stacked).
 */
export function getPitchAreaHeight(instrumentId: MusicInstrumentId): number {
  const inst = MUSIC_INSTRUMENTS[instrumentId];
  return inst.pitches.length * inst.rowHeight;
}
