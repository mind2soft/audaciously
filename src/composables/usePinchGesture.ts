import { onMounted, onUnmounted, type Ref } from "vue";

export type PinchGestureOptions = {
  /**
   * Called continuously during a two-pointer pinch gesture.
   *
   * `scaleDelta` is the ratio new_distance / old_distance:
   *   > 1  →  fingers spreading apart  →  zoom in
   *   < 1  →  fingers coming together  →  zoom out
   */
  onPinch?: (scaleDelta: number) => void;

  /**
   * Called continuously during a single-pointer drag (touch or stylus only —
   * mouse events are deliberately ignored so the existing mousedown/mousemove
   * handlers can coexist without conflict).
   *
   * `deltaX` / `deltaY` are incremental pixel deltas since the last event.
   */
  onDrag?: (deltaX: number, deltaY: number) => void;
};

/**
 * Reusable composable for pinch-to-zoom and touch-drag gestures.
 *
 * Uses the browser's native Pointer Events API, which works uniformly for
 * touch fingers, stylus pens, and trackpad gestures.  Mouse pointers are
 * deliberately skipped so existing mouse-event handlers remain unchanged.
 *
 * The `pointerdown` listener is scoped to `elementRef` so gestures only
 * activate when they start inside that element.  `pointermove` / `pointerup`
 * are attached to `document` (mirroring the project's existing mouse-drag
 * pattern) so drags remain tracked even when a finger slides outside the
 * element boundary.
 *
 * **Required CSS**: Add `touch-action: none` (Tailwind `touch-none`) to the
 * target element so the browser does not claim pointer events for its own
 * scrolling or pinch-zoom before our handlers receive them.
 *
 * @param elementRef - Vue template ref pointing to the gesture target element.
 * @param options    - `onPinch` and/or `onDrag` callbacks.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const containerRef = ref<HTMLElement | null>(null)
 *
 * usePinchGesture(containerRef, {
 *   onPinch: (scale) => { zoom.value *= scale },
 *   onDrag:  (dx, dy) => { panX.value -= dx },
 * })
 * </script>
 *
 * <template>
 *   <div ref="containerRef" class="touch-none"> … </div>
 * </template>
 * ```
 */
export function usePinchGesture(
  elementRef: Ref<HTMLElement | null>,
  options: PinchGestureOptions,
): void {
  /**
   * Active non-mouse pointers keyed by pointerId → last known position.
   * Only pointers whose `pointerdown` fired inside `elementRef` are tracked.
   */
  const activePointers = new Map<number, { x: number; y: number }>();

  /** Distance between the two active pointers at the start of the last move. */
  let lastPinchDistance = 0;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const euclidean = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  };

  /** Returns the distance between the two currently tracked pointers. */
  const twoPointerDistance = (): number => {
    const [a, b] = Array.from(activePointers.values());
    return euclidean(a, b);
  };

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /** Scoped to the element — only register pointers that start here. */
  const onPointerDown = (evt: PointerEvent): void => {
    if (evt.pointerType === "mouse") return;

    activePointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });

    if (activePointers.size === 2) {
      lastPinchDistance = twoPointerDistance();
    }
  };

  /** Attached to document for tracking continuity outside the element. */
  const onDocumentPointerMove = (evt: PointerEvent): void => {
    if (evt.pointerType === "mouse") return;
    if (!activePointers.has(evt.pointerId)) return;

    const prev = activePointers.get(evt.pointerId);

    if (!prev) return;

    const curr = { x: evt.clientX, y: evt.clientY };

    activePointers.set(evt.pointerId, curr);

    if (activePointers.size === 2) {
      // ── Pinch ──────────────────────────────────────────────────────────────
      const distance = twoPointerDistance();
      if (lastPinchDistance > 0) {
        options.onPinch?.(distance / lastPinchDistance);
      }
      lastPinchDistance = distance;
    } else if (activePointers.size === 1) {
      // ── Single-pointer drag ────────────────────────────────────────────────
      options.onDrag?.(curr.x - prev.x, curr.y - prev.y);
    }
  };

  const onDocumentPointerUp = (evt: PointerEvent): void => {
    if (evt.pointerType === "mouse") return;
    activePointers.delete(evt.pointerId);
    // Re-snapshot distance so the remaining pointer can continue cleanly.
    lastPinchDistance = activePointers.size === 2 ? twoPointerDistance() : 0;
  };

  const onDocumentPointerCancel = (evt: PointerEvent): void => {
    activePointers.delete(evt.pointerId);
    lastPinchDistance = 0;
  };

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onMounted(() => {
    const el = elementRef.value;
    if (!el) return;

    el.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onDocumentPointerMove);
    document.addEventListener("pointerup", onDocumentPointerUp);
    document.addEventListener("pointercancel", onDocumentPointerCancel);
  });

  onUnmounted(() => {
    const el = elementRef.value;
    if (el) {
      el.removeEventListener("pointerdown", onPointerDown);
    }
    document.removeEventListener("pointermove", onDocumentPointerMove);
    document.removeEventListener("pointerup", onDocumentPointerUp);
    document.removeEventListener("pointercancel", onDocumentPointerCancel);
  });
}
