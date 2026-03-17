/** All user-configurable settings that survive a page reload. */
export interface PersistedSettings {
  /** Selected input device id; empty string = system default. */
  inputDeviceId: string;
  /** Selected output device id; empty string = system default. */
  outputDeviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  /** Master playback volume, clamped to [0, 3]. Default = 1 (100 %). */
  volume: number;
}

export const defaultSettings: PersistedSettings = {
  inputDeviceId: "",
  outputDeviceId: "",
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  volume: 1,
};

const STORAGE_KEY = "audaciously:settings";

/**
 * Read persisted settings from localStorage.
 * Each field is validated individually; any field that is missing or has the
 * wrong type silently falls back to the default value.  The entire call is
 * wrapped in a try/catch so a corrupted entry or a locked storage never
 * throws.
 */
export function loadSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };

    const p = JSON.parse(raw) as Record<string, unknown>;

    return {
      inputDeviceId:
        typeof p.inputDeviceId === "string" ? p.inputDeviceId : defaultSettings.inputDeviceId,

      outputDeviceId:
        typeof p.outputDeviceId === "string" ? p.outputDeviceId : defaultSettings.outputDeviceId,

      echoCancellation:
        typeof p.echoCancellation === "boolean"
          ? p.echoCancellation
          : defaultSettings.echoCancellation,

      noiseSuppression:
        typeof p.noiseSuppression === "boolean"
          ? p.noiseSuppression
          : defaultSettings.noiseSuppression,

      autoGainControl:
        typeof p.autoGainControl === "boolean"
          ? p.autoGainControl
          : defaultSettings.autoGainControl,

      volume:
        typeof p.volume === "number" && Number.isFinite(p.volume)
          ? Math.max(0, Math.min(3, p.volume))
          : defaultSettings.volume,
    };
  } catch {
    return { ...defaultSettings };
  }
}

/** Persist the full settings object to localStorage. */
export function saveSettings(settings: PersistedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded, …)
  }
}

/**
 * Read the current settings, apply a partial patch, and write back.
 * Convenient for components that only own a subset of the settings.
 */
export function patchSettings(patch: Partial<PersistedSettings>): void {
  saveSettings({ ...loadSettings(), ...patch });
}

/**
 * Convert persisted settings into a `MediaStreamConstraints` object suitable
 * for passing to `getUserMedia` or `recorder.setMediaStreamConstraints()`.
 */
export function settingsToMediaStreamConstraints(
  settings: PersistedSettings,
): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: settings.autoGainControl,
  };
  if (settings.inputDeviceId) {
    audio.deviceId = { exact: settings.inputDeviceId };
  }
  return { audio };
}
