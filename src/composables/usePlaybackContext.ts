// composables/usePlaybackContext.ts
//
// Shared injection keys so that:
//   - EffectVolume reads currentTime + seek without knowing the context source
//   - RecordedNodeView / PianoNodeView / DrumNodeView share the single
//     useNodePlayback instance that App.vue creates for the selected node
//
// Providers (set in App.vue):
//   PlaybackContextKey      → { currentTime, seek }  for effect editors
//   NodePlaybackContextKey  → full UseNodePlaybackReturn for node view controls
//
// Sequence context (SequenceEffectsPanel) also provides PlaybackContextKey
// using usePlayerStore, overriding App.vue's node-level provide for that subtree.

import { type InjectionKey, type Ref, ref } from "vue";
import type { UseNodePlaybackReturn } from "./useNodePlayback";

// ── PlaybackContext — minimal interface for effect editors ─────────────────────

export interface PlaybackContext {
  /** Reactive playback cursor in seconds. */
  currentTime: Ref<number>;
  /** Move the cursor (and restart playback if currently playing). */
  seek: (time: number) => void;
}

export const PlaybackContextKey: InjectionKey<PlaybackContext> = Symbol("playback-context");

/** Fallback: cursor stays at 0, seek is a no-op. */
export const nullPlaybackContext: PlaybackContext = {
  currentTime: ref(0),
  seek: () => {},
};

// ── NodePlaybackContextKey — full playback API for node view controls ──────────

export const NodePlaybackContextKey: InjectionKey<UseNodePlaybackReturn> =
  Symbol("node-playback-context");

/** Fallback for node views rendered outside a provider (should not happen). */
export const nullNodePlayback: UseNodePlaybackReturn = {
  state: ref("idle"),
  currentTime: ref(0),
  play: async () => {},
  pause: () => {},
  stop: () => {},
  seek: async () => {},
};
