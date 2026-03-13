/**
 * storage-singleton.ts
 *
 * Module-level singleton for the StorageService. Created once per app lifetime.
 * Replaces the old provide/inject pattern (storageKey).
 *
 * DO NOT import from Vue components via inject — import this module directly.
 */

import { createStorageService, type StorageService } from "./storage-service";

export const storageService: StorageService = createStorageService();
