/**
 * timeline-persistence.ts
 *
 * Per-project timeline state (zoom ratio + scroll offset) persisted to
 * localStorage.  Uses the same pattern as settings.ts: synchronous reads,
 * per-field validation with safe fallbacks, try/catch around every access.
 *
 * Key format:  "audaciously:timeline:{projectId}"
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimelineState {
  /** Pixels-per-second zoom ratio.  Clamped to (0, ∞). */
  ratio: number;
  /** Horizontal scroll offset in seconds.  Clamped to [0, ∞). */
  offsetTime: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const storageKey = (projectId: string) => `audaciously:timeline:${projectId}`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read the persisted timeline state for a project.
 *
 * Returns `null` if no entry exists yet.  Each field is validated
 * individually; any invalid field is replaced with its default.
 */
export function loadTimelineState(projectId: string): TimelineState | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;

    const p = JSON.parse(raw) as Record<string, unknown>;

    const ratio =
      typeof p.ratio === "number" && Number.isFinite(p.ratio) && p.ratio > 0 ? p.ratio : 1;

    const offsetTime =
      typeof p.offsetTime === "number" && Number.isFinite(p.offsetTime) && p.offsetTime >= 0
        ? p.offsetTime
        : 0;

    return { ratio, offsetTime };
  } catch {
    return null;
  }
}

/**
 * Persist the timeline state for a project.
 *
 * Silently no-ops if localStorage is unavailable (private browsing, quota
 * exceeded, etc.).
 */
export function saveTimelineState(projectId: string, state: TimelineState): void {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch {
    // noop — localStorage may be unavailable
  }
}

/**
 * Remove the timeline state entry for a project.
 *
 * Should be called when a project is deleted.
 */
export function clearTimelineState(projectId: string): void {
  try {
    localStorage.removeItem(storageKey(projectId));
  } catch {
    // noop
  }
}
