<script setup lang="ts">
/**
 * SplitPanel — horizontally split panel with a draggable divider.
 *
 * Props
 * ─────
 * minLeft       Minimum left pane width in px. Default: 160.
 * minRight      Minimum right pane width in px. Default: 160.
 * initialLeft   Starting left pane width in px. Default: 220.
 *
 * Named slots: `left`, `right`.
 *
 * No business logic — pure layout.
 *
 * Implementation note: `leftWidth` is clamped to
 *   containerWidth - minRight - DIVIDER_WIDTH
 * so that an `initialLeft` larger than the available space (e.g. 99999 used
 * to mean "fill remaining") never pushes the right pane off-screen.
 */

import { ref, computed, onMounted, onBeforeUnmount } from "vue";

const DIVIDER_WIDTH = 12; // matches the w-3 (12px) hit-zone divider in the template

const props = withDefaults(
  defineProps<{
    minLeft?: number;
    minRight?: number;
    initialLeft?: number;
  }>(),
  {
    minLeft: 160,
    minRight: 160,
    initialLeft: 220,
  },
);

const containerRef = ref<HTMLDivElement>();
// Initialise to window.innerWidth so clamping works correctly on the very
// first render (before the ResizeObserver fires in onMounted). The observer
// will correct this to the true container width immediately after mount.
const containerWidth = ref(window.innerWidth);
const leftWidth = ref(props.initialLeft);
const isDragging = ref(false);

/** Maximum allowed left-pane width given the current container size. */
const maxLeft = computed(() =>
  Math.max(props.minLeft, containerWidth.value - props.minRight - DIVIDER_WIDTH),
);

/** The actual width used in the template — always clamped. */
const clampedLeftWidth = computed(() =>
  Math.min(Math.max(props.minLeft, leftWidth.value), maxLeft.value),
);

// ── ResizeObserver: keep containerWidth in sync ───────────────────────────────

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.offsetWidth;
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width;
      }
    });
    resizeObserver.observe(containerRef.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  // Clean up drag listeners if the component unmounts while the user is dragging.
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
});

// ── Divider drag ──────────────────────────────────────────────────────────────

let dragStartX = 0;
let dragStartWidth = 0;

const onDividerMousedown = (evt: MouseEvent) => {
  evt.preventDefault();
  isDragging.value = true;
  dragStartX = evt.clientX;
  dragStartWidth = clampedLeftWidth.value;

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const onMouseMove = (evt: MouseEvent) => {
  const delta = evt.clientX - dragStartX;
  // Clamp within [minLeft, maxLeft]
  leftWidth.value = Math.min(
    Math.max(props.minLeft, dragStartWidth + delta),
    maxLeft.value,
  );
};

const onMouseUp = () => {
  isDragging.value = false;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
};
</script>

<template>
  <div
    ref="containerRef"
    class="flex h-full w-full overflow-hidden"
    :class="{ 'select-none': isDragging }"
  >
    <!-- Left pane -->
    <div
      class="shrink-0 overflow-hidden"
      :style="{ width: `${clampedLeftWidth}px`, minWidth: `${minLeft}px` }"
    >
      <slot name="left" />
    </div>

    <!-- Draggable divider.
         Outer hit zone is w-3 (12 px) for easy grabbing; the visible rule is a
         centred 1 px line so the layout looks crisp. -->
    <div
      class="relative shrink-0 w-3 cursor-col-resize z-10 group"
      @mousedown="onDividerMousedown"
    >
      <div
        class="absolute inset-y-0 left-1/2 w-px -translate-x-px bg-base-300/60 group-hover:bg-primary/60 transition-colors"
        :class="{ 'bg-primary/60': isDragging }"
      />
    </div>

    <!-- Right pane: fills remaining space, but respects minRight -->
    <div
      class="flex-1 overflow-hidden"
      :style="{ minWidth: `${minRight}px` }"
    >
      <slot name="right" />
    </div>
  </div>
</template>
