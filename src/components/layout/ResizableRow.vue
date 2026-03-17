<script setup lang="ts">
/**
 * ResizableRow — a vertically resizable container.
 *
 * Dragging the bottom drag-handle resizes the row. The row clips at minHeight.
 * Emits `resize` with the new pixel height after each drag.
 *
 * Props
 * ─────
 * minHeight      Minimum height in px. Default: 80.
 * initialHeight  Starting height in px. Default: 200.
 */

import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    minHeight?: number;
    initialHeight?: number;
  }>(),
  {
    minHeight: 80,
    initialHeight: 200,
  },
);

const emit = defineEmits<{
  resize: [height: number];
}>();

const height = ref(props.initialHeight);

let dragStartY = 0;
let dragStartHeight = 0;

const onDragStart = (evt: MouseEvent) => {
  evt.preventDefault();
  dragStartY = evt.clientY;
  dragStartHeight = height.value;

  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
};

const onDragMove = (evt: MouseEvent) => {
  const delta = evt.clientY - dragStartY;
  const next = Math.max(props.minHeight, dragStartHeight + delta);
  height.value = next;
};

const onDragEnd = () => {
  emit("resize", height.value);
  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", onDragEnd);
};
</script>

<template>
  <div
    class="relative flex flex-col overflow-hidden"
    :style="{ height: `${height}px` }"
  >
    <!-- Slot content fills the row -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <slot />
    </div>

    <!-- Drag handle at the bottom border.
         Outer zone is h-3 (12 px) for an easy grab target; the visible rule
         stays a single 1 px line pinned to the bottom of the zone. -->
    <div
      class="absolute bottom-0 left-0 right-0 h-3 cursor-row-resize group z-10"
      @mousedown="onDragStart"
    >
      <div
        class="absolute bottom-0 left-0 right-0 h-px bg-base-300/60 group-hover:bg-primary/60 transition-colors"
      />
    </div>
  </div>
</template>
