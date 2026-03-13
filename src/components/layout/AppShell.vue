<script setup lang="ts">
/**
 * AppShell — root 4-row layout skeleton.
 *
 * Rows (top to bottom):
 *   header    — fixed ~48 px
 *   nodes     — resizable, default ~40% of remaining height
 *   timeline  — resizable, default ~50% of remaining height
 *   status    — fixed ~28 px
 *
 * The boundary between the nodes row and the timeline row is draggable.
 *
 * Named slots: `header`, `nodes`, `timeline`, `status`.
 *
 * No business logic — pure layout.
 */

import { ref } from "vue";
import ResizableRow from "./ResizableRow.vue";

// Initial row heights are proportional to the available viewport.
const HEADER_HEIGHT_PX = 48;
const STATUS_HEIGHT_PX = 28;

// Compute heights synchronously in setup — window is always available in the
// browser. Computing in onMounted is too late: ResizableRow captures
// initialHeight into a local ref at creation time, so a height of 0 passed
// during first render is never overwritten by a later prop update.
const _avail = Math.max(200, window.innerHeight - HEADER_HEIGHT_PX - STATUS_HEIGHT_PX);
const nodesHeight = ref(Math.round(_avail * 0.4));
const timelineHeight = ref(_avail - nodesHeight.value);

const onNodesResize = (h: number) => {
  nodesHeight.value = h;
};

const onTimelineResize = (h: number) => {
  timelineHeight.value = h;
};
</script>

<template>
  <div class="flex flex-col w-full h-screen overflow-hidden bg-base-100">
    <!-- ── Row 1: Header ──────────────────────────────────────────────── -->
    <header
      class="shrink-0 flex items-center bg-base-200 border-b border-base-300/60"
      :style="{ height: `${HEADER_HEIGHT_PX}px` }"
    >
      <slot name="header" />
    </header>

    <!-- ── Row 2: Project Nodes (resizable) ──────────────────────────── -->
    <ResizableRow
      :minHeight="150"
      :initialHeight="nodesHeight"
      @resize="onNodesResize"
    >
      <slot name="nodes" />
    </ResizableRow>

    <!-- ── Row 3: Timeline (fills remaining space, also resizable) ────── -->
    <ResizableRow
      :minHeight="150"
      :initialHeight="timelineHeight"
      @resize="onTimelineResize"
      class="flex-1"
    >
      <slot name="timeline" />
    </ResizableRow>

    <!-- ── Row 4: Status Bar ──────────────────────────────────────────── -->
    <footer
      class="shrink-0 flex items-center bg-base-200 border-t border-base-300/60"
      :style="{ height: `${STATUS_HEIGHT_PX}px` }"
    >
      <slot name="status" />
    </footer>
  </div>
</template>
