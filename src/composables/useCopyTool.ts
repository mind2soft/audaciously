// composables/useCopyTool.ts
// Copy tool — drag a selection rectangle across the piano roll to highlight and
// copy notes.
//
// Behaviour:
//  • Hover (no button held): a vertical beat-line snaps to the nearest grid
//    position, showing where a selection would start.
//  • Mousedown: records the selection start beat (beat-snapped).
//  • Drag (global + grid mousemove): extends selectionEnd (beat-snapped);
//    notes overlapping the range are highlighted via selectedNoteIds.
//  • Near container edges: an rAF loop auto-scrolls the container.
//  • Mouseup: if any notes are in range, normalises and copies them to the
//    clipboard, calls onCopied(count), then clears the selection.

import { ref, computed, onUnmounted } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { PlacedNote } from "../features/nodes";
import type { InstrumentPitch } from "../lib/music/instruments";
import { snapBeatRound, notesInRange } from "../lib/piano-roll/note-utils";
import { usePianoClipboard } from "./usePianoClipboard";

const SCROLL_EDGE_PX = 40; // px from container edge to trigger auto-scroll
const SCROLL_SPEED_PX = 5; // px per animation frame

// ── Context ───────────────────────────────────────────────────────────────────

export interface CopyToolContext {
  notes: ComputedRef<PlacedNote[]>;
  pitches: ComputedRef<InstrumentPitch[]>;
  snapBeats: ComputedRef<number>;
  rowHeightPx: number;
  /** Converts a viewport clientX to an unsnapped beat position. */
  clientXToBeat: (clientX: number) => number;
  scrollRef: Ref<HTMLDivElement | undefined>;
  emitNotes: (notes: PlacedNote[]) => void;
  /** Called with the number of notes actually copied (> 0 guaranteed). */
  onCopied: (count: number) => void;
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useCopyTool(ctx: CopyToolContext) {
  const { copyPianoNotes } = usePianoClipboard();

  const selectionStart = ref<number | null>(null);
  const selectionEnd = ref<number | null>(null);
  const isSelecting = ref(false);

  /** Snapped beat at the current cursor position (null when outside the grid). */
  const beatLine = ref<number | null>(null);

  // ── Derived selection state ────────────────────────────────────────────────

  /** Normalised [start, end] range (start always <= end), or null. */
  const selectionRange = computed<{ start: number; end: number } | null>(() => {
    if (selectionStart.value === null || selectionEnd.value === null) return null;
    const start = Math.min(selectionStart.value, selectionEnd.value);
    const end = Math.max(selectionStart.value, selectionEnd.value);
    return start === end ? null : { start, end };
  });

  /** Set of note IDs that overlap the current selection range. */
  const selectedNoteIds = computed<Set<string>>(() => {
    const range = selectionRange.value;
    if (!range) return new Set();
    return new Set(
      notesInRange(ctx.notes.value, range.start, range.end).map((n) => n.id),
    );
  });

  // ── Coordinate helpers ─────────────────────────────────────────────────────

  function getRawBeat(clientX: number): number {
    return ctx.clientXToBeat(clientX);
  }

  // ── Auto-scroll ────────────────────────────────────────────────────────────

  let scrollRafId: number | null = null;
  let lastMouseX = 0;

  function startAutoScroll(): void {
    if (scrollRafId !== null) return;

    function tick(): void {
      const scrollEl = ctx.scrollRef.value;
      if (!scrollEl || !isSelecting.value) {
        scrollRafId = null;
        return;
      }

      const containerRect = scrollEl.getBoundingClientRect();
      if (lastMouseX < containerRect.left + SCROLL_EDGE_PX) {
        scrollEl.scrollLeft -= SCROLL_SPEED_PX;
      } else if (lastMouseX > containerRect.right - SCROLL_EDGE_PX) {
        scrollEl.scrollLeft += SCROLL_SPEED_PX;
      }

      // Keep selectionEnd in sync with the scrolled position.
      selectionEnd.value = snapBeatRound(getRawBeat(lastMouseX), ctx.snapBeats.value);
      scrollRafId = requestAnimationFrame(tick);
    }

    scrollRafId = requestAnimationFrame(tick);
  }

  function stopAutoScroll(): void {
    if (scrollRafId !== null) {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = null;
    }
  }

  // ── Finalise selection ─────────────────────────────────────────────────────

  function finaliseSelection(): void {
    const range = selectionRange.value;
    if (range) {
      const selected = notesInRange(ctx.notes.value, range.start, range.end);
      if (selected.length > 0) {
        const count = copyPianoNotes(selected, range.start, range.end);
        ctx.onCopied(count);
      }
    }
    selectionStart.value = null;
    selectionEnd.value = null;
    isSelecting.value = false;
  }

  // ── Global drag handlers ───────────────────────────────────────────────────

  function onDocMousemove(evt: MouseEvent): void {
    if (!isSelecting.value) return;
    lastMouseX = evt.clientX;
    selectionEnd.value = snapBeatRound(getRawBeat(evt.clientX), ctx.snapBeats.value);

    const scrollEl = ctx.scrollRef.value;
    if (scrollEl) {
      const r = scrollEl.getBoundingClientRect();
      const nearEdge =
        evt.clientX < r.left + SCROLL_EDGE_PX ||
        evt.clientX > r.right - SCROLL_EDGE_PX;
      if (nearEdge) startAutoScroll();
      else stopAutoScroll();
    }
  }

  function onDocMouseup(): void {
    document.removeEventListener("mousemove", onDocMousemove);
    stopAutoScroll();
    finaliseSelection();
  }

  // ── Grid mouse handlers ────────────────────────────────────────────────────

  function onMousemove(evt: MouseEvent): void {
    beatLine.value = snapBeatRound(getRawBeat(evt.clientX), ctx.snapBeats.value);
    if (!isSelecting.value) return;
    lastMouseX = evt.clientX;
    selectionEnd.value = snapBeatRound(getRawBeat(evt.clientX), ctx.snapBeats.value);
  }

  function onMouseleave(): void {
    beatLine.value = null;
    // Keep selection alive even when the cursor leaves the grid.
  }

  function onMousedown(evt: MouseEvent): void {
    if (evt.button !== 0) return;
    evt.preventDefault();

    const snappedBeat = snapBeatRound(getRawBeat(evt.clientX), ctx.snapBeats.value);
    selectionStart.value = snappedBeat;
    selectionEnd.value = snappedBeat;
    isSelecting.value = true;
    lastMouseX = evt.clientX;

    document.addEventListener("mousemove", onDocMousemove);
    document.addEventListener("mouseup", onDocMouseup, { once: true });
  }

  onUnmounted(() => {
    stopAutoScroll();
    document.removeEventListener("mousemove", onDocMousemove);
    document.removeEventListener("mouseup", onDocMouseup);
  });

  // ── Public interface ───────────────────────────────────────────────────────

  return {
    cursor: "text" as const,
    beatLine,
    selectionRange,
    selectedNoteIds,
    isSelecting,
    onMousedown,
    onMousemove,
    onMouseleave,
  };
}

export type CopyTool = ReturnType<typeof useCopyTool>;
