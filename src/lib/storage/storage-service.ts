import {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  duplicateProject,
  getProjectSize,
  updateProjectMetadata,
  upsertNodeRecord,
  deleteNodeRecord,
  upsertTrackRecord,
  deleteTrackRecord,
  upsertSegmentRecord,
  deleteSegmentRecord,
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
  upsertNodeRecord: typeof upsertNodeRecord;
  deleteNodeRecord: typeof deleteNodeRecord;
  upsertTrackRecord: typeof upsertTrackRecord;
  deleteTrackRecord: typeof deleteTrackRecord;
  upsertSegmentRecord: typeof upsertSegmentRecord;
  deleteSegmentRecord: typeof deleteSegmentRecord;
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
    upsertNodeRecord,
    deleteNodeRecord,
    upsertTrackRecord,
    deleteTrackRecord,
    upsertSegmentRecord,
    deleteSegmentRecord,
    upsertAudioBlob,
    estimateStorage,
    requestPersistence,
    checkAvailableSpace,
  };
}
