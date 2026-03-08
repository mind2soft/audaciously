// ─── Types ────────────────────────────────────────────────────────────────────

export interface StorageEstimateResult {
  /** Bytes currently used by this origin. */
  used: number;
  /** Approximate total quota available to this origin (bytes). */
  quota: number;
  /** Percentage of quota currently used (0–100). */
  percentage: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Whether the Storage API is available (requires secure context / HTTPS). */
export function isStorageApiAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "storage" in navigator &&
    typeof navigator.storage.estimate === "function"
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Estimate current storage usage for this origin.
 *
 * Returns zeroes when the Storage API is unavailable (e.g. non-secure context,
 * SSR, or unsupported browser).
 */
export async function estimateStorage(): Promise<StorageEstimateResult> {
  if (!isStorageApiAvailable()) {
    return { used: 0, quota: 0, percentage: 0 };
  }

  const estimate = await navigator.storage.estimate();
  const used = estimate.usage ?? 0;
  const quota = estimate.quota ?? 0;
  const percentage = quota > 0 ? (used / quota) * 100 : 0;

  return { used, quota, percentage };
}

/**
 * Request persistent storage so the browser won't evict data under pressure.
 *
 * - Firefox: shows a user-facing permission prompt.
 * - Chrome/Edge: auto-approves based on engagement signals (bookmarks, etc.).
 * - Safari: auto-approves based on interaction history.
 *
 * Returns `false` when the API is unavailable or the request is denied.
 */
export async function requestPersistence(): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage?.persist
  ) {
    return false;
  }

  return navigator.storage.persist();
}

/**
 * Check whether the origin has enough available storage for `neededBytes`.
 *
 * Returns `true` optimistically when the Storage API is unavailable — the
 * actual write to IndexedDB will throw `QuotaExceededError` if space is
 * genuinely insufficient.
 */
export async function checkAvailableSpace(
  neededBytes: number,
): Promise<boolean> {
  const { used, quota } = await estimateStorage();

  if (quota === 0) {
    return true;
  }

  return quota - used >= neededBytes;
}
