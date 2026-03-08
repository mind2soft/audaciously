<script setup lang="ts">
import { ref, provide, inject, onMounted, onUnmounted, effectScope, computed, watch } from "vue";
import { nanoid } from "nanoid";
import AudioPlayer from "./components/AudioPlayer.vue";
import ProjectHeader from "./components/ProjectHeader.vue";
import AudioTracks from "./components/AudioTracks.vue";
import BottomPanel from "./components/BottomPanel.vue";
import TrackSidebar from "./components/TrackSidebar.vue";
import SideMenu from "./components/SideMenu.vue";
import ProjectBrowser from "./components/ProjectBrowser.vue";
import StorageDashboard from "./components/StorageDashboard.vue";
import ProjectMetadataForm from "./components/ProjectMetadataForm.vue";
import { selectedTrackKey, playerKey, storageKey } from "./lib/provider-keys";
import type { AudioTrack } from "./lib/audio/track";
import type { AudioPlayer as AudioPlayerType } from "./lib/audio/player";
import type { StorageService } from "./lib/storage/storage-service";
import { createDefaultMetadata, type ProjectMetadata } from "./lib/storage/project-metadata";
import { createAutoSave } from "./lib/storage/auto-save";
import ExportAudioDialog from "./components/ExportAudioDialog.vue";

const selectedTrack = ref<AudioTrack<any> | null>(null);
provide(selectedTrackKey, selectedTrack);

const player = inject<AudioPlayerType>(playerKey);
if (!player) throw new Error("missing player");

const storage = inject<StorageService>(storageKey);
if (!storage) throw new Error("missing storage service");

// ─── Project state ──────────────────────────────────────────────────────────

const LAST_PROJECT_KEY = "audaciously:last-project";

const currentProjectId = ref<string | null>(null);
const metadata = ref<ProjectMetadata>(createDefaultMetadata());
const dirty = ref(false);
const saving = ref(false);
const saveError = ref<string | null>(null);

// ─── Modal state ────────────────────────────────────────────────────────────

const browserOpen = ref(false);
const exportOpen = ref(false);
const unsavedPromptOpen = ref(false);
const unsavedAction = ref<"new" | "open" | null>(null);

// ─── Project Info dialog (unified: edit / new / save-as) ────────────────────

type MetadataDialogMode = "edit" | "new" | "save-as";

const metadataOpen = ref(false);
const metadataMode = ref<MetadataDialogMode>("edit");
const stagedMetadata = ref<ProjectMetadata>(createDefaultMetadata());

const openMetadataDialog = (mode: MetadataDialogMode) => {
  metadataMode.value = mode;
  if (mode === "new") {
    stagedMetadata.value = createDefaultMetadata();
  } else if (mode === "save-as") {
    stagedMetadata.value = { ...metadata.value, name: `${metadata.value.name} (Copy)` };
  } else {
    stagedMetadata.value = { ...metadata.value };
  }
  metadataOpen.value = true;
};

const metadataDialogTitle = computed(() => {
  if (metadataMode.value === "new") return "New Project";
  if (metadataMode.value === "save-as") return "Save As";
  return "Project Info";
});

const metadataDialogConfirmLabel = computed(() => {
  if (metadataMode.value === "new") return "Create";
  if (metadataMode.value === "save-as") return "Save";
  return "Done";
});

const confirmMetadataDialog = async () => {
  metadataOpen.value = false;
  if (metadataMode.value === "edit") {
    metadata.value = { ...stagedMetadata.value };
    markDirty();
  } else if (metadataMode.value === "new") {
    doNew();
    metadata.value = { ...stagedMetadata.value };
  } else if (metadataMode.value === "save-as") {
    await doSaveAs(stagedMetadata.value);
  }
};

const cancelMetadataDialog = () => {
  metadataOpen.value = false;
};

// ─── Project Browser ref ────────────────────────────────────────────────────

const projectBrowserRef = ref<InstanceType<typeof ProjectBrowser>>();

watch(browserOpen, (open) => {
  if (open) projectBrowserRef.value?.refresh();
});

// ─── Core save logic ───────────────────────────────────────────────────────

let dirtyGeneration = 0;

const performSave = async (projectId: string): Promise<boolean> => {
  const gen = dirtyGeneration;
  saving.value = true;
  saveError.value = null;
  try {
    await storage.saveProject(projectId, player, metadata.value);
    if (dirtyGeneration === gen) dirty.value = false;
    persistLastProjectId(projectId);
    return true;
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Save failed.";
    return false;
  } finally {
    saving.value = false;
  }
};

// ─── Auto-save ─────────────────────────────────────────────────────────────

const autoSave = createAutoSave({
  shouldSave: () => !!currentProjectId.value && dirty.value && !saving.value,
  save: async () => { await performSave(currentProjectId.value!); },
  debounceMs: 5_000,
});

// ─── Dirty tracking ────────────────────────────────────────────────────────

const markDirty = () => {
  dirty.value = true;
  dirtyGeneration++;
  autoSave.notifyChange();
};

onMounted(() => {
  player.addEventListener("change", markDirty);
});

onUnmounted(() => {
  player.removeEventListener("change", markDirty);
  autoSave.dispose();
});

// ─── Save ───────────────────────────────────────────────────────────────────

const doSave = async () => {
  if (saving.value) return;
  const id = currentProjectId.value ?? nanoid();
  currentProjectId.value = id;
  const saved = await performSave(id);
  if (saved && !dirty.value) autoSave.notifySaved();
};

const doSaveAs = async (newMetadata: ProjectMetadata) => {
  if (saving.value) return;
  const newId = nanoid();
  metadata.value = { ...newMetadata };
  currentProjectId.value = newId;
  const saved = await performSave(newId);
  if (saved && !dirty.value) autoSave.notifySaved();
};

// ─── Load ───────────────────────────────────────────────────────────────────

const doLoad = async (projectId: string) => {
  try {
    // Need a temporary AudioContext to decode compressed audio.
    const ctx = new AudioContext();

    // deserializeProject creates instrument tracks that use Vue reactivity,
    // so it must run inside an effectScope.
    const scope = effectScope();
    const loaded = await scope.run(() => storage.loadProject(projectId, ctx));
    // scope stays alive — instrument tracks need their reactive watchers.

    await ctx.close();

    if (!loaded) {
      saveError.value = "Project not found.";
      return;
    }

    // Stop playback and replace tracks.
    player.stop();
    player.setTracks(loaded.data.tracks);

    // Restore metadata from the project record.
    metadata.value = {
      name: loaded.record.name,
      author: loaded.record.author,
      genre: loaded.record.genre,
      tags: [...loaded.record.tags],
      description: loaded.record.description,
    };

    currentProjectId.value = projectId;
    dirty.value = false;
    autoSave.notifySaved();
    persistLastProjectId(projectId);
    browserOpen.value = false;
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to load project.";
  }
};

// ─── New project ────────────────────────────────────────────────────────────

const doNew = () => {
  player.stop();
  player.setTracks([]);

  metadata.value = createDefaultMetadata();
  currentProjectId.value = null;
  dirty.value = false;
  autoSave.notifySaved();
  selectedTrack.value = null;
};

// ─── Unsaved changes guard ──────────────────────────────────────────────────

const guardedNew = () => {
  if (dirty.value) {
    unsavedAction.value = "new";
    unsavedPromptOpen.value = true;
  } else {
    openMetadataDialog("new");
  }
};

const guardedOpen = () => {
  if (dirty.value) {
    unsavedAction.value = "open";
    unsavedPromptOpen.value = true;
  } else {
    browserOpen.value = true;
  }
};

const unsavedDiscard = () => {
  unsavedPromptOpen.value = false;
  if (unsavedAction.value === "new") openMetadataDialog("new");
  else if (unsavedAction.value === "open") browserOpen.value = true;
  unsavedAction.value = null;
};

const unsavedSave = async () => {
  await doSave();
  unsavedPromptOpen.value = false;
  if (unsavedAction.value === "new") openMetadataDialog("new");
  else if (unsavedAction.value === "open") browserOpen.value = true;
  unsavedAction.value = null;
};

const unsavedCancel = () => {
  unsavedPromptOpen.value = false;
  unsavedAction.value = null;
};

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

const handleKeydown = (e: KeyboardEvent) => {
  // Ctrl+S / Cmd+S → Save
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    doSave();
  }
};

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});

// ─── Auto-load last project on startup ──────────────────────────────────────

onMounted(async () => {
  const lastId = loadLastProjectId();
  if (lastId) {
    try {
      await doLoad(lastId);
    } catch {
      // Project may have been deleted — just start fresh.
      clearLastProjectId();
    }
  }
});

// ─── localStorage helpers ───────────────────────────────────────────────────

const persistLastProjectId = (id: string) => {
  try { localStorage.setItem(LAST_PROJECT_KEY, id); } catch { /* noop */ }
};

const loadLastProjectId = (): string | null => {
  try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
};

const clearLastProjectId = () => {
  try { localStorage.removeItem(LAST_PROJECT_KEY); } catch { /* noop */ }
};

</script>

<template>
  <SideMenu>
    <template #menu-items>
      <li>
        <a class="flex gap-3 items-center py-2.5 text-base" @click="guardedNew">
          <i class="iconify mdi--file-plus-outline size-5" />
          New Project
        </a>
      </li>
      <li>
        <a class="flex gap-3 items-center py-2.5 text-base" @click="guardedOpen">
          <i class="iconify mdi--folder-open-outline size-5" />
          Open Project
        </a>
      </li>
      <li>
        <a class="flex gap-3 items-center py-2.5 text-base" @click="doSave">
          <i class="iconify mdi--content-save-outline size-5" />
          Save
          <kbd class="kbd kbd-xs ml-auto">Ctrl+S</kbd>
        </a>
      </li>
      <li>
        <a class="flex gap-3 items-center py-2.5 text-base" @click="openMetadataDialog('save-as')">
          <i class="iconify mdi--content-save-edit-outline size-5" />
          Save As
        </a>
      </li>
      <li>
        <a class="flex gap-3 items-center py-2.5 text-base" @click="openMetadataDialog('edit')">
          <i class="iconify mdi--tag-edit-outline size-5" />
          Project Info
        </a>
      </li>
      <li>
        <a class="flex gap-3 items-center py-2.5 text-base" @click="exportOpen = true">
          <i class="iconify mdi--file-music-outline size-5" />
          Export Audio
        </a>
      </li>
    </template>

    <header class="flex flex-col">
      <ProjectHeader v-model="metadata.name" @update:modelValue="markDirty" />
      <AudioPlayer />
    </header>

    <main>
      <div class="flex flex-row flex-1 min-h-0">
        <AudioTracks />
        <TrackSidebar />
      </div>
    </main>

    <footer><BottomPanel :saving="saving" :dirty="dirty" :error="saveError" /></footer>
  </SideMenu>

  <!-- Project Browser modal -->
  <dialog class="modal" :class="{ 'modal-open': browserOpen }">
    <div class="modal-box bg-base-300 max-w-3xl max-h-[80vh] overflow-y-auto">
      <button
        class="btn btn-circle btn-ghost absolute right-2 top-2"
        @click="browserOpen = false"
      >
        <i class="iconify mdi--close size-4" />
      </button>
      <h3 class="mb-6 text-lg font-bold">Open Project</h3>
      <StorageDashboard class="mb-4" />
      <ProjectBrowser ref="projectBrowserRef" @load="doLoad" />
    </div>
    <form method="dialog" class="modal-backdrop" @click="browserOpen = false">
      <button>close</button>
    </form>
  </dialog>

  <!-- Project Info / New Project / Save As dialog (unified) -->
  <dialog class="modal" :class="{ 'modal-open': metadataOpen }">
    <div class="modal-box bg-base-300 max-w-md">
      <h3 class="mb-6 text-lg font-bold">{{ metadataDialogTitle }}</h3>
      <ProjectMetadataForm v-model="stagedMetadata" />
      <div class="modal-action">
        <button class="btn btn-ghost" @click="cancelMetadataDialog">Cancel</button>
        <button class="btn btn-primary" @click="confirmMetadataDialog">
          {{ metadataDialogConfirmLabel }}
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop" @click="cancelMetadataDialog">
      <button>close</button>
    </form>
  </dialog>

  <!-- Unsaved changes prompt -->
  <dialog class="modal" :class="{ 'modal-open': unsavedPromptOpen }">
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
    <form method="dialog" class="modal-backdrop" @click="unsavedCancel">
      <button>close</button>
    </form>
  </dialog>

  <!-- Export Audio dialog -->
  <ExportAudioDialog
    :open="exportOpen"
    :project-name="metadata.name"
    @close="exportOpen = false"
  />
</template>
