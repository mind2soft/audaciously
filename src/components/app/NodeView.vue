<script setup lang="ts">
/**
 * NodeView — thin routing shell.
 *
 * Reads the selected node from the store and delegates rendering to one of the
 * specialized node-view components. No logic lives here.
 */

import { computed } from "vue";
import { useNodesStore } from "../../stores/nodes";
import type { RecordedNode, InstrumentNode } from "../../features/nodes";
import EmptyNodeView from "./node-views/EmptyNodeView.vue";
import RecordedNodeView from "./node-views/RecordedNodeView.vue";
import PianoNodeView from "./node-views/PianoNodeView.vue";
import DrumNodeView from "./node-views/DrumNodeView.vue";

const nodes = useNodesStore();

const selectedRecorded = computed((): RecordedNode | null => {
  const n = nodes.selectedNode;
  return n?.kind === "recorded" ? (n as RecordedNode) : null;
});

const selectedInstrument = computed((): InstrumentNode | null => {
  const n = nodes.selectedNode;
  return n?.kind === "instrument" ? (n as InstrumentNode) : null;
});
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-base-100">
    <!-- Recorded node -->
    <RecordedNodeView
      v-if="selectedRecorded"
      :node="selectedRecorded"
      class="w-full h-full"
    />

    <!-- Piano instrument -->
    <PianoNodeView
      v-else-if="selectedInstrument?.instrumentType === 'piano'"
      :node="selectedInstrument"
      class="w-full h-full"
    />

    <!-- Drum instrument -->
    <DrumNodeView
      v-else-if="selectedInstrument?.instrumentType === 'drums'"
      :node="selectedInstrument"
      class="w-full h-full"
    />

    <!-- Nothing selected -->
    <div v-else class="flex-1 flex items-center justify-center">
      <EmptyNodeView />
    </div>
  </div>
</template>
