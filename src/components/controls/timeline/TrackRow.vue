<script setup lang="ts">
/**
 * TrackRow — a single resizable, sortable timeline track row.
 *
 * The row is split horizontally:
 *   - Left label area (~120px): track name, mute, lock icons → all pure emits.
 *   - Right content area (flex-1): slot for SegmentBlock children.
 *
 * Props
 * ─────
 * track        The Track data to display.
 *
 * Emits
 * ─────
 * resize(height)     User finished dragging the bottom resize handle.
 * drop               A draggable was dropped onto this track's content area.
 * toggle-mute        User clicked the mute button.
 * toggle-lock        User clicked the lock button.
 */

import { onBeforeUnmount, ref } from "vue";
import type { Track } from "../../../features/sequence/track";

const props = defineProps<{
  track: Track;
}>();

const emit = defineEmits<{
  resize: [height: number];
  drop: [event: DragEvent];
  "toggle-mute": [];
  "toggle-lock": [];
}>();

// ── Vertical resize ──────────────────────────────────────────────────────────

const rowRef = ref<HTMLDivElement>();
const isResizing = ref(false);
const startY = ref(0);
const startHeight = ref(0);

const onResizeMousedown = (evt: MouseEvent) => {
  evt.preventDefault();
  isResizing.value = true;
  startY.value = evt.clientY;
  startHeight.value = props.track.height;

  document.addEventListener("mousemove", onResizeMousemove);
  document.addEventListener("mouseup", onResizeMouseup);
};

const onResizeMousemove = (evt: MouseEvent) => {
  if (!isResizing.value) return;
  const delta = evt.clientY - startY.value;
  const newHeight = Math.max(32, startHeight.value + delta);
  if (rowRef.value) rowRef.value.style.height = `${newHeight}px`;
};

const onResizeMouseup = (evt: MouseEvent) => {
  isResizing.value = false;
  document.removeEventListener("mousemove", onResizeMousemove);
  document.removeEventListener("mouseup", onResizeMouseup);

  const delta = evt.clientY - startY.value;
  const newHeight = Math.max(32, startHeight.value + delta);
  emit("resize", newHeight);
};

// ── Drag & Drop (sort handle) ────────────────────────────────────────────────

onBeforeUnmount(() => {
  // Clean up resize listeners if the row unmounts while a drag is in progress.
  document.removeEventListener("mousemove", onResizeMousemove);
  document.removeEventListener("mouseup", onResizeMouseup);
});

const onSortDragstart = (evt: DragEvent) => {
  evt.dataTransfer?.setData("application/x-audaciously-track-id", props.track.id);
};

// ── Drop target ──────────────────────────────────────────────────────────────

const onDragover = (evt: DragEvent) => {
  evt.preventDefault(); // allow drop
};

const onDrop = (evt: DragEvent) => {
  evt.preventDefault();
  emit("drop", evt);
};
</script>

<template>
  <div
    ref="rowRef"
    class="flex w-full border-b border-base-300/60 relative"
    :style="{ height: `${track.height}px` }"
  >
    <!-- ── Left label area ──────────────────────────────────────────────── -->
    <div
      class="flex items-center gap-1 px-2 shrink-0 w-30 bg-base-200 border-r border-base-300/60 select-none"
    >
      <!-- Sort drag handle -->
      <button
        class="btn btn-ghost btn-xs min-h-0 h-6 w-5 p-0 cursor-grab active:cursor-grabbing shrink-0 text-base-content/40"
        draggable="true"
        @dragstart="onSortDragstart"
        title="Drag to reorder"
        aria-label="Drag to reorder track"
      >
        <i class="iconify mdi--drag-vertical size-4" aria-hidden="true" />
      </button>

      <!-- Track name (truncated) -->
      <span
        class="flex-1 text-xs truncate text-base-content/80 font-medium"
        :title="track.name"
      >
        {{ track.name }}
      </span>

      <!-- Mute button -->
      <button
        class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 shrink-0"
        :class="track.muted ? 'text-warning' : 'text-base-content/40'"
        :title="track.muted ? 'Unmute track' : 'Mute track'"
        :aria-label="track.muted ? 'Unmute track' : 'Mute track'"
        :aria-pressed="track.muted"
        @click="emit('toggle-mute')"
      >
        <i
          :class="
            track.muted
              ? 'iconify mdi--volume-off'
              : 'iconify mdi--volume-medium'
          "
          class="size-4"
          aria-hidden="true"
        />
      </button>

      <!-- Lock button -->
      <button
        class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 shrink-0"
        :class="track.locked ? 'text-error' : 'text-base-content/40'"
        :title="track.locked ? 'Unlock track' : 'Lock track'"
        :aria-label="track.locked ? 'Unlock track' : 'Lock track'"
        :aria-pressed="track.locked"
        @click="emit('toggle-lock')"
      >
        <i
          :class="
            track.locked
              ? 'iconify mdi--lock'
              : 'iconify mdi--lock-open-outline'
          "
          class="size-4"
          aria-hidden="true"
        />
      </button>
    </div>

    <!-- ── Right content area (segments slot) ────────────────────────────── -->
    <div
      class="flex-1 relative overflow-hidden bg-base-100"
      @dragover="onDragover"
      @drop="onDrop"
    >
      <slot />
    </div>

    <!-- ── Bottom resize handle ────────────────────────────────────────────── -->
    <div
      class="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/30 active:bg-primary/50 z-10"
      :class="isResizing ? 'bg-primary/50' : ''"
      @mousedown="onResizeMousedown"
      title="Drag to resize track height"
      aria-hidden="true"
    />
  </div>
</template>
