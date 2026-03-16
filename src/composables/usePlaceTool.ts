// composables/usePlaceTool.ts
// Place tool — the default piano-roll tool.
// Left-click on an empty cell places a note; left-click on an existing note
// removes it.  The hover ghost note shows a preview before the click.

import { ref, computed, onUnmounted } from "vue";
import { nanoid } from "nanoid";
import type { ComputedRef } from "vue";
import type { PlacedNote } from "../features/nodes";
import type { InstrumentPitch } from "../lib/music/instruments";
import {
  hitTestNote,
  notesOverlap,
  snapBeatFloor,
} from "../lib/piano-roll/note-utils";

// ── Context ───────────────────────────────────────────────────────────────────

export interface PlaceToolContext {
  notes: ComputedRef<PlacedNote[]>;
  pitches: ComputedRef<InstrumentPitch[]>;
  snapBeats: ComputedRef<number>;
  noteDurationBeats: ComputedRef<number>;
  rowHeightPx: number;
  /** Converts a viewport clientX to an unsnapped beat position. */
  clientXToBeat: (clientX: number) => number;
  /** Converts a viewport clientY to a pitch row index (clamped). */
  clientYToPitchIdx: (clientY: number) => number;
  emitNotes: (notes: PlacedNote[]) => void;
  /** Called with the placed note's pitchId whenever a new note is successfully placed. */
  onPlace?: (pitchId: string) => void;
}

// ── Composable ────────────────────────────────────────────────────────────────

export function usePlaceTool(ctx: PlaceToolContext) {
  const hoverStartBeat = ref<number | null>(null);
  const hoverPitchId = ref<string | null>(null);

  type DragState =
    | { type: "none" }
    | { type: "placing" }
    | { type: "removing"; noteId: string };
  const dragState = ref<DragState>({ type: "none" });

  // ── Hover preview ──────────────────────────────────────────────────────────

  const hoverPreviewNote = computed<PlacedNote | null>(() => {
    if (hoverStartBeat.value === null || hoverPitchId.value === null)
      return null;
    return {
      id: "hover-preview",
      startBeat: hoverStartBeat.value,
      durationBeats: ctx.noteDurationBeats.value,
      pitchKey: hoverPitchId.value,
    };
  });

  const hoverHasOverlap = computed(
    () =>
      hoverPreviewNote.value !== null &&
      ctx.notes.value.some((n) => notesOverlap(n, hoverPreviewNote.value!)),
  );

  // ── Coordinate helpers ─────────────────────────────────────────────────────

  function getRawBeat(clientX: number): number {
    return ctx.clientXToBeat(clientX);
  }

  function getPitchIdx(clientY: number): number {
    return ctx.clientYToPitchIdx(clientY);
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  function onMousemove(evt: MouseEvent): void {
    const rawBeat = getRawBeat(evt.clientX);
    const pitchIdx = getPitchIdx(evt.clientY);
    hoverStartBeat.value = snapBeatFloor(rawBeat, ctx.snapBeats.value);
    hoverPitchId.value = ctx.pitches.value[pitchIdx]?.key ?? null;
  }

  function onMouseleave(): void {
    hoverStartBeat.value = null;
    hoverPitchId.value = null;
  }

  function onMousedown(evt: MouseEvent): void {
    if (evt.button !== 0) return;
    evt.preventDefault();

    const rawBeat = getRawBeat(evt.clientX);
    const pitchIdx = getPitchIdx(evt.clientY);
    const pitchId = ctx.pitches.value[pitchIdx]?.key;
    if (!pitchId) return;

    const existing = hitTestNote(ctx.notes.value, rawBeat, pitchId);
    if (existing) {
      dragState.value = { type: "removing", noteId: existing.id };
      ctx.emitNotes(ctx.notes.value.filter((n) => n.id !== existing.id));
    } else {
      dragState.value = { type: "placing" };
      const startBeat = snapBeatFloor(rawBeat, ctx.snapBeats.value);
      const newNote: PlacedNote = {
        id: nanoid(),
        startBeat,
        durationBeats: ctx.noteDurationBeats.value,
        pitchKey: pitchId,
      };
      const filtered = ctx.notes.value.filter((n) => !notesOverlap(n, newNote));
      ctx.emitNotes([...filtered, newNote]);
      ctx.onPlace?.(pitchId);
    }

    document.addEventListener("mouseup", onDocMouseup, { once: true });
  }

  function onDocMouseup(): void {
    dragState.value = { type: "none" };
  }

  onUnmounted(() => {
    document.removeEventListener("mouseup", onDocMouseup);
  });

  // ── Public interface ───────────────────────────────────────────────────────

  return {
    cursor: "crosshair" as const,
    hoverPreviewNote,
    hoverHasOverlap,
    onMousedown,
    onMousemove,
    onMouseleave,
  };
}

export type PlaceTool = ReturnType<typeof usePlaceTool>;
