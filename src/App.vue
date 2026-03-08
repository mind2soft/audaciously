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
import { selectedTrackKey, playerKey, storageKey, timelineKey } from "./lib/provider-keys";
import type { AudioTrack } from "./lib/audio/track";
import type { AudioPlayer as AudioPlayerType } from "./lib/audio/player";
import type { StorageService } from "./lib/storage/storage-service";
import type { Timeline } from "./lib/timeline";
import { createDefaultMetadata, type ProjectMetadata } from "./lib/storage/project-metadata";
import { createAutoSave } from "./lib/storage/auto-save";
import ExportAudioDialog from "./components/ExportAudioDialog.vue";
import {
  createDirtyState,
  isDirtyStateEmpty,
  markProjectDirty,
  markTrackDirty,
  markSequenceDirty,
  clearDirtyState,
  type DirtyState,
} from "./lib/storage/dirty-state";
import {
  loadTimelineState,
  saveTimelineState,
} from "./lib/storage/timeline-persistence";
import type { BufferedAudioSequence } from "./lib/audio/sequence";

const selectedTrack = ref<AudioTrack<any> | null>(null);
provide(selectedTrackKey, selectedTrack);

const player = inject<AudioPlayerType>(playerKey);
if (!player) throw new Error("missing player");

const storage = inject<StorageService>(storageKey);
if (!storage) throw new Error("missing storage service");

const timeline = inject<Timeline>(timelineKey);
if (!timeline) throw new Error("missing timeline");

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
    dirtyState = markProjectDirty(dirtyState);
    notifyDirty();
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

// ─── Granular dirty state ───────────────────────────────────────────────────
//
// `dirtyState` is a plain (non-reactive) object because its mutations happen
// at a very high frequency (every note push, every property change) and we
// don't need Vue to re-render on each individual flag flip.  Only the coarser
// `dirty: ref<boolean>` (used for the "unsaved changes" UI indicator) needs
// to be reactive.

let dirtyState: DirtyState = createDirtyState();

// Whether to suppress dirty marking — true during player.setTracks() in doLoad.
let loadingProject = false;

// Whether the project has ever been written to IndexedDB.
// false → first save must be a full saveProject() call.
// true → subsequent saves can use granular ops.
let projectSavedOnce = false;

const notifyDirty = () => {
  dirty.value = true;
  dirtyGeneration++;
  autoSave.notifyChange();
};

// ─── Track & sequence subscriptions ────────────────────────────────────────

// Map of trackId → unsubscribe function
const trackSubscriptions = new Map<string, () => void>();
// Map of sequenceId → unsubscribe function
const sequenceSubscriptions = new Map<string, () => void>();
// Ordered list of track IDs — used to detect reordering.
let knownTrackIds: string[] = [];

const subscribeToSequence = (
  seq: AudioSequence<any, any>,
  _trackId: string,
) => {
  if (sequenceSubscriptions.has(seq.id)) return;

  const handler = () => {
    if (loadingProject) return;
    dirtyState = markSequenceDirty(dirtyState, seq.id, { properties: true });
    notifyDirty();
  };

  seq.addEventListener("change", handler);
  sequenceSubscriptions.set(seq.id, () => {
    seq.removeEventListener("change", handler);
  });
};

const syncSequenceSubscriptions = (track: AudioTrack<any>) => {
  // Only recorded tracks have persisted sequences.
  if (track.kind !== "recorded") return;

  const currentSeqIds = new Set<string>();

  for (const seq of track.getSequences()) {
    currentSeqIds.add(seq.id);

    if (!sequenceSubscriptions.has(seq.id)) {
      // Brand-new sequence — mark buffer dirty so it gets compressed.
      if (!loadingProject) {
        dirtyState = markSequenceDirty(dirtyState, seq.id, {
          properties: true,
          buffer: true,
        });
        notifyDirty();
      }
      subscribeToSequence(seq, track.id);
    }
  }

  // Unsubscribe sequences that were removed.
  for (const [seqId, unsub] of sequenceSubscriptions) {
    if (!currentSeqIds.has(seqId)) {
      unsub();
      sequenceSubscriptions.delete(seqId);
    }
  }
};

const subscribeToTrack = (track: AudioTrack<any>) => {
  if (trackSubscriptions.has(track.id)) return;

  const handler = () => {
    if (loadingProject) return;
    dirtyState = markTrackDirty(dirtyState, track.id);
    notifyDirty();
    syncSequenceSubscriptions(track);
  };

  track.addEventListener("change", handler);
  trackSubscriptions.set(track.id, () => {
    track.removeEventListener("change", handler);
  });

  // Subscribe to existing sequences on this track immediately.
  syncSequenceSubscriptions(track);
};

const syncTrackSubscriptions = () => {
  const currentTracks = [...player.getTracks()];
  const currentIds = currentTracks.map((t) => t.id);

  // Detect reorder: if the ordered IDs changed, mark all tracks dirty.
  const reordered =
    currentIds.length === knownTrackIds.length &&
    currentIds.some((id, i) => id !== knownTrackIds[i]);

  if (reordered && !loadingProject) {
    for (const id of currentIds) {
      dirtyState = markTrackDirty(dirtyState, id);
    }
    notifyDirty();
  }

  const currentIdSet = new Set(currentIds);

  // Unsubscribe removed tracks.
  for (const [trackId, unsub] of trackSubscriptions) {
    if (!currentIdSet.has(trackId)) {
      unsub();
      trackSubscriptions.delete(trackId);
    }
  }

  // Subscribe new tracks.
  for (const track of currentTracks) {
    subscribeToTrack(track);
  }

  knownTrackIds = currentIds;
};

const tearDownAllSubscriptions = () => {
  for (const unsub of trackSubscriptions.values()) unsub();
  for (const unsub of sequenceSubscriptions.values()) unsub();
  trackSubscriptions.clear();
  sequenceSubscriptions.clear();
  knownTrackIds = [];
};

// ─── Timeline persistence ───────────────────────────────────────────────────

const handleTimelineChange = () => {
  const id = currentProjectId.value;
  if (!id) return;
  saveTimelineState(id, { ratio: timeline.ratio, offsetTime: timeline.offsetTime });
};

// ─── Core save logic ───────────────────────────────────────────────────────

let dirtyGeneration = 0;

/**
 * Full save — serializes everything and does a complete replace in IndexedDB.
 * Used for brand-new projects (no DB record yet) and for the "Save As" path.
 */
const fullSave = async (projectId: string): Promise<boolean> => {
  const gen = dirtyGeneration;
  saving.value = true;
  saveError.value = null;
  try {
    await storage.saveProject(projectId, player, metadata.value);
    projectSavedOnce = true;
    if (dirtyGeneration === gen) {
      dirty.value = false;
      dirtyState = clearDirtyState(dirtyState);
    }
    persistLastProjectId(projectId);
    return true;
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Save failed.";
    return false;
  } finally {
    saving.value = false;
  }
};

/**
 * Granular save — runs only the cheapest DB ops needed for what changed.
 */
const performGranularSave = async (projectId: string): Promise<boolean> => {
  // Snapshot the current dirty state and clear it immediately so that any
  // changes arriving during the async save are captured in the next cycle.
  const snapshot = dirtyState;
  dirtyState = createDirtyState();

  const gen = dirtyGeneration;
  saving.value = true;
  saveError.value = null;

  try {
    const ops: Promise<void>[] = [];

    // Project metadata
    if (snapshot.project.properties) {
      ops.push(storage.updateProjectMetadata(projectId, metadata.value));
    }

    // Tracks
    const currentTracks = [...player.getTracks()];
    const currentTrackMap = new Map(currentTracks.map((t, i) => [t.id, { track: t, sortOrder: i }]));

    for (const [trackId, flags] of Object.entries(snapshot.tracks)) {
      if (!flags.properties) continue;

      const entry = currentTrackMap.get(trackId);
      if (entry) {
        // Track still exists — upsert.
        ops.push(
          storage.upsertTrackRecord(projectId, entry.track.toJSON(), entry.sortOrder),
        );
      } else {
        // Track was deleted.
        ops.push(storage.deleteTrackRecord(projectId, trackId));
      }
    }

    // Sequences
    for (const [seqId, flags] of Object.entries(snapshot.sequences)) {
      if (!flags.properties && !flags.buffer) continue;

      // Find the owning track.
      let ownerTrack: AudioTrack<any> | undefined;
      let ownerSeq: AudioSequence<any, any> | undefined;

      for (const track of currentTracks) {
        const seq = track.getSequence(seqId);
        if (seq) {
          ownerTrack = track;
          ownerSeq = seq as AudioSequence<any, any>;
          break;
        }
      }

      if (!ownerTrack || !ownerSeq) {
        // Sequence was deleted.
        ops.push(storage.deleteSequenceRecord(projectId, seqId));
        continue;
      }

      if (flags.buffer) {
        // Buffer changed — compress and store (slow path).
        const buffered = ownerSeq as BufferedAudioSequence<any>;
        ops.push(
          storage.upsertAudioBlob(
            projectId,
            ownerTrack.id,
            ownerSeq.toJSON(),
            buffered.buffer,
          ),
        );
      } else if (flags.properties) {
        // Only metadata changed (time, playbackRate).
        ops.push(
          storage.upsertSequenceRecord(projectId, ownerTrack.id, ownerSeq.toJSON()),
        );
      }
    }

    await Promise.all(ops);

    if (dirtyGeneration === gen && isDirtyStateEmpty(dirtyState)) {
      dirty.value = false;
    }
    persistLastProjectId(projectId);
    return true;
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Save failed.";
    // Restore the snapshot so the next save retry covers what we couldn't save.
    dirtyState = snapshot;
    return false;
  } finally {
    saving.value = false;
  }
};

const performSave = async (projectId: string): Promise<boolean> => {
  if (!projectSavedOnce) {
    return fullSave(projectId);
  }
  return performGranularSave(projectId);
};

// ─── Auto-save ─────────────────────────────────────────────────────────────

const autoSave = createAutoSave({
  shouldSave: () => !!currentProjectId.value && dirty.value && !saving.value,
  save: async () => { await performSave(currentProjectId.value!); },
  debounceMs: 5_000,
});

// ─── Player change → sync subscriptions ────────────────────────────────────

onMounted(() => {
  player.addEventListener("change", syncTrackSubscriptions);
  timeline.addEventListener("change", handleTimelineChange);
});

onUnmounted(() => {
  player.removeEventListener("change", syncTrackSubscriptions);
  timeline.removeEventListener("change", handleTimelineChange);
  tearDownAllSubscriptions();
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
  projectSavedOnce = false; // Force a full save for the new ID.
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

    // Tear down all existing subscriptions before replacing tracks.
    tearDownAllSubscriptions();

    // Suppress dirty tracking while setTracks() triggers reactive updates.
    loadingProject = true;

    // Stop playback and replace tracks.
    player.stop();
    player.setTracks(loaded.data.tracks);

    loadingProject = false;

    // Wire up subscriptions for the newly loaded tracks.
    syncTrackSubscriptions();

    // Restore metadata from the project record.
    metadata.value = {
      name: loaded.record.name,
      author: loaded.record.author,
      genre: loaded.record.genre,
      tags: [...loaded.record.tags],
      description: loaded.record.description,
    };

    // Restore timeline state if previously persisted.
    const timelineState = loadTimelineState(projectId);
    if (timelineState) {
      timeline.setValues(timelineState.ratio, timelineState.offsetTime);
    } else {
      timeline.setValues(1, 0);
    }

    currentProjectId.value = projectId;
    projectSavedOnce = true;
    dirtyState = createDirtyState();
    dirty.value = false;
    autoSave.notifySaved();
    persistLastProjectId(projectId);
    browserOpen.value = false;
  } catch (e) {
    loadingProject = false;
    saveError.value = e instanceof Error ? e.message : "Failed to load project.";
  }
};

// ─── New project ────────────────────────────────────────────────────────────

const doNew = () => {
  tearDownAllSubscriptions();

  loadingProject = true;
  player.stop();
  player.setTracks([]);
  loadingProject = false;

  timeline.setValues(1, 0);

  metadata.value = createDefaultMetadata();
  currentProjectId.value = null;
  projectSavedOnce = false;
  dirtyState = createDirtyState();
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

// ─── TypeScript type alias for convenience ──────────────────────────────────

type AudioSequence<K, T> = import("./lib/audio/sequence").AudioSequence<K, T>;

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
      <ProjectHeader v-model="metadata.name" @update:modelValue="() => { dirtyState = markProjectDirty(dirtyState); notifyDirty(); }" />
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
