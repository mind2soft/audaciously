<script setup lang="ts">
/**
 * app/ProjectBrowser — modal wrapper for the project list.
 *
 * Opens when useProjectStore.browserOpen is true. Closing the modal sets
 * browserOpen back to false.
 *
 * All project-list logic is self-contained here (adapted from the old
 * src/components/ProjectBrowser.vue). Storage operations use inject(storageKey)
 * directly; loading a project calls useProjectStore.doLoad() instead of emitting.
 *
 * Store connections
 * ─────────────────
 * useProjectStore — browserOpen (modal flag), doLoad()
 *
 * Injections
 * ──────────
 * storageKey — StorageService (listProjects, deleteProject, duplicateProject)
 *
 * Export / Import use the same awp-export / awp-import utilities as before.
 */

import {
  ref,
  computed,
  watch,
} from "vue";
import { useProjectStore } from "../../stores/project";
import { storageService as storage } from "../../lib/storage/storage-singleton";
import type { ProjectSummary } from "../../lib/storage/storage-service";
import { exportProject, type ExportProgress } from "../../lib/storage/awp-export";
import { importProject, type ImportOutcome } from "../../lib/storage/awp-import";

// ── Stores ────────────────────────────────────────────────────────────────────

const project = useProjectStore();

// ── Dialog refs ───────────────────────────────────────────────────────────────

const dialogRef = ref<HTMLDialogElement | null>(null);
const deleteDialogRef = ref<HTMLDialogElement | null>(null);

// ── State ────────────────────────────────────────────────────────────────────

const projects = ref<ProjectSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const confirmDeleteId = ref<string | null>(null);
const duplicating = ref<string | null>(null);

type SortField = "name" | "updatedAt" | "sizeBytes";
type SortDir = "asc" | "desc";

const sortField = ref<SortField>("updatedAt");
const sortDir = ref<SortDir>("desc");

// ── Dialog watchers ──────────────────────────────────────────────────────────

watch(
  () => project.browserOpen,
  (open) => {
    if (!dialogRef.value) return;
    if (open) {
      if (!dialogRef.value.open) dialogRef.value.showModal();
    } else {
      if (dialogRef.value.open) dialogRef.value.close();
    }
  },
);

watch(
  () => confirmDeleteId.value,
  (id) => {
    if (!deleteDialogRef.value) return;
    if (id !== null) {
      if (!deleteDialogRef.value.open) deleteDialogRef.value.showModal();
    } else {
      if (deleteDialogRef.value.open) deleteDialogRef.value.close();
    }
  },
);

// ── Import / Export state ─────────────────────────────────────────────────────

const exporting = ref<string | null>(null);
const exportProgress = ref<ExportProgress | null>(null);
const importing = ref(false);
const importProgress = ref<string | null>(null);
const dragOver = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

// ── Formatters ───────────────────────────────────────────────────────────────

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

// ── Sorting ──────────────────────────────────────────────────────────────────

const toggleSort = (field: SortField) => {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortField.value = field;
    sortDir.value = field === "name" ? "asc" : "desc";
  }
};

const sortIndicator = (field: SortField): string => {
  if (sortField.value !== field) return "";
  return sortDir.value === "asc" ? " \u25B2" : " \u25BC";
};

const sortedProjects = computed(() => {
  const list = [...projects.value];
  const dir = sortDir.value === "asc" ? 1 : -1;
  const field = sortField.value;
  list.sort((a, b) => {
    if (field === "name") return a.name.localeCompare(b.name) * dir;
    if (field === "updatedAt")
      return (a.updatedAt.getTime() - b.updatedAt.getTime()) * dir;
    return (a.sizeBytes - b.sizeBytes) * dir;
  });
  return list;
});

// ── Actions ───────────────────────────────────────────────────────────────────

const refresh = async () => {
  loading.value = true;
  error.value = null;
  try {
    projects.value = await storage.listProjects();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load projects.";
  } finally {
    loading.value = false;
  }
};

const handleLoad = async (id: string) => {
  try {
    await project.doLoad(id);
    project.browserOpen = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load project.";
  }
};

const requestDelete = (id: string) => {
  confirmDeleteId.value = id;
};

const cancelDelete = () => {
  confirmDeleteId.value = null;
};

const confirmDelete = async () => {
  const id = confirmDeleteId.value;
  if (!id) return;
  confirmDeleteId.value = null;
  try {
    await storage.deleteProject(id);
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to delete project.";
  }
};

const handleDuplicate = async (id: string) => {
  duplicating.value = id;
  try {
    await storage.duplicateProject(id);
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to duplicate project.";
  } finally {
    duplicating.value = null;
  }
};

// ── Export ────────────────────────────────────────────────────────────────────

const sanitizeFilename = (name: string): string =>
  name.replace(/[^a-zA-Z0-9_\-. ]/g, "_").trim() || "project";

const exportPhaseLabel = computed(() => {
  if (!exportProgress.value) return "";
  const labels: Record<string, string> = {
    reading: "Reading\u2026",
    decompressing: "Decompressing audio\u2026",
    building: "Building manifest\u2026",
    zipping: "Creating ZIP\u2026",
  };
  return labels[exportProgress.value.phase] ?? "";
});

const handleExport = async (proj: ProjectSummary) => {
  if (exporting.value) return;
  exporting.value = proj.id;
  exportProgress.value = null;
  error.value = null;
  try {
    const blob = await exportProject(proj.id, (p) => {
      exportProgress.value = p;
    });
    if (!blob) {
      error.value = "Project not found.";
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilename(proj.name)}.awp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Export failed.";
  } finally {
    exporting.value = null;
    exportProgress.value = null;
  }
};

// ── Import ────────────────────────────────────────────────────────────────────

const openImportPicker = () => {
  fileInputRef.value?.click();
};

const handleFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) await doImport(file);
};

const doImport = async (file: File) => {
  if (importing.value) return;
  importing.value = true;
  importProgress.value = "Reading file\u2026";
  error.value = null;
  try {
    // Verify ZIP magic bytes (0x50 0x4B 0x03 0x04) before importing.
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (
      header[0] !== 0x50 ||
      header[1] !== 0x4b ||
      header[2] !== 0x03 ||
      header[3] !== 0x04
    ) {
      throw new Error("The selected file is not a valid .awp archive.");
    }
    const outcome: ImportOutcome = await importProject(file);
    if (outcome.success) {
      importProgress.value = null;
      await refresh();
    } else {
      error.value = outcome.error;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Import failed.";
  } finally {
    importing.value = false;
    importProgress.value = null;
  }
};

// ── Drag & drop ───────────────────────────────────────────────────────────────

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  dragOver.value = true;
};

const handleDragLeave = () => {
  dragOver.value = false;
};

const handleDrop = async (e: DragEvent) => {
  e.preventDefault();
  dragOver.value = false;
  const file = e.dataTransfer?.files[0];
  if (file && file.name.endsWith(".awp")) {
    await doImport(file);
  } else if (file) {
    error.value = "Only .awp files can be imported.";
  }
};

// Refresh the list whenever the modal is opened.
watch(
  () => project.browserOpen,
  (open) => {
    if (open) void refresh();
  },
  { immediate: true },
);
</script>

<template>
  <!-- DaisyUI modal — opened/closed via showModal()/close() in the watch above -->
  <dialog
    ref="dialogRef"
    class="modal"
    @cancel.prevent="project.browserOpen = false"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="modal-box w-11/12 max-w-4xl bg-base-300">

      <!-- ── Modal header ──────────────────────────────────────────────── -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Saved Projects</h2>
        <div class="flex items-center gap-1">
          <button
            class="btn btn-ghost btn-xs gap-1"
            title="Import .awp file"
            :disabled="importing"
            @click="openImportPicker"
          >
            <i
              class="iconify size-4"
              :class="importing ? 'mdi--loading animate-spin' : 'mdi--upload'"
            />
            Import
          </button>
          <button
            class="btn btn-ghost btn-xs gap-1"
            title="Refresh list"
            :disabled="loading"
            @click="refresh"
          >
            <i
              class="iconify mdi--refresh size-4"
              :class="{ 'animate-spin': loading }"
            />
            Refresh
          </button>
          <button
            class="btn btn-sm btn-ghost btn-square ml-1"
            title="Close"
            @click="project.browserOpen = false"
          >
            <i class="iconify mdi--close size-4" />
          </button>
        </div>
      </div>

      <!-- Hidden file input -->
      <input
        ref="fileInputRef"
        type="file"
        accept=".awp"
        class="hidden"
        @change="handleFileSelected"
      />

      <!-- ── Import progress ──────────────────────────────────────────── -->
      <div v-if="importProgress" class="alert alert-info text-sm py-2 mb-3">
        <i class="iconify mdi--loading animate-spin size-4" />
        <span>{{ importProgress }}</span>
      </div>

      <!-- ── Export progress ──────────────────────────────────────────── -->
      <div v-if="exportProgress" class="alert alert-info text-sm py-2 mb-3">
        <i class="iconify mdi--loading animate-spin size-4" />
        <span>{{ exportPhaseLabel }}</span>
      </div>

      <!-- ── Error banner ─────────────────────────────────────────────── -->
      <div v-if="error" class="alert alert-error text-sm mb-3">
        <i class="iconify mdi--alert-circle size-4" />
        <span>{{ error }}</span>
        <button
          class="btn btn-ghost btn-xs btn-square ml-auto"
          @click="error = null"
        >
          <i class="iconify mdi--close size-3.5" />
        </button>
      </div>

      <!-- ── Drag & drop overlay ──────────────────────────────────────── -->
      <div
        v-if="dragOver"
        class="flex items-center justify-center py-10 border-2 border-dashed border-primary rounded-lg bg-primary/5 mb-3"
      >
        <div class="flex flex-col items-center gap-2 text-primary">
          <i class="iconify mdi--file-import-outline size-10" />
          <p class="text-sm font-medium">Drop .awp file to import</p>
        </div>
      </div>

      <!-- ── Loading skeleton ─────────────────────────────────────────── -->
      <div v-if="loading && !dragOver" class="flex flex-col gap-2">
        <div v-for="i in 3" :key="i" class="skeleton h-10 w-full" />
      </div>

      <!-- ── Empty state ──────────────────────────────────────────────── -->
      <div
        v-else-if="projects.length === 0 && !dragOver"
        class="flex flex-col items-center justify-center py-12 text-base-content/40"
      >
        <i class="iconify mdi--folder-open-outline size-12 mb-2" />
        <p class="text-sm">No saved projects yet.</p>
        <p class="text-xs">Save your current project or import a .awp file.</p>
      </div>

      <!-- ── Project table ────────────────────────────────────────────── -->
      <div v-else-if="!dragOver" class="overflow-x-auto">
        <table class="table table-sm table-zebra w-full">
          <thead>
            <tr>
              <th
                class="cursor-pointer select-none hover:text-primary"
                @click="toggleSort('name')"
              >
                Name{{ sortIndicator("name") }}
              </th>
              <th>Author</th>
              <th>Nodes</th>
              <th>Duration</th>
              <th
                class="cursor-pointer select-none hover:text-primary"
                @click="toggleSort('sizeBytes')"
              >
                Size{{ sortIndicator("sizeBytes") }}
              </th>
              <th
                class="cursor-pointer select-none hover:text-primary"
                @click="toggleSort('updatedAt')"
              >
                Updated{{ sortIndicator("updatedAt") }}
              </th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="proj in sortedProjects" :key="proj.id">
              <td class="font-medium max-w-56 truncate" :title="proj.name">
                {{ proj.name }}
              </td>
              <td
                class="text-base-content/60 max-w-32 truncate"
                :title="proj.author"
              >
                {{ proj.author || "\u2014" }}
              </td>
              <td class="tabular-nums">{{ proj.nodeCount }}</td>
              <td class="tabular-nums">{{ formatDuration(proj.durationSeconds) }}</td>
              <td class="tabular-nums">{{ formatBytes(proj.sizeBytes) }}</td>
              <td class="text-base-content/60 text-xs">
                {{ formatDate(proj.updatedAt) }}
              </td>
              <td class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <button
                    class="btn btn-ghost btn-xs btn-square"
                    title="Load project"
                    @click="handleLoad(proj.id)"
                  >
                    <i class="iconify mdi--folder-open size-3.5" />
                  </button>
                  <button
                    class="btn btn-ghost btn-xs btn-square"
                    title="Duplicate project"
                    :disabled="duplicating === proj.id"
                    @click="handleDuplicate(proj.id)"
                  >
                    <i
                      class="iconify size-3.5"
                      :class="
                        duplicating === proj.id
                          ? 'mdi--loading animate-spin'
                          : 'mdi--content-copy'
                      "
                    />
                  </button>
                  <button
                    class="btn btn-ghost btn-xs btn-square"
                    title="Export as .awp"
                    :disabled="exporting === proj.id"
                    @click="handleExport(proj)"
                  >
                    <i
                      class="iconify size-3.5"
                      :class="
                        exporting === proj.id
                          ? 'mdi--loading animate-spin'
                          : 'mdi--download'
                      "
                    />
                  </button>
                  <button
                    class="btn btn-ghost btn-xs btn-square text-error"
                    title="Delete project"
                    @click="requestDelete(proj.id)"
                  >
                    <i class="iconify mdi--trash size-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

    <!-- ── Backdrop (click to close) ──────────────────────────────────── -->
    <form method="dialog" class="modal-backdrop">
      <button @click.prevent="project.browserOpen = false">close</button>
    </form>

    <!-- ── Delete confirmation modal ─────────────────────────────────── -->
    <dialog
      ref="deleteDialogRef"
      class="modal"
      @cancel.prevent="cancelDelete"
    >
      <div class="modal-box bg-base-300 max-w-sm">
        <h3 class="mb-2 text-lg font-bold">Delete Project?</h3>
        <p class="py-4 text-sm text-base-content/70">
          This will permanently remove the project and all its audio data. This
          action cannot be undone.
        </p>
        <div class="modal-action">
          <button class="btn btn-ghost" @click="cancelDelete">Cancel</button>
          <button class="btn btn-error" @click="confirmDelete">Delete</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click.prevent="cancelDelete">close</button>
      </form>
    </dialog>

  </dialog>
</template>
