<script setup lang="ts">
/**
 * NodePanel — left column of the Project Nodes row.
 *
 * Two vertical sections:
 *   1. Section header (shrink-0) — "Nodes" label + [+ Add] dropdown
 *   2. Node Tree (flex-1, scrollable) — file-system tree of all project nodes
 *
 * Store connections
 * ─────────────────
 * useNodesStore   — node tree data + CRUD actions + select + drag-source tracking
 *
 * Drag-to-sequence protocol
 * ─────────────────────────
 * When a node row is dragged, we store its id in the HTML drag dataTransfer so
 * that SequencePanel can read it on drop and call addSegment.
 */

import { ref } from "vue";
import { useNodesStore } from "../../stores/nodes";
import NodeTree from "../controls/NodeTree.vue";
import ScrollArea from "../layout/ScrollArea.vue";
import type { MusicInstrumentId } from "../../lib/music/instruments";
import { INSTRUMENT_LIST } from "../../lib/music/instruments";

const nodes = useNodesStore();

// ── Add dropdown ───────────────────────────────────────────────────────────────

const addDropdownOpen = ref(false);

const instruments = INSTRUMENT_LIST;

// ── Create actions ─────────────────────────────────────────────────────────────

function createFolder(): void {
  addDropdownOpen.value = false;
  const name = nodes.nextFolderName();
  const node = nodes.addFolderNode(name);
  nodes.selectNode(node.id);
}

function createRecorded(): void {
  addDropdownOpen.value = false;
  const name = nodes.nextRecordedName();
  const node = nodes.addRecordedNode(name);
  nodes.selectNode(node.id);
}

function createInstrument(instrumentId: MusicInstrumentId): void {
  addDropdownOpen.value = false;
  const name = nodes.nextInstrumentName(instrumentId);
  const node = nodes.addInstrumentNode(name, instrumentId);
  nodes.selectNode(node.id);
}

// ── Drag-to-track ──────────────────────────────────────────────────────────────

function onNodeDragStart(nodeId: string): void {
  // The NodeTree/NodeTreeItem bubbles dragstart with the id.
  // The actual HTML drag event is set up in NodeTreeItem — we just propagate
  // the id here for components that may need it (SequencePanel uses dataTransfer).
  // No-op in this component beyond what NodeTreeItem already handles.
  void nodeId;
}
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-base-100">

    <!-- ── Section header ──────────────────────────────────────────────── -->
    <div class="flex items-center justify-between px-3 py-1.5 shrink-0 bg-base-200 border-b border-base-300/60">
      <span class="text-xs font-semibold text-base-content/70 uppercase tracking-wide">
        Nodes
      </span>

      <!-- [+ Add] dropdown -->
      <div class="relative">
        <button
          class="btn btn-xs btn-ghost gap-1"
          aria-haspopup="listbox"
          :aria-expanded="addDropdownOpen"
          @click="addDropdownOpen = !addDropdownOpen"
        >
          <i class="iconify mdi--plus size-3" aria-hidden="true" />
          Add
          <i class="iconify mdi--chevron-down size-3" aria-hidden="true" />
        </button>

        <ul
          v-if="addDropdownOpen"
          class="absolute right-0 top-full mt-1 z-50 menu menu-xs bg-base-300 border border-base-300/60 rounded-md shadow-md min-w-max"
          role="listbox"
        >
          <li>
            <button class="text-xs" role="option" @click="createFolder">
              <i class="iconify mdi--folder-plus-outline size-3.5" aria-hidden="true" />
              Folder
            </button>
          </li>
          <li>
            <button class="text-xs" role="option" @click="createRecorded">
              <i class="iconify mdi--microphone-outline size-3.5" aria-hidden="true" />
              Rec
            </button>
          </li>
          <li role="separator" aria-hidden="true" class="pointer-events-none"><div class="border-t border-base-content/10 my-0.5 -mx-1" /></li>
          <li v-for="instr in instruments" :key="instr.id">
            <button
              class="text-xs"
              role="option"
              @click="createInstrument(instr.id as MusicInstrumentId)"
            >
              <i class="iconify mdi--music-note size-3.5" aria-hidden="true" />
              {{ instr.label }}
            </button>
          </li>
        </ul>

        <!-- Click-away -->
        <div
          v-if="addDropdownOpen"
          class="fixed inset-0 z-40"
          aria-hidden="true"
          @click="addDropdownOpen = false"
        />
      </div>
    </div>

    <!-- ── Node Tree (scrollable, flex-1) ──────────────────────────────── -->
    <ScrollArea class="flex-1 min-h-0">
      <NodeTree
        :nodes="[...nodes.nodesById.values()]"
        :nodeMap="nodes.nodesById"
        :selectedId="nodes.selectedNodeId"
        @select="nodes.selectNode($event)"
        @dragstart="onNodeDragStart($event)"
      />

      <!-- Empty state -->
      <div
        v-if="nodes.nodesById.size === 0"
        class="flex flex-col items-center justify-center py-8 text-base-content/30 text-xs gap-1 px-4 text-center"
      >
        <i
          class="iconify mdi--folder-music-outline size-8 mb-1"
          aria-hidden="true"
        />
        <p>No nodes yet.</p>
        <p>Use [+ Add] above to create recordings or instruments.</p>
      </div>
    </ScrollArea>
  </div>
</template>
