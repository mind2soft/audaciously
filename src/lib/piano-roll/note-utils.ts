// lib/piano-roll/note-utils.ts
// Pure note-manipulation helpers shared across all piano-roll tool composables.
// Every function here is a pure function: same inputs → same output, no side effects.

import type { PlacedNote } from "../../features/nodes";
import type { InstrumentPitchKey } from "../music/instruments";

// ── Overlap detection ─────────────────────────────────────────────────────────

/** True when two notes occupy overlapping time on the same pitch. */
export function notesOverlap(a: PlacedNote, b: PlacedNote): boolean {
  if (a.pitchKey !== b.pitchKey) return false;
  return (
    a.startBeat < b.startBeat + b.durationBeats &&
    b.startBeat < a.startBeat + a.durationBeats
  );
}

// ── Hit testing ───────────────────────────────────────────────────────────────

/** Return the first note whose time range contains rawBeat on the given pitch. */
export function hitTestNote(
  notes: PlacedNote[],
  rawBeat: number,
  pitchKey: InstrumentPitchKey,
): PlacedNote | null {
  for (const note of notes) {
    if (
      note.pitchKey === pitchKey &&
      rawBeat >= note.startBeat &&
      rawBeat < note.startBeat + note.durationBeats
    ) {
      return note;
    }
  }
  return null;
}

// ── Beat snapping ─────────────────────────────────────────────────────────────

/**
 * Compute the snap step (in beats) for a given note duration and time signature.
 *
 * The invariant: a note whose duration causes it to cross a measure boundary
 * must always start exactly on a measure boundary.
 *
 * A snap step `s` is safe iff `s` divides `beatsPerMeasure` and `d ≤ s`,
 * which reduces to: `beatsPerMeasure / noteDurationBeats` must be an integer.
 *
 * - If `noteDurationBeats >= beatsPerMeasure`  → snap = beatsPerMeasure
 * - If `beatsPerMeasure / noteDurationBeats` is an integer (clean subdivision)
 *                                              → snap = noteDurationBeats
 * - Otherwise (note doesn't cleanly subdivide the measure)
 *                                              → snap = beatsPerMeasure
 *
 * Examples:
 *   whole note (d=4) in 4/4 (bpm=4)  → 4/4=1 integer  → snap=4 (measure)
 *   half  note (d=2) in 4/4 (bpm=4)  → 4/2=2 integer  → snap=2
 *   whole note (d=2) in 3/8 (bpm=3)  → 3/2=1.5 ✗      → snap=3 (measure)
 *   half  note (d=2) in 3/4 (bpm=3)  → 3/2=1.5 ✗      → snap=3 (measure)
 *   half  note (d=1) in 3/8 (bpm=3)  → 3/1=3 integer  → snap=1
 *
 * Assumptions:
 *   - All supported NoteDuration values are powers of 2, so bpm/d is exact in
 *     IEEE 754. Non-power-of-2 durations (e.g. triplets) would need an
 *     epsilon-based integer check.
 *   - Invalid inputs (noteDurationBeats ≤ 0, NaN, Infinity) safely return
 *     beatsPerMeasure via the explicit guard below.
 */
export function computeSnapBeats(
  noteDurationBeats: number,
  beatsPerMeasure: number,
): number {
  if (noteDurationBeats <= 0 || !isFinite(noteDurationBeats))
    return beatsPerMeasure;
  if (noteDurationBeats >= beatsPerMeasure) return beatsPerMeasure;
  const ratio = beatsPerMeasure / noteDurationBeats;
  return Number.isInteger(ratio) ? noteDurationBeats : beatsPerMeasure;
}

/**
 * Floor-snap: cursor always lands INSIDE the placed note.
 * Used by the place tool so the new note starts at-or-before the click.
 */
export function snapBeatFloor(rawBeat: number, snapBeats: number): number {
  const snapped =
    Math.floor((rawBeat + Number.EPSILON) / snapBeats) * snapBeats;
  return Math.max(0, Number(snapped.toFixed(6)));
}

/**
 * Round-snap: cursor snaps to the NEAREST grid position.
 * Used by pan / paste beat-line indicators.
 */
export function snapBeatRound(rawBeat: number, snapBeats: number): number {
  const snapped = Math.round(rawBeat / snapBeats) * snapBeats;
  return Math.max(0, Number(snapped.toFixed(6)));
}

// ── Coordinate conversion ─────────────────────────────────────────────────────

/**
 * Convert a viewport clientX to a raw (unsnapped) beat position.
 * getBoundingClientRect() already accounts for scroll, so no manual offset needed.
 */
export function clientXToRawBeat(
  clientX: number,
  rect: DOMRect,
  pxPerBeat: number,
): number {
  return (clientX - rect.left) / pxPerBeat;
}

// ── Note array manipulation ───────────────────────────────────────────────────

/**
 * Shift all notes whose startBeat is >= fromBeat by deltaBeats.
 * Resulting startBeat is clamped to >= 0.
 * Notes before fromBeat are returned unchanged (shallow copy).
 */
export function shiftNotesFrom(
  notes: PlacedNote[],
  fromBeat: number,
  deltaBeats: number,
): PlacedNote[] {
  return notes.map((n) =>
    n.startBeat >= fromBeat
      ? { ...n, startBeat: Math.max(0, n.startBeat + deltaBeats) }
      : n,
  );
}

/**
 * Resolve overlapping notes on the same pitch, keeping the rightmost
 * (later startBeat) one in each conflict pair.
 *
 * Algorithm: sort descending by startBeat, then greedily add each note
 * only when it doesn't conflict with an already-kept note.
 */
export function resolveOverlapsKeepRightmost(
  notes: PlacedNote[],
): PlacedNote[] {
  const sorted = [...notes].sort((a, b) => b.startBeat - a.startBeat);
  const kept: PlacedNote[] = [];
  for (const note of sorted) {
    if (!kept.some((k) => notesOverlap(k, note))) {
      kept.push(note);
    }
  }
  return kept;
}

/**
 * Insert notes at an insert beat, pushing existing notes to the right.
 *
 * 1. All existing notes with startBeat >= insertBeat are shifted right by shiftAmount.
 * 2. The inserted notes (pre-normalised to startBeat 0) are placed at insertBeat + their offset.
 */
export function insertNotesAt(
  existing: PlacedNote[],
  inserted: PlacedNote[],
  insertBeat: number,
  shiftAmount: number,
): PlacedNote[] {
  const shifted = shiftNotesFrom(existing, insertBeat, shiftAmount);
  const placed = inserted.map((n) => ({
    ...n,
    startBeat: insertBeat + n.startBeat,
  }));
  return [...shifted, ...placed];
}

/**
 * Return all notes that overlap with the half-open range [rangeStart, rangeEnd).
 * A note overlaps if it starts before rangeEnd AND ends after rangeStart.
 */
export function notesInRange(
  notes: PlacedNote[],
  rangeStart: number,
  rangeEnd: number,
): PlacedNote[] {
  return notes.filter(
    (n) => n.startBeat < rangeEnd && n.startBeat + n.durationBeats > rangeStart,
  );
}

/**
 * Cut all notes overlapping [rangeStart, rangeEnd) and close the resulting gap.
 *
 * The shift amount is snapped to the largest note duration among the notes
 * that will be shifted (those with startBeat >= rangeEnd), so every shifted
 * note lands on a clean grid position.  Falls back to the raw gap width when
 * there are no notes to shift.
 *
 * Steps:
 *  1. Collect IDs of notes overlapping the range (they will be removed).
 *  2. Find notes whose startBeat >= rangeEnd (they will shift left).
 *  3. Snap the gap (rangeEnd − rangeStart) to the largest duration of step-2 notes.
 *  4. Return the surviving notes with the shifted positions applied.
 */
export function cutNotesInRange(
  notes: PlacedNote[],
  rangeStart: number,
  rangeEnd: number,
): PlacedNote[] {
  const removeIds = new Set(
    notesInRange(notes, rangeStart, rangeEnd).map((n) => n.id),
  );

  const toShift = notes.filter(
    (n) => !removeIds.has(n.id) && n.startBeat >= rangeEnd,
  );

  const rawGap = rangeEnd - rangeStart;
  let shiftAmount = rawGap;
  if (toShift.length > 0) {
    const maxDuration = Math.max(...toShift.map((n) => n.durationBeats));
    shiftAmount = snapBeatRound(rawGap, maxDuration);
    // Guard: never shift by zero when there is a real gap.
    if (shiftAmount === 0 && rawGap > 0) shiftAmount = maxDuration;
  }

  return notes
    .filter((n) => !removeIds.has(n.id))
    .map((n) =>
      n.startBeat >= rangeEnd
        ? { ...n, startBeat: Math.max(0, n.startBeat - shiftAmount) }
        : n,
    );
}
