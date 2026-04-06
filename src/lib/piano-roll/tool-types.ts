// lib/piano-roll/tool-types.ts
// Shared types for the piano-roll tool system and internal clipboard.
// Kept in lib/ (not composables/) so they can be imported by both
// components and composables without introducing circular references.

import type { PlacedNote } from "../../features/nodes";

// ── Tool identifiers ──────────────────────────────────────────────────────────

export type PianoRollToolId = "place" | "pan" | "copy" | "cut" | "paste" | "zoom-select";

export type RecordedToolId = "pan" | "copy" | "cut" | "paste";

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
 * Clipboard payload for audio segments (recorded node copy/cut).
 *
 * AudioBuffer cannot be JSON-serialised, so we store the raw channel data
 * as plain number arrays plus the metadata needed to reconstruct an
 * AudioBuffer (sampleRate, numberOfChannels).
 *
 * `durationSeconds` is pre-computed for convenience (paste shift-amount).
 */
export interface AudioSegmentClipboard {
  readonly type: "audio-segment";
  /** Per-channel sample data (Float32Array → number[] for JSON round-trip). */
  readonly channels: readonly number[][];
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  /** Duration of the segment in seconds. */
  readonly durationSeconds: number;
}

/**
 * Union of all clipboard payload types.
 */
export type ClipboardEntry = PianoNotesClipboard | AudioSegmentClipboard;
