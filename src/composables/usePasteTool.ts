// composables/usePasteTool.ts
// Paste tool — insert clipboard notes at a snapped beat position.
//
// Behaviour:
//  • Hover: a beat-line snaps to the nearest grid position.
//    Ghost notes preview where the pasted notes will land.
//  • Click (mousedown): shifts existing notes at-or-after the insert beat
//    rightward by durationBeats, then places the clipboard notes.
//    The clipboard is NOT cleared — paste is repeatable.
//  • Enabled guard: the parent disables the tool button when hasPianoNotes
//    is false; if the clipboard is cleared while active, ghost notes vanish
//    and clicks are no-ops.

import { ref, computed } from "vue";
import { nanoid } from "nanoid";
import type { Ref, ComputedRef } from "vue";
import type { PlacedNote } from "../features/nodes";
import type { InstrumentPitch } from "../lib/music/instruments";
import {
  snapBeatRound,
  clientXToRawBeat,
  insertNotesAt,
} from "../lib/piano-roll/note-utils";
import { usePianoClipboard } from "./usePianoClipboard";

// ── Context ───────────────────────────────────────────────────────────────────

export interface PasteToolContext {
  notes: ComputedRef<PlacedNote[]>;
  pitches: ComputedRef<InstrumentPitch[]>;
  pxPerBeat: ComputedRef<number>;
  snapBeats: ComputedRef<number>;
  rowHeightPx: number;
  gridRef: Ref<HTMLDivElement | undefined>;
  emitNotes: (notes: PlacedNote[]) => void;
}

// ── Composable ────────────────────────────────────────────────────────────────

export function usePasteTool(ctx: PasteToolContext) {
  const { pianoNotesEntry } = usePianoClipboard();

  /** Snapped beat where the paste would insert (null when outside the grid). */
  const beatLine = ref<number | null>(null);

  // ── Ghost notes ────────────────────────────────────────────────────────────

  /**
   * Preview: clipboard notes placed at the current beat-line position.
   * Uses temporary IDs (prefixed "ghost-") so they never collide with real notes.
   */
  const ghostNotes = computed<PlacedNote[] | null>(() => {
    if (beatLine.value === null || !pianoNotesEntry.value) return null;
    return pianoNotesEntry.value.notes.map((n) => ({
      ...n,
      id: `ghost-${n.id}`,
      startBeat: beatLine.value! + n.startBeat,
    }));
  });

  // ── Coordinate helper ──────────────────────────────────────────────────────

  function getRawBeat(clientX: number): number {
    const rect = ctx.gridRef.value?.getBoundingClientRect();
    return rect ? clientXToRawBeat(clientX, rect, ctx.pxPerBeat.value) : 0;
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  function onMousemove(evt: MouseEvent): void {
    beatLine.value = snapBeatRound(getRawBeat(evt.clientX), ctx.snapBeats.value);
  }

  function onMouseleave(): void {
    beatLine.value = null;
  }

  function onMousedown(evt: MouseEvent): void {
    if (evt.button !== 0) return;
    evt.preventDefault();

    const entry = pianoNotesEntry.value;
    if (!entry || beatLine.value === null) return;

    const insertBeat = beatLine.value;
    // Assign fresh IDs so each paste produces independent note objects.
    const freshNotes: PlacedNote[] = entry.notes.map((n) => ({
      ...n,
      id: nanoid(),
    }));

    ctx.emitNotes(
      insertNotesAt(ctx.notes.value, freshNotes, insertBeat, entry.durationBeats),
    );
  }

  // ── Public interface ───────────────────────────────────────────────────────

  return {
    cursor: "cell" as const,
    beatLine,
    ghostNotes,
    onMousedown,
    onMousemove,
    onMouseleave,
  };
}

export type PasteTool = ReturnType<typeof usePasteTool>;
