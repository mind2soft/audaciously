// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoSaveOptions {
  /** Return true if a save should be attempted. */
  shouldSave: () => boolean;
  /** Perform the actual save. */
  save: () => Promise<void>;
  /** Debounce interval in milliseconds (default 5000). */
  debounceMs?: number;
}

export interface AutoSave {
  /** Notify that a change occurred — resets the debounce timer. */
  notifyChange(): void;
  /** Cancel any pending debounce (e.g. after a manual save). */
  notifySaved(): void;
  /** Clean up all timers. Call on component unmount. */
  dispose(): void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const DEFAULT_DEBOUNCE_MS = 5_000;

/**
 * Create a debounced auto-save scheduler.
 *
 * Call `notifyChange()` whenever the project state changes. After the debounce
 * interval elapses with no further changes, the `save` callback fires
 * (if `shouldSave()` returns true at that moment).
 *
 * Framework-agnostic — no Vue or DOM dependencies beyond setTimeout/clearTimeout.
 */
export function createAutoSave(options: AutoSaveOptions): AutoSave {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let flushing = false;

  const clearTimer = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const flush = async () => {
    if (disposed || flushing || !options.shouldSave()) return;
    flushing = true;
    try {
      await options.save();
    } catch {
      // Silent — next notifyChange() triggers another attempt.
    } finally {
      flushing = false;
    }
  };

  return {
    notifyChange() {
      if (disposed) return;
      clearTimer();
      timerId = setTimeout(() => {
        timerId = null;
        flush();
      }, debounceMs);
    },

    notifySaved() {
      clearTimer();
    },

    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
