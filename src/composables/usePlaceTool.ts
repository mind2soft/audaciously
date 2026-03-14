// composables/usePlaceTool.ts
// Place tool — the default piano-roll tool.
// Left-click on an empty cell places a note; left-click on an existing note
// removes it.  The hover ghost note shows a preview before the click.

import { ref, computed, onUnmounted } from "vue";
import { nanoid } from "nanoid";
import type { Ref, ComputedRef } from "vue";
import type { PlacedNote } from "../features/nodes";
import type { InstrumentPitch } from "../lib/music/instruments";
import {
  hitTestNote,
  notesOverlap,
  snapBeatFloor,
  clientXToRawBeat,
} from "../lib/piano-roll/note-utils";

// ── Context ───────────────────────────────────────────────────────────────────

export interface PlaceToolContext {
  notes: ComputedRef<PlacedNote[]>;
  pitches: ComputedRef<InstrumentPitch[]>;
  pxPerBeat: ComputedRef<number>;
  snapBeats: ComputedRef<number>;
  noteDurationBeats: ComputedRef<number>;
  rowHeightPx: number;
  gridRef: Ref<HTMLDivElement | undefined>;
  emitNotes: (notes: PlacedNote[]) => void;
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
    if (hoverStartBeat.value === null || hoverPitchId.value === null) return null;
    return {
      id: "hover-preview",
      startBeat: hoverStartBeat.value,
      durationBeats: ctx.noteDurationBeats.value,
      pitchId: hoverPitchId.value,
    };
  });

  const hoverHasOverlap = computed(
    () =>
      hoverPreviewNote.value !== null &&
      ctx.notes.value.some((n) => notesOverlap(n, hoverPreviewNote.value!)),
  );

  // ── Coordinate helpers ─────────────────────────────────────────────────────

  function getRawBeat(clientX: number): number {
    const rect = ctx.gridRef.value?.getBoundingClientRect();
    return rect ? clientXToRawBeat(clientX, rect, ctx.pxPerBeat.value) : 0;
  }

  function getPitchIdx(clientY: number): number {
    const rect = ctx.gridRef.value?.getBoundingClientRect();
    if (!rect) return 0;
    const py = clientY - rect.top;
    return Math.max(
      0,
      Math.min(ctx.pitches.value.length - 1, Math.floor(py / ctx.rowHeightPx)),
    );
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  function onMousemove(evt: MouseEvent): void {
    const rawBeat = getRawBeat(evt.clientX);
    const pitchIdx = getPitchIdx(evt.clientY);
    hoverStartBeat.value = snapBeatFloor(rawBeat, ctx.snapBeats.value);
    hoverPitchId.value = ctx.pitches.value[pitchIdx]?.id ?? null;
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
    const pitchId = ctx.pitches.value[pitchIdx]?.id;
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
        pitchId,
      };
      const filtered = ctx.notes.value.filter((n) => !notesOverlap(n, newNote));
      ctx.emitNotes([...filtered, newNote]);
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
