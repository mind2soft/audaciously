// composables/useSegmentDrag.ts
// useSegmentDrag — mouse-based drag-to-move and drag-to-trim for timeline segments.
// See: .opencode/context/refactor/06-tasks.md (P4-03)
//
// Returns event-handler starters that components bind to mousedown events on
// segment blocks and their trim handles. Document-level mousemove/mouseup
// listeners track the drag after initiation (same pattern as usePinchGesture.ts).
//
// Overlap prevention: when moving a segment, the new time is clamped so the
// segment cannot overlap with other segments on the same track. Snaps to the
// nearest non-overlapping position.
//
// Usage:
//   const drag = useSegmentDrag(pixelsPerSecondRef)
//   // In template:
//   @mousedown.prevent="drag.startMoveDrag(seg.id, track.id, $event)"
//   @mousedown.prevent="drag.startTrimStartDrag(seg.id, $event)"
//   @mousedown.prevent="drag.startTrimEndDrag(seg.id, $event)"

import { ref, onUnmounted, type Ref } from "vue";
import { useSequenceStore } from "../stores/sequence";
import { useNodesStore } from "../stores/nodes";
import type { Track } from "../features/sequence/track";
import type { Segment } from "../features/sequence/segment";

// ── Public types ───────────────────────────────────────────────────────────────

export type SegmentDragType = "move" | "trim-start" | "trim-end";

export interface UseSegmentDragReturn {
  /** True while any drag is in progress. */
  isDragging: Ref<boolean>;
  /** Which kind of drag is currently active, or null when idle. */
  dragType: Ref<SegmentDragType | null>;
  /** ID of the segment currently being dragged, or null when idle. */
  draggingSegmentId: Ref<string | null>;

  /**
   * Begin a move-drag on a segment. Call from the segment body's mousedown.
   * @param segmentId - The segment to move.
   * @param trackId   - The track that currently contains the segment.
   * @param event     - The originating MouseEvent.
   */
  startMoveDrag(segmentId: string, trackId: string, event: MouseEvent): void;

  /**
   * Begin a trim-start drag (left handle). Adjusts trimStart.
   * @param segmentId - The segment to trim.
   * @param event     - The originating MouseEvent.
   */
  startTrimStartDrag(segmentId: string, event: MouseEvent): void;

  /**
   * Begin a trim-end drag (right handle). Adjusts trimEnd.
   * @param segmentId - The segment to trim.
   * @param event     - The originating MouseEvent.
   */
  startTrimEndDrag(segmentId: string, event: MouseEvent): void;
}

// ── Internal drag state (not reactive — not needed in templates) ───────────────

interface ActiveDrag {
  segmentId: string;
  trackId: string;
  type: SegmentDragType;
  /** clientX at the moment the drag started. */
  startX: number;
  /** segment.time at drag start (seconds). */
  initialTime: number;
  /** segment.trimStart at drag start (seconds). */
  initialTrimStart: number;
  /** segment.trimEnd at drag start (seconds). */
  initialTrimEnd: number;
}

// ── Composable ─────────────────────────────────────────────────────────────────

/**
 * Provides drag-to-move and drag-to-trim interaction for timeline segments.
 *
 * @param pixelsPerSecond - Reactive ref carrying the current zoom scale.
 *   Must match the pixel-per-second ratio used when rendering segments so that
 *   pixel deltas convert correctly to time deltas.
 */
export function useSegmentDrag(
  pixelsPerSecond: Ref<number>,
): UseSegmentDragReturn {
  const sequenceStore = useSequenceStore();
  const nodesStore = useNodesStore();

  // ── Reactive state (exposed to templates) ─────────────────────────────────
  const isDragging = ref(false);
  const dragType = ref<SegmentDragType | null>(null);
  const draggingSegmentId = ref<string | null>(null);

  // ── Non-reactive drag state ────────────────────────────────────────────────
  let activeDrag: ActiveDrag | null = null;

  // ── Private helpers ────────────────────────────────────────────────────────

  function _findSegment(
    segmentId: string,
  ): { segment: Segment; track: Track } | null {
    for (const track of sequenceStore.tracks) {
      const segment = track.segments.find((s) => s.id === segmentId);
      if (segment) return { segment, track };
    }
    return null;
  }

  /** Effective playback duration of a segment (respects trim). */
  function _segmentDuration(segment: Segment): number {
    const node = nodesStore.nodesById.get(segment.nodeId);
    if (!node || node.kind === "folder" || !(node as any).buffer) return 0;
    const bufferDuration: number = (node as any).buffer.duration;
    return Math.max(0, bufferDuration - segment.trimStart - segment.trimEnd);
  }

  /**
   * Clamp `desiredTime` so that the moved segment does not overlap any other
   * segment on `track`. Snaps to the nearest valid (non-overlapping) position.
   */
  function _clampNoOverlap(
    segmentId: string,
    track: Track,
    desiredTime: number,
    segDuration: number,
  ): number {
    let clamped = Math.max(0, desiredTime);

    for (const other of track.segments) {
      if (other.id === segmentId) continue;

      const otherDuration = _segmentDuration(other);
      const otherStart = other.time;
      const otherEnd = otherStart + otherDuration;
      const myEnd = clamped + segDuration;

      // No overlap — skip.
      if (clamped >= otherEnd || myEnd <= otherStart) continue;

      // Overlap detected — snap to the side that is closer.
      const snapBefore = Math.max(0, otherStart - segDuration);
      const snapAfter = otherEnd;

      clamped =
        Math.abs(clamped - snapBefore) <= Math.abs(clamped - snapAfter)
          ? snapBefore
          : snapAfter;
    }

    return clamped;
  }

  // ── Document-level event handlers ─────────────────────────────────────────

  function _onMouseMove(event: MouseEvent): void {
    if (!activeDrag) return;

    const pps = pixelsPerSecond.value;
    if (pps <= 0) return;

    const deltaX = event.clientX - activeDrag.startX;
    const deltaTime = deltaX / pps;

    switch (activeDrag.type) {
      case "move": {
        const desiredTime = activeDrag.initialTime + deltaTime;
        const found = _findSegment(activeDrag.segmentId);
        if (!found) return;

        const track = sequenceStore.tracks.find(
          (t) => t.id === activeDrag!.trackId,
        );
        if (!track) return;

        const segDuration = _segmentDuration(found.segment);
        const clamped = _clampNoOverlap(
          activeDrag.segmentId,
          track,
          desiredTime,
          segDuration,
        );
        sequenceStore.moveSegment(activeDrag.segmentId, clamped);
        break;
      }

      case "trim-start": {
        // Dragging right → increase trimStart (cut from the start).
        // Dragging left  → decrease trimStart (reveal more of the start).
        const newTrimStart = Math.max(0, activeDrag.initialTrimStart + deltaTime);
        sequenceStore.trimSegmentStart(activeDrag.segmentId, newTrimStart);
        break;
      }

      case "trim-end": {
        // Dragging left  → increase trimEnd (cut from the end).
        // Dragging right → decrease trimEnd (reveal more of the end).
        const newTrimEnd = Math.max(0, activeDrag.initialTrimEnd - deltaTime);
        sequenceStore.trimSegmentEnd(activeDrag.segmentId, newTrimEnd);
        break;
      }
    }
  }

  function _onMouseUp(): void {
    activeDrag = null;
    isDragging.value = false;
    dragType.value = null;
    draggingSegmentId.value = null;

    document.removeEventListener("mousemove", _onMouseMove);
    document.removeEventListener("mouseup", _onMouseUp);
  }

  // ── Drag initiators ────────────────────────────────────────────────────────

  function _beginDrag(
    segmentId: string,
    trackId: string,
    type: SegmentDragType,
    event: MouseEvent,
  ): void {
    const found = _findSegment(segmentId);
    if (!found) return;

    const { segment } = found;

    activeDrag = {
      segmentId,
      trackId,
      type,
      startX: event.clientX,
      initialTime: segment.time,
      initialTrimStart: segment.trimStart,
      initialTrimEnd: segment.trimEnd,
    };

    isDragging.value = true;
    dragType.value = type;
    draggingSegmentId.value = segmentId;

    // Select the segment being dragged.
    sequenceStore.selectSegment(segmentId);

    // Attach document-level listeners so the drag continues even when the
    // pointer moves outside the segment element (same pattern as usePinchGesture).
    document.addEventListener("mousemove", _onMouseMove);
    document.addEventListener("mouseup", _onMouseUp);

    event.preventDefault();
  }

  function startMoveDrag(
    segmentId: string,
    trackId: string,
    event: MouseEvent,
  ): void {
    _beginDrag(segmentId, trackId, "move", event);
  }

  function startTrimStartDrag(segmentId: string, event: MouseEvent): void {
    const found = _findSegment(segmentId);
    if (!found) return;
    _beginDrag(segmentId, found.track.id, "trim-start", event);
  }

  function startTrimEndDrag(segmentId: string, event: MouseEvent): void {
    const found = _findSegment(segmentId);
    if (!found) return;
    _beginDrag(segmentId, found.track.id, "trim-end", event);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onUnmounted(() => {
    if (activeDrag) {
      // Clean up any dangling listeners if the component is destroyed mid-drag.
      document.removeEventListener("mousemove", _onMouseMove);
      document.removeEventListener("mouseup", _onMouseUp);
      activeDrag = null;
      isDragging.value = false;
      dragType.value = null;
      draggingSegmentId.value = null;
    }
  });

  return {
    isDragging,
    dragType,
    draggingSegmentId,
    startMoveDrag,
    startTrimStartDrag,
    startTrimEndDrag,
  };
}
