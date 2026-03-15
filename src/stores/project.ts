// stores/project.ts
// useProjectStore — project metadata, save/load, dirty state, modal flags.
// See: .opencode/context/refactor/03-state-management.md (P2-05)

import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import {
  createDefaultMetadata,
  type ProjectMetadata,
} from "../lib/storage/project-metadata";
import { createAutoSave, type AutoSave } from "../lib/storage/auto-save";
import { saveProject, loadProject } from "../lib/storage/project-repository";
import { nanoid } from "nanoid";
import { useNodesStore } from "./nodes";
import { useSequenceStore } from "./sequence";
import { usePlayerStore } from "./player";
import type { RecordedNode, InstrumentNode } from "../features/nodes";

// ── Store ─────────────────────────────────────────────────────────────────────

export const useProjectStore = defineStore("project", () => {
  // ── State ─────────────────────────────────────────────────────────────────
  /** IndexedDB project id; null = no project loaded. */
  const id = ref<string | null>(null);
  const metadata = ref<ProjectMetadata>(createDefaultMetadata());
  const dirty = ref(false);
  const saving = ref(false);
  const saveError = ref<string | null>(null);
  const savedOnce = ref(false);

  // ── Modals / dialogs ──────────────────────────────────────────────────────
  const browserOpen = ref(false);
  const exportOpen = ref(false);
  const unsavedPromptOpen = ref(false);
  const metadataOpen = ref(false);
  const metadataMode = ref<"edit" | "new" | "save-as">("edit");

  // ── Auto-save ─────────────────────────────────────────────────────────────
  let autoSave: AutoSave | null = null;

  function _ensureAutoSave(): AutoSave {
    if (autoSave) return autoSave;
    autoSave = createAutoSave({
      shouldSave: () => dirty.value && savedOnce.value,
      save: () => doSave(),
      debounceMs: 5_000,
    });
    return autoSave;
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const projectName = computed(() => metadata.value.name);
  const hasProject = computed(() => id.value !== null);

  /**
   * Rough estimate of project size in human-readable form.
   * Sums AudioBuffer samples from recorded / instrument nodes (uncompressed).
   * For RecordedNode, uses sourceBuffer (what is actually persisted to IndexedDB).
   * For InstrumentNode, uses targetBuffer (synthesized; notes are persisted instead).
   * The storage layer can provide the precise compressed size via getProjectSize().
   */
  const estimatedSize = computed((): string => {
    const nodesStore = useNodesStore();
    let totalSamples = 0;
    nodesStore.nodesById.forEach((node) => {
      if (node.kind === "recorded") {
        const buf = (node as RecordedNode).sourceBuffer;
        if (buf) totalSamples += buf.length * buf.numberOfChannels;
      } else if (node.kind === "instrument") {
        const buf = (node as InstrumentNode).targetBuffer;
        if (buf) totalSamples += buf.length * buf.numberOfChannels;
      }
    });
    // Float32 = 4 bytes per sample
    const bytes = totalSamples * 4;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  });

  // ── Dirty-state subscriptions ─────────────────────────────────────────────
  // Watch node and sequence changes to mark the project dirty.

  function _initDirtyWatchers(): void {
    const nodesStore = useNodesStore();
    const sequenceStore = useSequenceStore();

    // Watch a projection of node data that EXCLUDES transient runtime fields
    // (targetBuffer, isRecording) so buffer recomputes don't mark the project dirty.
    watch(
      () => {
        const snap: Record<string, unknown> = {};
        nodesStore.nodesById.forEach((node, id) => {
          if (node.kind === "recorded") {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { targetBuffer: _tb, isRecording: _ir, ...rest } =
              node as RecordedNode;
            snap[id] = rest;
          } else if (node.kind === "instrument") {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { targetBuffer: _tb, ...rest } = node as InstrumentNode;
            snap[id] = rest;
          } else {
            snap[id] = node;
          }
        });
        return snap;
      },
      () => notifyDirty(),
      { deep: true },
    );
    watch(
      () => nodesStore.rootIds,
      () => notifyDirty(),
      { deep: true },
    );
    watch(
      () => sequenceStore.tracks,
      () => notifyDirty(),
      { deep: true },
    );
    watch(
      () => sequenceStore.timelineEffects,
      () => notifyDirty(),
      { deep: true },
    );
  }

  _initDirtyWatchers();

  // ── Actions ────────────────────────────────────────────────────────────────

  function notifyDirty(): void {
    dirty.value = true;
    _ensureAutoSave().notifyChange();
  }

  /**
   * Load a project by id from IndexedDB.
   *
   * Populates useNodesStore and useSequenceStore from the persisted data.
   * A temporary AudioContext is created if the player has not yet started, so
   * that AudioBuffers can be constructed from compressed blob data.
   */
  async function doLoad(projectId: string): Promise<void> {
    const playerStore = usePlayerStore();

    // Obtain an AudioContext for AudioBuffer construction.
    // AudioBuffers are context-independent once created, so a temporary context
    // is safe to close afterwards.
    let tempCtx: AudioContext | null = null;
    const audioCtx: BaseAudioContext =
      playerStore.getAudioContext() ?? (() => {
        tempCtx = new AudioContext();
        return tempCtx;
      })();

    try {
      const result = await loadProject(projectId, audioCtx);
      if (!result) throw new Error(`Project not found: ${projectId}`);

      const nodesStore = useNodesStore();
      const sequenceStore = useSequenceStore();

      nodesStore.fromJSON(result.data.nodesJSON);
      sequenceStore.fromJSON(result.data.sequenceJSON);

      id.value = projectId;
      metadata.value = {
        name: result.record.name,
        author: result.record.author,
        genre: result.record.genre,
        tags: [...result.record.tags],
        description: result.record.description,
      };
      dirty.value = false;
      savedOnce.value = true;
      _ensureAutoSave().notifySaved();
    } finally {
      if (tempCtx) {
        void (tempCtx as AudioContext).close();
      }
    }
  }

  /**
   * Save the current project to IndexedDB.
   *
   * If `id` is null (project was never saved), this is a no-op — callers
   * should use `doSaveAs` to create a new project.
   */
  async function doSave(): Promise<void> {
    if (!id.value) return;

    saving.value = true;
    saveError.value = null;

    try {
      const nodesStore = useNodesStore();
      const sequenceStore = useSequenceStore();

      await saveProject(
        id.value,
        nodesStore.toJSON(),
        sequenceStore.toJSON(),
        metadata.value,
        sequenceStore.totalDuration,
      );

      dirty.value = false;
      savedOnce.value = true;
      _ensureAutoSave().notifySaved();
    } catch (err) {
      saveError.value = err instanceof Error ? err.message : String(err);
    } finally {
      saving.value = false;
    }
  }

  /**
   * Save the project under a new name / new project id.
   *
   * Assigns a fresh project id and updates the metadata, then persists.
   */
  async function doSaveAs(newMetadata: ProjectMetadata): Promise<void> {
    id.value = nanoid();
    metadata.value = { ...newMetadata };
    savedOnce.value = false; // Force a real save (not auto-save guard).
    await doSave();
  }

  /**
   * Reset to a blank new project (clears all stores).
   */
  function doNew(): void {
    const nodesStore = useNodesStore();
    const sequenceStore = useSequenceStore();

    nodesStore.clear();
    sequenceStore.clear();

    id.value = null;
    metadata.value = createDefaultMetadata();
    dirty.value = false;
    savedOnce.value = false;
    saveError.value = null;
    _ensureAutoSave().notifySaved();
  }

  return {
    // state
    id,
    metadata,
    dirty,
    saving,
    saveError,
    savedOnce,
    // modals
    browserOpen,
    exportOpen,
    unsavedPromptOpen,
    metadataOpen,
    metadataMode,
    // computed
    projectName,
    hasProject,
    estimatedSize,
    // actions
    doLoad,
    doSave,
    doSaveAs,
    doNew,
    notifyDirty,
  };
});
