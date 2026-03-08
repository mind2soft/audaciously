import {
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  duplicateProject,
  getProjectSize,
  updateProjectMetadata,
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
    estimateStorage,
    requestPersistence,
    checkAvailableSpace,
  };
}
