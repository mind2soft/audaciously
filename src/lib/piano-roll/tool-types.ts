// lib/piano-roll/tool-types.ts
// Shared types for the piano-roll tool system and internal clipboard.
// Kept in lib/ (not composables/) so they can be imported by both
// components and composables without introducing circular references.

import type { PlacedNote } from "../../features/nodes";

// ── Tool identifiers ──────────────────────────────────────────────────────────

export type PianoRollToolId = "place" | "pan" | "copy" | "cut" | "paste";

// ── Clipboard payload types ───────────────────────────────────────────────────

/**
 * Clipboard payload for piano-roll notes.
 * Notes are normalised so the earliest note in the selection starts at beat 0,
 * preserving all inter-note spacing.
 */
export interface PianoNotesClipboard {
  readonly type: "piano-notes";
  /** Notes with startBeat normalised so the earliest note is at beat 0. */
  readonly notes: PlacedNote[];
  /**
   * Actual content width in beats: max(startBeat + durationBeats) over all
   * clipboard notes. Used by paste as the splice shift-amount so that existing
   * notes are pushed far enough right to accommodate the full clipboard content.
   */
  readonly durationBeats: number;
}

/**
 * Union of all clipboard payload types.
 * Extend here when drum-roll or audio-segment copying is implemented.
 */
export type ClipboardEntry =
  | PianoNotesClipboard;
  // Future: | DrumNotesClipboard | AudioSegmentClipboard
