// composables/usePanTool.ts
// Pan tool — shift all notes that start at-or-after a chosen beat.
//
// Behaviour:
//  • Hover: a vertical "beat line" snaps to the nearest grid position.
//  • Mousedown: captures the set of notes to drag (startBeat >= beat line).
//  • Drag (global mousemove): all captured notes move by the cursor delta.
//    Real-time preview is computed without mutating the store.
//  • Mouseup: finalises positions, resolves pitch conflicts (rightmost wins).

import { ref, computed, onUnmounted } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { PlacedNote } from "../features/nodes";
import type { InstrumentPitch } from "../lib/music/instruments";
import {
  snapBeatRound,
  clientXToRawBeat,
  resolveOverlapsKeepRightmost,
} from "../lib/piano-roll/note-utils";

// ── Context ───────────────────────────────────────────────────────────────────

export interface PanToolContext {
  notes: ComputedRef<PlacedNote[]>;
  pitches: ComputedRef<InstrumentPitch[]>;
  pxPerBeat: ComputedRef<number>;
  snapBeats: ComputedRef<number>;
  rowHeightPx: number;
  gridRef: Ref<HTMLDivElement | undefined>;
  emitNotes: (notes: PlacedNote[]) => void;
}

// ── Composable ────────────────────────────────────────────────────────────────

export function usePanTool(ctx: PanToolContext) {
  /** Snapped beat position of the beat line (null when mouse is outside). */
  const beatLine = ref<number | null>(null);
  const isDragging = ref(false);

  /** Pixel X at drag start — used to compute delta. */
  const dragStartX = ref(0);
  /** Beat position of the beat line at the moment of mousedown. */
  const dragStartBeat = ref(0);
  /** Current drag offset in beats (negative = moved left). */
  const dragDeltaBeats = ref(0);
  /** IDs of notes being dragged in this gesture. */
  const draggedIds = ref<Set<string>>(new Set());
  /**
   * Snap step for the current drag = max durationBeats among dragged notes.
   * Using the largest note preserves alignment: all notes stay on valid
   * beat positions relative to each other after the move.
   */
  const dragSnapBeats = ref(0);

  // ── Preview ────────────────────────────────────────────────────────────────

  /**
   * Notes at their preview position during drag.
   * Null when not dragging — PianoRoll.vue falls back to visibleNotes.
   */
  const previewNotes = computed<PlacedNote[] | null>(() => {
    if (!isDragging.value || dragDeltaBeats.value === 0) return null;
    return ctx.notes.value.map((n) =>
      draggedIds.value.has(n.id)
        ? { ...n, startBeat: Math.max(0, n.startBeat + dragDeltaBeats.value) }
        : n,
    );
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getRawBeat(clientX: number): number {
    const rect = ctx.gridRef.value?.getBoundingClientRect();
    return rect ? clientXToRawBeat(clientX, rect, ctx.pxPerBeat.value) : 0;
  }

  function computeDelta(clientX: number): number {
    const deltaPx = clientX - dragStartX.value;
    const rawDeltaBeats = deltaPx / ctx.pxPerBeat.value;
    const snappedDelta = snapBeatRound(rawDeltaBeats, dragSnapBeats.value);
    // Clamp so no dragged note goes before beat 0.
    const minDraggedStart = Math.min(
      ...ctx.notes.value
        .filter((n) => draggedIds.value.has(n.id))
        .map((n) => n.startBeat),
      Infinity,
    );
    return isFinite(minDraggedStart)
      ? Math.max(-minDraggedStart, snappedDelta)
      : snappedDelta;
  }

  // ── Global drag handlers (active while mouse is held) ──────────────────────

  function onDocMousemove(evt: MouseEvent): void {
    dragDeltaBeats.value = computeDelta(evt.clientX);
    beatLine.value = dragStartBeat.value + dragDeltaBeats.value;
  }

  function onDocMouseup(): void {
    document.removeEventListener("mousemove", onDocMousemove);
    isDragging.value = false;

    if (dragDeltaBeats.value !== 0) {
      const moved = ctx.notes.value.map((n) =>
        draggedIds.value.has(n.id)
          ? { ...n, startBeat: Math.max(0, n.startBeat + dragDeltaBeats.value) }
          : n,
      );
      ctx.emitNotes(resolveOverlapsKeepRightmost(moved));
    }

    dragDeltaBeats.value = 0;
    draggedIds.value = new Set();
    beatLine.value = null;
  }

  // ── Grid mouse handlers ────────────────────────────────────────────────────

  function onMousemove(evt: MouseEvent): void {
    if (isDragging.value) return; // global handler owns this during drag
    beatLine.value = snapBeatRound(getRawBeat(evt.clientX), ctx.snapBeats.value);
  }

  function onMouseleave(): void {
    if (!isDragging.value) beatLine.value = null;
  }

  function onMousedown(evt: MouseEvent): void {
    if (evt.button !== 0) return;
    evt.preventDefault();

    const snapped = snapBeatRound(getRawBeat(evt.clientX), ctx.snapBeats.value);
    beatLine.value = snapped;
    dragStartBeat.value = snapped;
    dragStartX.value = evt.clientX;
    dragDeltaBeats.value = 0;
    isDragging.value = true;

    draggedIds.value = new Set(
      ctx.notes.value
        .filter((n) => n.startBeat >= snapped)
        .map((n) => n.id),
    );

    // Snap step = largest note duration in the dragged set.
    // This keeps all inter-note spacing intact after the move.
    const dragged = ctx.notes.value.filter((n) => draggedIds.value.has(n.id));
    dragSnapBeats.value =
      dragged.length > 0
        ? Math.max(...dragged.map((n) => n.durationBeats))
        : ctx.snapBeats.value;

    document.addEventListener("mousemove", onDocMousemove);
    document.addEventListener("mouseup", onDocMouseup, { once: true });
  }

  onUnmounted(() => {
    document.removeEventListener("mousemove", onDocMousemove);
    document.removeEventListener("mouseup", onDocMouseup);
  });

  // ── Public interface ───────────────────────────────────────────────────────

  return {
    cursor: "col-resize" as const,
    beatLine,
    isDragging,
    dragDeltaBeats,
    draggedIds,
    previewNotes,
    onMousedown,
    onMousemove,
    onMouseleave,
  };
}

export type PanTool = ReturnType<typeof usePanTool>;
