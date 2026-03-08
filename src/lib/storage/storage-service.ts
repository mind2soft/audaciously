import {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  duplicateProject,
  getProjectSize,
  updateProjectMetadata,
  upsertTrackRecord,
  deleteTrackRecord,
  upsertSequenceRecord,
  deleteSequenceRecord,
  upsertAudioBlob,
} from "./project-repository";
import {
  estimateStorage,
  requestPersistence,
  checkAvailableSpace,
} from "./storage-quota";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { ProjectSummary, LoadedProject } from "./project-repository";
export type { StorageEstimateResult } from "./storage-quota";

/** Facade combining project repository and storage-quota operations. */
export interface StorageService {
  // Project CRUD
  saveProject: typeof saveProject;
  loadProject: typeof loadProject;
  listProjects: typeof listProjects;
  deleteProject: typeof deleteProject;
  duplicateProject: typeof duplicateProject;
  getProjectSize: typeof getProjectSize;
  updateProjectMetadata: typeof updateProjectMetadata;

  // Granular ops (used by auto-save dirty state processing)
  upsertTrackRecord: typeof upsertTrackRecord;
  deleteTrackRecord: typeof deleteTrackRecord;
  upsertSequenceRecord: typeof upsertSequenceRecord;
  deleteSequenceRecord: typeof deleteSequenceRecord;
  upsertAudioBlob: typeof upsertAudioBlob;

  // Storage quota
  estimateStorage: typeof estimateStorage;
  requestPersistence: typeof requestPersistence;
  checkAvailableSpace: typeof checkAvailableSpace;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/** Create a storage service that bundles all project-persistence operations. */
export function createStorageService(): StorageService {
  return {
    saveProject,
    loadProject,
    listProjects,
    deleteProject,
    duplicateProject,
    getProjectSize,
    updateProjectMetadata,
    upsertTrackRecord,
    deleteTrackRecord,
    upsertSequenceRecord,
    deleteSequenceRecord,
    upsertAudioBlob,
    estimateStorage,
    requestPersistence,
    checkAvailableSpace,
  };
}
