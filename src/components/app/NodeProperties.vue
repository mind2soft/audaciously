<script setup lang="ts">
/**
 * NodeProperties — right column of the Project Nodes row.
 *
 * Lean shell: renders the name row + delete dialog, then delegates
 * to the appropriate per-type panel via dynamic component.
 */

import { computed, nextTick, ref, watch } from "vue";
import type { AudioEffect } from "../../features/effects";
import type { InstrumentNode } from "../../features/nodes";
import { getBuffer } from "../../lib/audio/audio-buffer-repository";
import type { MusicInstrumentType } from "../../lib/music/instruments";
import { useNodesStore } from "../../stores/nodes";
import EffectsPipeline from "../controls/effects/EffectsPipeline.vue";
import FolderNodeProperties from "./node-properties/FolderNodeProperties.vue";
import InstrumentNodeProperties from "./node-properties/InstrumentNodeProperties.vue";
import PianoNodeProperties from "./node-properties/PianoNodeProperties.vue";
import RecordedNodeProperties from "./node-properties/RecordedNodeProperties.vue";

const nodes = useNodesStore();

const selectedNode = computed(() => nodes.selectedNode);

const selectedNodeKind = computed(() => selectedNode.value?.kind ?? null);

const selectedInstrument = computed((): InstrumentNode<MusicInstrumentType> | null => {
  const n = selectedNode.value;
  return n?.kind === "instrument" ? (n as InstrumentNode<MusicInstrumentType>) : null;
});

/** The instrument-specific sub-panel: Piano or Drum (null = no sub-panel). */
const instrumentSubPanel = computed(() => {
  const inst = selectedInstrument.value;
  if (!inst) return null;
  return inst.instrumentType === "piano" ? PianoNodeProperties : null;
});

/** Icon class per node kind. */
const nodeIcon = computed((): string => {
  const n = selectedNode.value;
  if (!n) return "";
  if (n.kind === "folder") return "mdi--folder-outline";
  if (n.kind === "recorded") return "mdi--microphone-outline";
  const inst = (n as InstrumentNode<MusicInstrumentType>).instrumentType;
  return inst === "drums" ? "mdi--drum" : "mdi--piano";
});

function onRename(name: string): void {
  if (selectedNode.value && name.trim()) {
    nodes.renameNode(selectedNode.value.id, name.trim());
  }
}

/** Source label and icon for EffectsPipeline (instrument nodes only). */
const instrumentSourceLabel = computed((): string => {
  const inst = selectedInstrument.value;
  if (!inst) return "Instrument";
  return inst.instrumentType === "drums" ? "Drums" : "Piano";
});

const instrumentSourceIcon = computed((): string => {
  const inst = selectedInstrument.value;
  if (!inst) return "mdi--music-note";
  return inst.instrumentType === "drums" ? "mdi--drum" : "mdi--piano";
});

const bufferDuration = computed(() => {
  const id = selectedInstrument.value?.targetBufferId;
  return id ? getBuffer(id)?.duration : undefined;
});

function onUpdateEffects(effects: AudioEffect[]): void {
  const n = selectedInstrument.value;
  if (n) {
    n.effects = effects;
  }
}

// ── Delete with confirmation ───────────────────────────────────────────────────

const confirmDelete = ref(false);
const deleteCancelBtnRef = ref<HTMLButtonElement | null>(null);

const deleteTarget = ref<{
  id: string;
  name: string;
  isFolder: boolean;
} | null>(null);

function requestDelete(): void {
  const n = selectedNode.value;
  if (!n) return;
  deleteTarget.value = {
    id: n.id,
    name: n.name,
    isFolder: n.kind === "folder",
  };
  confirmDelete.value = true;
}

function cancelDelete(): void {
  confirmDelete.value = false;
  deleteTarget.value = null;
}

function doDelete(): void {
  const target = deleteTarget.value;
  confirmDelete.value = false;
  deleteTarget.value = null;
  if (target) nodes.removeNode(target.id);
}

watch(confirmDelete, async (val) => {
  if (val) {
    await nextTick();
    deleteCancelBtnRef.value?.focus();
  }
});
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-base-200">
    <!-- Empty state -->
    <div
      v-if="!selectedNode"
      class="flex items-center justify-center h-full text-base-content/25 text-sm"
    >
      <span>No node selected</span>
    </div>

    <template v-else>
      <!-- Name row -->
      <div
        class="flex items-center gap-2 px-3 py-2 border-b border-base-300/60 shrink-0"
      >
        <i
          class="iconify size-4 shrink-0 text-base-content/60"
          :class="nodeIcon"
          aria-hidden="true"
        />
        <input
          type="text"
          class="input input-xs flex-1 min-w-0 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary/50 rounded"
          :value="selectedNode.name"
          @change="onRename(($event.target as HTMLInputElement).value)"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <button
          class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 shrink-0 text-error/60 hover:text-error"
          title="Delete node"
          aria-label="Delete node"
          @click="requestDelete"
        >
          <i class="iconify mdi--trash-can-outline size-4" aria-hidden="true" />
        </button>
      </div>

      <!-- Folder: no properties -->
      <FolderNodeProperties v-if="selectedNode.kind === 'folder'" />

      <!-- RecordedNode: effects panel -->
      <RecordedNodeProperties
        v-else-if="selectedNodeKind === 'recorded'"
        :node-id="nodes.selectedNodeId!"
      />

      <!-- InstrumentNode: pipeline (source slot contains common + specific properties) -->
      <div
        v-else-if="selectedInstrument"
        class="flex flex-col flex-1 min-h-0 overflow-hidden"
      >
        <EffectsPipeline
          :key="selectedInstrument.id"
          :effects="selectedInstrument.effects"
          :maxDuration="bufferDuration"
          :sourceLabel="instrumentSourceLabel"
          :sourceIcon="instrumentSourceIcon"
          @update:effects="onUpdateEffects"
        >
          <template #source-properties>
            <div class="flex flex-col">
              <!-- 1. Common: Tempo & Meter -->
              <InstrumentNodeProperties :node-id="nodes.selectedNodeId!" />
              <!-- 2. Specific: Piano (octave range + note duration) or Drum (step size) -->
              <template v-if="instrumentSubPanel">
                <div class="border-t border-base-300/40" />
                <component
                  :is="instrumentSubPanel"
                  :node-id="nodes.selectedNodeId!"
                />
              </template>
            </div>
          </template>
        </EffectsPipeline>
      </div>
    </template>

    <!-- Delete confirmation dialog -->
    <dialog class="modal" :class="{ 'modal-open': confirmDelete }">
      <div class="modal-box bg-base-300 max-w-sm">
        <h3 class="mb-2 text-lg font-bold">Delete Node?</h3>
        <p class="py-3 text-sm text-base-content/70">
          <template v-if="deleteTarget?.isFolder">
            Delete folder
            <strong class="text-base-content">{{ deleteTarget?.name }}</strong>
            and all its contents? This action cannot be undone.
          </template>
          <template v-else>
            Delete
            <strong class="text-base-content">{{ deleteTarget?.name }}</strong
            >? This action cannot be undone.
          </template>
        </p>
        <div class="modal-action">
          <button
            class="btn btn-ghost"
            ref="deleteCancelBtnRef"
            @click="cancelDelete"
          >
            Cancel
          </button>
          <button class="btn btn-error" @click="doDelete">Delete</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop" @click="cancelDelete">
        <button>close</button>
      </form>
    </dialog>
  </div>
</template>
