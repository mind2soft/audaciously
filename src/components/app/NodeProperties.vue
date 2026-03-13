<script setup lang="ts">
/**
 * NodeProperties — right column of the Project Nodes row.
 *
 * Renders node-type-specific property panels:
 *   FolderNode   — icon + editable name
 *   RecordedNode — icon + name + EffectsPanel
 *   InstrumentNode — icon + name + BPM + time signature + EffectsPanel
 *
 * Store connections
 * ─────────────────
 * useNodesStore — selectedNode, renameNode, removeNode, setNodeEffects,
 *                  setInstrumentBpm, setInstrumentTimeSignature
 */

import { computed, ref, watch, nextTick } from "vue";
import { useNodesStore } from "../../stores/nodes";
import EffectsPanel from "../controls/EffectsPanel.vue";
import type { RecordedNode, InstrumentNode } from "../../features/nodes";
import type { AudioEffect } from "../../features/effects";

const nodes = useNodesStore();

const selectedNode = computed(() => nodes.selectedNode);

const selectedRecorded = computed((): RecordedNode | null => {
  const n = selectedNode.value;
  return n?.kind === "recorded" ? (n as RecordedNode) : null;
});

const selectedInstrument = computed((): InstrumentNode | null => {
  const n = selectedNode.value;
  return n?.kind === "instrument" ? (n as InstrumentNode) : null;
});

function onRename(name: string): void {
  if (selectedNode.value && name.trim()) {
    nodes.renameNode(selectedNode.value.id, name.trim());
  }
}

function onUpdateEffects(effects: AudioEffect[]): void {
  if (selectedNode.value) {
    nodes.setNodeEffects(selectedNode.value.id, effects);
  }
}

function onUpdateBpm(event: Event): void {
  const v = parseFloat((event.target as HTMLInputElement).value);
  if (selectedInstrument.value && !isNaN(v) && v > 0) {
    nodes.setInstrumentBpm(selectedInstrument.value.id, Math.max(1, Math.min(999, v)));
  }
}

function onUpdateTimeSignatureNum(event: Event): void {
  const v = parseInt((event.target as HTMLInputElement).value, 10);
  if (selectedInstrument.value && !isNaN(v) && v > 0) {
    const current = selectedInstrument.value.timeSignature;
    nodes.setInstrumentTimeSignature(selectedInstrument.value.id, {
      ...current,
      beatsPerMeasure: Math.max(1, Math.min(32, v)),
    });
  }
}

function onUpdateTimeSignatureDen(event: Event): void {
  const v = parseInt((event.target as HTMLInputElement).value, 10);
  if (selectedInstrument.value && !isNaN(v) && v > 0) {
    const current = selectedInstrument.value.timeSignature;
    nodes.setInstrumentTimeSignature(selectedInstrument.value.id, {
      ...current,
      beatUnit: Math.max(1, Math.min(32, v)),
    });
  }
}

/** Icon class per node kind. */
const nodeIcon = computed((): string => {
  const n = selectedNode.value;
  if (!n) return "";
  if (n.kind === "folder") return "mdi--folder-outline";
  if (n.kind === "recorded") return "mdi--microphone-outline";
  const inst = (n as InstrumentNode).instrumentId;
  return inst === "drums" ? "mdi--drum" : "mdi--piano";
});

/** Buffer duration (seconds) for fade effect slider max. */
const bufferDuration = computed((): number | undefined => {
  if (selectedRecorded.value?.buffer) return selectedRecorded.value.buffer.duration;
  if (selectedInstrument.value?.buffer) return selectedInstrument.value.buffer.duration;
  return undefined;
});

// ── Delete with confirmation ───────────────────────────────────────────────────

const confirmDelete = ref(false);
const deleteCancelBtnRef = ref<HTMLButtonElement | null>(null);

/** Snapshot the node name/kind at the moment the dialog opens so the
 *  message stays stable even if selection changes while dialog is open. */
const deleteTarget = ref<{ id: string; name: string; isFolder: boolean } | null>(null);

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
  if (target) {
    nodes.removeNode(target.id);
  }
}

/** Move focus to Cancel when the delete dialog opens so Escape / Enter work. */
watch(confirmDelete, async (val) => {
  if (val) {
    await nextTick();
    deleteCancelBtnRef.value?.focus();
  }
});
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-base-100">

    <!-- ── Empty / FolderNode header ───────────────────────────────────── -->
    <div
      v-if="!selectedNode"
      class="flex items-center justify-center h-full text-base-content/25 text-sm"
    >
      <span>No node selected</span>
    </div>

    <!-- ── Node is selected ─────────────────────────────────────────────── -->
    <template v-else>

      <!-- Name row -->
      <div class="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-300/60 shrink-0">
        <i class="iconify size-4 shrink-0 text-base-content/60" :class="nodeIcon" aria-hidden="true" />
        <input
          type="text"
          class="input input-xs flex-1 min-w-0 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary/50 rounded"
          :value="selectedNode.name"
          @change="onRename(($event.target as HTMLInputElement).value)"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <!-- Delete button -->
        <button
          class="btn btn-ghost btn-xs min-h-0 h-6 w-6 p-0 shrink-0 text-error/60 hover:text-error"
          title="Delete node"
          aria-label="Delete node"
          @click="requestDelete"
        >
          <i class="iconify mdi--trash-can-outline size-4" aria-hidden="true" />
        </button>
      </div>

      <!-- ─ FolderNode: no additional properties ─────────────────────── -->
      <div
        v-if="selectedNode.kind === 'folder'"
        class="flex items-center justify-center flex-1 text-xs text-base-content/30"
      >
        Folder — no additional properties
      </div>

      <!-- ─ InstrumentNode: BPM + time signature ─────────────────────── -->
      <div
        v-if="selectedInstrument"
        class="flex flex-col gap-2 px-3 py-2 bg-base-200/50 border-b border-base-300/60 shrink-0"
      >
        <!-- BPM row -->
        <label class="flex items-center gap-1.5 text-xs text-base-content/70">
          <span class="shrink-0 w-8">BPM</span>
          <input
            type="number"
            class="input input-xs w-16 tabular-nums"
            min="1"
            max="999"
            :value="selectedInstrument.bpm"
            @change="onUpdateBpm"
          />
        </label>

        <!-- Beat row -->
        <div class="flex items-center gap-1 text-xs text-base-content/70">
          <span class="shrink-0 w-8">Beat</span>
          <select
            class="select select-xs w-14 tabular-nums"
            :value="selectedInstrument.timeSignature.beatsPerMeasure"
            @change="onUpdateTimeSignatureNum"
          >
            <option v-for="n in [1,2,3,4,5,6,7,8,9,10,11,12]" :key="n" :value="n">{{ n }}</option>
          </select>
          <span class="px-0.5">/</span>
          <select
            class="select select-xs w-14 tabular-nums"
            :value="selectedInstrument.timeSignature.beatUnit"
            @change="onUpdateTimeSignatureDen"
          >
            <option v-for="d in [1,2,4,8,16,32]" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
      </div>

      <!-- ─ Effects panel (RecordedNode + InstrumentNode) ─────────────── -->
      <div
        v-if="selectedRecorded || selectedInstrument"
        class="flex-1 overflow-y-auto min-h-0"
      >
        <EffectsPanel
          :effects="(selectedRecorded ?? selectedInstrument)!.effects"
          :maxDuration="bufferDuration"
          @update:effects="onUpdateEffects"
        />
      </div>

    </template>

    <!-- ── Delete confirmation dialog ────────────────────────────────────── -->
    <dialog class="modal" :class="{ 'modal-open': confirmDelete }">
      <div class="modal-box bg-base-300 max-w-sm">
        <h3 class="mb-2 text-lg font-bold">Delete Node?</h3>
        <p class="py-3 text-sm text-base-content/70">
          <template v-if="deleteTarget?.isFolder">
            Delete folder <strong class="text-base-content">{{ deleteTarget?.name }}</strong>
            and all its contents? This action cannot be undone.
          </template>
          <template v-else>
            Delete <strong class="text-base-content">{{ deleteTarget?.name }}</strong>?
            This action cannot be undone.
          </template>
        </p>
        <div class="modal-action">
          <button class="btn btn-ghost" ref="deleteCancelBtnRef" @click="cancelDelete">Cancel</button>
          <button class="btn btn-error" @click="doDelete">Delete</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop" @click="cancelDelete">
        <button>close</button>
      </form>
    </dialog>

  </div>
</template>

