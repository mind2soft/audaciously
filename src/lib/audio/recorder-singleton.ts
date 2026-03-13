/**
 * recorder-singleton.ts
 *
 * Module-level singleton for the Recorder. Created once with the persisted
 * settings and reused across the application. Replaces the old provide/inject
 * pattern (recorderKey).
 *
 * DO NOT import from Vue components via inject — import this module directly.
 */

import { createRecorder, type Recorder } from "./recorder";
import { loadSettings, settingsToMediaStreamConstraints } from "../settings";

const settings = loadSettings();

export const recorder: Recorder = createRecorder({
  mediaStreamConstraints: settingsToMediaStreamConstraints(settings),
});
