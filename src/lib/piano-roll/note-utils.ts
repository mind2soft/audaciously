// lib/piano-roll/note-utils.ts
// Pure note-manipulation helpers shared across all piano-roll tool composables.
// Every function here is a pure function: same inputs → same output, no side effects.

import type { PlacedNote } from "../../features/nodes";

// ── Overlap detection ─────────────────────────────────────────────────────────

/** True when two notes occupy overlapping time on the same pitch. */
export function notesOverlap(a: PlacedNote, b: PlacedNote): boolean {
  if (a.pitchId !== b.pitchId) return false;
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
  pitchId: string,
): PlacedNote | null {
  for (const note of notes) {
    if (
      note.pitchId === pitchId &&
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
export function resolveOverlapsKeepRightmost(notes: PlacedNote[]): PlacedNote[] {
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
    (n) =>
      n.startBeat < rangeEnd &&
      n.startBeat + n.durationBeats > rangeStart,
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
