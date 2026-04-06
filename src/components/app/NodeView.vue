<script setup lang="ts">
/**
 * NodeView — thin routing shell.
 *
 * Reads the selected node from the store and delegates rendering to one of the
 * specialized node-view components. No logic lives here.
 */

import { computed } from "vue";
import { useNodesStore } from "../../stores/nodes";
import DrumNodeView from "./node-views/DrumNodeView.vue";
import EmptyNodeView from "./node-views/EmptyNodeView.vue";
import PianoNodeView from "./node-views/PianoNodeView.vue";
import RecordedNodeView from "./node-views/RecordedNodeView.vue";

const nodes = useNodesStore();

const selectedNodeKind = computed(() => nodes.selectedNode?.kind ?? null);

const selectedInstrumentType = computed(() => {
  const n = nodes.selectedNode;
  return n?.kind === "instrument" ? n.instrumentType : null;
});
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-base-100">
    <!-- Recorded node -->
    <RecordedNodeView
      v-if="selectedNodeKind === 'recorded'"
      :node-id="nodes.selectedNodeId!"
      class="w-full h-full"
    />

    <!-- Piano instrument -->
    <PianoNodeView
      v-else-if="selectedInstrumentType === 'piano'"
      :node-id="nodes.selectedNodeId!"
      class="w-full h-full"
    />

    <!-- Drum instrument -->
    <DrumNodeView
      v-else-if="selectedInstrumentType === 'drums'"
      :node-id="nodes.selectedNodeId!"
      class="w-full h-full"
    />

    <!-- Nothing selected -->
    <div v-else class="flex-1 flex items-center justify-center">
      <EmptyNodeView />
    </div>
  </div>
</template>
