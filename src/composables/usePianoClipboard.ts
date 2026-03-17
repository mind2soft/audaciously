// composables/usePianoClipboard.ts
// Internal clipboard for piano-roll notes.
//
// Design:
//  • Module-level singleton ref — all callers share the same reactive state.
//  • Backed by localStorage so the clipboard survives page refreshes and is
//    accessible across browser tabs (the `storage` event keeps tabs in sync).
//  • Uses the ClipboardEntry discriminated union so future content types
//    (drum notes, audio segments) can be added without breaking this file.

import { nanoid } from "nanoid";
import type { ComputedRef } from "vue";
import { computed, ref } from "vue";
import type { PlacedNote } from "../features/nodes";
import type { ClipboardEntry, PianoNotesClipboard } from "../lib/piano-roll/tool-types";

const STORAGE_KEY = "audaciously:clipboard" as const;

// ── Module-level singleton ────────────────────────────────────────────────────

const _entry = ref<ClipboardEntry | null>(null);
let _listenerAttached = false;

function _readStorage(): ClipboardEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ClipboardEntry) : null;
  } catch {
    return null;
  }
}

function _writeStorage(entry: ClipboardEntry | null): void {
  try {
    if (entry === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    }
  } catch {
    // Storage quota exceeded — clipboard written to memory only.
  }
}

/** Attach the cross-tab storage listener exactly once. */
function _ensureListener(): void {
  if (_listenerAttached) return;
  _listenerAttached = true;

  // Hydrate from any pre-existing value (e.g. copied in another tab).
  _entry.value = _readStorage();

  // The `storage` event only fires in OTHER tabs, never the current one.
  window.addEventListener("storage", (evt: StorageEvent) => {
    if (evt.key !== STORAGE_KEY) return;
    _entry.value = evt.newValue ? (JSON.parse(evt.newValue) as ClipboardEntry) : null;
  });
}

// ── Composable ────────────────────────────────────────────────────────────────

export interface UsePianoClipboard {
  /** True when the clipboard holds piano notes that can be pasted. */
  readonly hasPianoNotes: ComputedRef<boolean>;
  /** The current piano-notes clipboard entry, or null if empty / wrong type. */
  readonly pianoNotesEntry: ComputedRef<PianoNotesClipboard | null>;
  /**
   * Copy a set of notes to the clipboard.
   * Notes are normalised so the earliest note starts at beat 0, preserving
   * inter-note spacing. `durationBeats` equals the actual content width
   * (from beat 0 to the end of the last note) and is used as the splice
   * shift-amount when pasting, guaranteeing no overlap with existing notes.
   * New nanoid IDs are assigned so pasted instances are independent objects.
   *
   * @returns Number of notes copied (0 when the array is empty).
   */
  copyPianoNotes(notes: PlacedNote[], selectionStart: number, selectionEnd: number): number;
  /**
   * Cut a set of notes to the clipboard.
   * Notes are normalised relative to selectionStart (so pasting restores the
   * exact original positions within the gap). `durationBeats` equals the full
   * range width (selectionEnd − selectionStart) so paste reopens the same gap.
   * New nanoid IDs are assigned so pasted instances are independent objects.
   *
   * @returns Number of notes cut (0 when the array is empty).
   */
  cutPianoNotes(notes: PlacedNote[], selectionStart: number, selectionEnd: number): number;
}

export function usePianoClipboard(): UsePianoClipboard {
  _ensureListener();

  const hasPianoNotes = computed(() => _entry.value?.type === "piano-notes");

  const pianoNotesEntry = computed<PianoNotesClipboard | null>(() =>
    _entry.value?.type === "piano-notes" ? (_entry.value as PianoNotesClipboard) : null,
  );

  function copyPianoNotes(
    notes: PlacedNote[],
    selectionStart: number,
    selectionEnd: number,
  ): number {
    if (notes.length === 0) return 0;

    // Normalise offsets relative to the earliest note so the paste beat-line
    // cursor lands exactly on the first note (not on empty leading space).
    const minBeat = Math.min(...notes.map((n) => n.startBeat));
    const normalised: PlacedNote[] = notes.map((n) => ({
      ...n,
      id: nanoid(),
      startBeat: n.startBeat - minBeat,
    }));

    // Use actual content width as the splice shift-amount so that notes
    // extending beyond the original selection end don't collide with the
    // existing notes that were pushed right on paste.
    const durationBeats = Math.max(...normalised.map((n) => n.startBeat + n.durationBeats));

    // selectionStart / selectionEnd are accepted but not used in the new
    // normalisation strategy; kept in the signature for future use (e.g.
    // copying empty-space padding intent).
    void selectionStart;
    void selectionEnd;

    const entry: PianoNotesClipboard = {
      type: "piano-notes",
      notes: normalised,
      durationBeats,
    };

    _entry.value = entry;
    _writeStorage(entry);
    return notes.length;
  }

  function cutPianoNotes(
    notes: PlacedNote[],
    selectionStart: number,
    selectionEnd: number,
  ): number {
    if (notes.length === 0) return 0;

    // Normalise offsets relative to selectionStart so that pasting restores
    // exact original positions within the reopened gap.
    const normalised: PlacedNote[] = notes.map((n) => ({
      ...n,
      id: nanoid(),
      startBeat: n.startBeat - selectionStart,
    }));

    // Use the full range width as durationBeats so paste reopens exactly the
    // same gap that was closed by the cut.
    const durationBeats = selectionEnd - selectionStart;

    const entry: PianoNotesClipboard = {
      type: "piano-notes",
      notes: normalised,
      durationBeats,
    };

    _entry.value = entry;
    _writeStorage(entry);
    return notes.length;
  }

  return { hasPianoNotes, pianoNotesEntry, copyPianoNotes, cutPianoNotes };
}
