<script setup lang="ts">
/**
 * App.vue — root shell.
 *
 * Thin layout wrapper:
 *   - Mounts AppShell with 4 named slots
 *   - Handles Ctrl+S keyboard shortcut (delegates to useProjectStore.doSave)
 *   - Renders app-level modals: unsaved-prompt, metadata dialog, ExportAudioDialog, ProjectBrowser
 *
 * No business logic — all state lives in Pinia stores.
 */

import { computed, onMounted, onUnmounted, provide, ref, watch } from "vue";
import AppHeader from "./components/app/AppHeader.vue";
import NodePanel from "./components/app/NodePanel.vue";
import NodeProperties from "./components/app/NodeProperties.vue";
import NodeView from "./components/app/NodeView.vue";
import ProjectBrowser from "./components/app/ProjectBrowser.vue";
import SequenceEffectsPanel from "./components/app/SequenceEffectsPanel.vue";
import SequencePanel from "./components/app/SequencePanel.vue";
import StatusBar from "./components/app/StatusBar.vue";
import ExportAudioDialog from "./components/ExportAudioDialog.vue";
import AppShell from "./components/layout/AppShell.vue";
import SplitPanel from "./components/layout/SplitPanel.vue";
import ProjectMetadataForm from "./components/ProjectMetadataForm.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import { useAllNodes } from "./composables/useAllNodes";
import { useNodePlayback } from "./composables/useNodePlayback";
import { NodePlaybackContextKey, PlaybackContextKey } from "./composables/usePlaybackContext";
import type { InstrumentNode, RecordedNode } from "./features/nodes";
import type { ProjectMetadata } from "./lib/storage/project-metadata";
import { createDefaultMetadata } from "./lib/storage/project-metadata";
import { useNodesStore } from "./stores/nodes";
import { useProjectStore } from "./stores/project";

const project = useProjectStore();

// Wire reactive buffer-recompute loops for ALL nodes in the tree so every
// node maintains a live targetBuffer regardless of which node is selected.
useAllNodes();

// ── Node playback context ─────────────────────────────────────────────────────
// A single useNodePlayback instance is created here — the only ancestor of
// both NodeView (waveform/piano/drum controls) and NodeProperties (EffectVolume).
// Both subtrees inject the same instance so seeking in one is visible in the other.

const nodes = useNodesStore();
const selectedNodeRef = computed((): RecordedNode | InstrumentNode | null => {
  const n = nodes.selectedNode;
  return n?.kind === "recorded" || n?.kind === "instrument" ? n : null;
});

const nodePlayback = useNodePlayback(selectedNodeRef);
provide(PlaybackContextKey, { currentTime: nodePlayback.currentTime, seek: nodePlayback.seek });
provide(NodePlaybackContextKey, nodePlayback);

// ── Metadata dialog state ─────────────────────────────────────────────────────
// stagedMetadata is a local copy so edits don't mutate the store until confirmed.

const stagedMetadata = ref<ProjectMetadata>(createDefaultMetadata());

const metadataDialogTitle = computed(() => {
  if (project.metadataMode === "new") return "New Project";
  if (project.metadataMode === "save-as") return "Save As";
  return "Project Info";
});

const metadataDialogConfirmLabel = computed(() => {
  if (project.metadataMode === "new") return "Create";
  if (project.metadataMode === "save-as") return "Save";
  return "Done";
});

// Ref to the form so we can read its exposed `isValid` computed.
const metadataFormRef = ref<InstanceType<typeof ProjectMetadataForm> | null>(null);

// ── Dialog refs ───────────────────────────────────────────────────────────────

const metadataDialogRef = ref<HTMLDialogElement | null>(null);
const unsavedDialogRef = ref<HTMLDialogElement | null>(null);

watch(
  () => project.metadataOpen,
  (open) => {
    if (!metadataDialogRef.value) return;
    if (open) {
      if (!metadataDialogRef.value.open) metadataDialogRef.value.showModal();
    } else {
      if (metadataDialogRef.value.open) metadataDialogRef.value.close();
    }
  },
);

watch(
  () => project.unsavedPromptOpen,
  (open) => {
    if (!unsavedDialogRef.value) return;
    if (open) {
      if (!unsavedDialogRef.value.open) unsavedDialogRef.value.showModal();
    } else {
      if (unsavedDialogRef.value.open) unsavedDialogRef.value.close();
    }
  },
);

// When the dialog opens, populate stagedMetadata from current project state.
watch(
  () => project.metadataOpen,
  (open) => {
    if (!open) return;
    if (project.metadataMode === "new") {
      stagedMetadata.value = createDefaultMetadata();
    } else if (project.metadataMode === "save-as") {
      stagedMetadata.value = { ...project.metadata, name: `${project.metadata.name} (Copy)` };
    } else {
      stagedMetadata.value = { ...project.metadata };
    }
  },
);

const confirmMetadataDialog = async () => {
  project.metadataOpen = false;
  if (project.metadataMode === "edit") {
    project.metadata = { ...stagedMetadata.value };
    project.notifyDirty();
  } else if (project.metadataMode === "new") {
    project.doNew();
    project.metadata = { ...stagedMetadata.value };
  } else if (project.metadataMode === "save-as") {
    await project.doSaveAs(stagedMetadata.value);
  }
};

const cancelMetadataDialog = () => {
  project.metadataOpen = false;
};

// ── Unsaved-changes guard ─────────────────────────────────────────────────────

const unsavedDiscard = () => {
  project.unsavedPromptOpen = false;
  // The caller (AppHeader menu) sets browserOpen or metadataOpen after discarding.
};

const unsavedSave = async () => {
  await project.doSave();
  if (project.saveError) return; // leave prompt open on error
  project.unsavedPromptOpen = false;
};

const unsavedCancel = () => {
  project.unsavedPromptOpen = false;
};

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

const handleKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    void project.doSave();
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});

// ── Auto-load last project on startup ─────────────────────────────────────────

const LAST_PROJECT_KEY = "audaciously:last-project";

onMounted(async () => {
  try {
    const lastId = localStorage.getItem(LAST_PROJECT_KEY);
    if (lastId) {
      await project.doLoad(lastId);
    }
  } catch {
    // Project may have been deleted — start fresh.
    try {
      localStorage.removeItem(LAST_PROJECT_KEY);
    } catch {
      /* noop */
    }
  }
});

// Persist last-opened project id whenever it changes.
watch(
  () => project.id,
  (id) => {
    try {
      if (id) localStorage.setItem(LAST_PROJECT_KEY, id);
    } catch {
      /* noop */
    }
  },
);
</script>

<template>
  <AppShell>

    <!-- ── Row 1: Header ───────────────────────────────────────────────── -->
    <template #header>
      <AppHeader />
    </template>

    <!-- ── Row 2: Project Nodes (3-column split) ──────────────────────── -->
    <template #nodes>
      <!--
        3-column layout: NodePanel (fixed) | NodeView (flex-1) | NodeProperties (fixed)
        We use two SplitPanels nested so NodeView is the flex-1 center.
        Outer: left=NodePanel, right=NodeView+NodeProperties
        Inner (right side): left=NodeView (flex-1 since right SplitPanel grows left), right=NodeProperties
        Because SplitPanel always makes the *right* pane flex-1, we flip the inner
        panel: left=NodeView flex-1 is achieved by making NodeProperties the fixed
        right pane (240px).
      -->
      <SplitPanel :minLeft="160" :minRight="400" :initialLeft="220">
        <template #left>
          <NodePanel />
        </template>
        <template #right>
          <!-- Inner: left=NodeView (flex-1), right=NodeProperties (240px fixed) -->
          <!-- SplitPanel grows the right pane; we flip by putting NodeProperties on right -->
          <SplitPanel :minLeft="200" :minRight="200" :initialLeft="99999">
            <template #left>
              <NodeView />
            </template>
            <template #right>
              <NodeProperties />
            </template>
          </SplitPanel>
        </template>
      </SplitPanel>
    </template>

    <!-- ── Row 3: Timeline (2-column split) ───────────────────────────── -->
    <template #timeline>
      <SplitPanel :minLeft="300" :minRight="180" :initialLeft="99999">
        <template #left>
          <SequencePanel />
        </template>
        <template #right>
          <SequenceEffectsPanel />
        </template>
      </SplitPanel>
    </template>

    <!-- ── Row 4: Status Bar ──────────────────────────────────────────── -->
    <template #status>
      <StatusBar />
    </template>

  </AppShell>

  <!-- ── App-level modals ──────────────────────────────────────────────── -->

  <!-- Project Browser (self-contained modal, controlled by project.browserOpen) -->
  <ProjectBrowser />

  <!-- Project Info / New Project / Save As (unified metadata dialog) -->
  <dialog
    ref="metadataDialogRef"
    class="modal"
    @cancel.prevent="cancelMetadataDialog"
  >
    <div class="modal-box bg-base-300 max-w-md">
      <h3 class="mb-6 text-lg font-bold">{{ metadataDialogTitle }}</h3>
      <ProjectMetadataForm ref="metadataFormRef" v-model="stagedMetadata" />
      <div class="modal-action">
        <button class="btn btn-ghost" @click="cancelMetadataDialog">Cancel</button>
        <button
          class="btn btn-primary"
          :disabled="!(metadataFormRef?.isValid ?? true)"
          @click="confirmMetadataDialog"
        >
          {{ metadataDialogConfirmLabel }}
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button @click.prevent="cancelMetadataDialog">close</button>
    </form>
  </dialog>

  <!-- Unsaved changes prompt -->
  <dialog
    ref="unsavedDialogRef"
    class="modal"
    @cancel.prevent="unsavedCancel"
  >
    <div class="modal-box bg-base-300 max-w-sm">
      <h3 class="mb-2 text-lg font-bold">Unsaved Changes</h3>
      <p class="py-4 text-sm text-base-content/70">
        You have unsaved changes. Would you like to save before continuing?
      </p>
      <div class="modal-action">
        <button class="btn btn-ghost" @click="unsavedCancel">Cancel</button>
        <button class="btn btn-warning" @click="unsavedDiscard">Discard</button>
        <button class="btn btn-primary" @click="unsavedSave">Save</button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button @click.prevent="unsavedCancel">close</button>
    </form>
  </dialog>

  <!-- Export Audio dialog -->
  <ExportAudioDialog
    :open="project.exportOpen"
    :project-name="project.projectName"
    @close="project.exportOpen = false"
  />

  <!-- Settings dialog -->
  <SettingsDialog
    :open="project.settingsOpen"
    @close="project.settingsOpen = false"
  />
</template>
