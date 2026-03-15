// ─── Helpers ──────────────────────────────────────────────────────────────────

import {
  MUSIC_INSTRUMENTS,
  NOTE_BEATS,
  type MusicInstrumentType,
  type NoteDuration,
} from "../../../music/instruments";
import { baseSecondWidthInPixels } from "../../../util/formatTime";
import type { TimeSignature } from "./index";

/** Seconds per beat given a BPM value. */
export function getSecondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

/** Seconds per measure. */
export function getSecondsPerMeasure(
  bpm: number,
  timeSignature: TimeSignature,
): number {
  return getSecondsPerBeat(bpm) * timeSignature.beatsPerMeasure;
}

/** Duration in beats of a note type (respects the track's beat unit). */
export function getNoteDurationBeats(
  duration: NoteDuration,
  beatUnit: number = 4,
): number {
  return NOTE_BEATS[duration] * (4 / beatUnit);
}

/** Duration in seconds of a note type for a given track. */
export function getNoteDurationSeconds(
  duration: NoteDuration,
  bpm: number,
  beatUnit: number = 4,
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
  snapBeats: number = 0.25,
): number {
  const rawBeat =
    px / (getSecondsPerBeat(bpm) * ratio * baseSecondWidthInPixels);
  return Math.max(0, Math.round(rawBeat / snapBeats) * snapBeats);
}

/** How many total pitch rows exist for a given instrument. */
export function getInstrumentRowCount(
  instrumentId: MusicInstrumentType,
): number {
  return MUSIC_INSTRUMENTS[instrumentId].pitches.length;
}

/** Row height (px) for a given instrument. */
export function getInstrumentRowHeight(
  instrumentId: MusicInstrumentType,
): number {
  return MUSIC_INSTRUMENTS[instrumentId].rowHeight;
}

/** Total pitch area height in pixels (all rows stacked). */
export function getPitchAreaHeight(instrumentId: MusicInstrumentType): number {
  const inst = MUSIC_INSTRUMENTS[instrumentId];
  return inst.pitches.length * inst.rowHeight;
}
