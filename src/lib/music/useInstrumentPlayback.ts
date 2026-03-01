/**
 * useInstrumentPlayback.ts
 *
 * Renders each InstrumentTrack's notes into an AudioBuffer via the synth Web
 * Worker and plays that buffer back through the player's AudioContext — WITHOUT
 * ever calling player.addTrack().  The hidden AudioTrack objects are purely
 * private playback handles; they never appear in the player's track list and
 * therefore never show up as extra rows in the UI.
 *
 * Playback lifecycle
 * ──────────────────
 * • On player "play"  → call audioTrack.play(ctx, { output, startTime })
 * • On player "pause" / "stop" → call audioTrack.stop()
 * • Volume / mute changes on the InstrumentTrack are applied to the hidden
 *   AudioTrack immediately (no re-render needed).
 *
 * Re-render triggers
 * ──────────────────
 * A watchEffect re-renders when notes, bpm, or muted changes.
 * Volume changes are applied live without re-rendering.
 *
 * Return value
 * ────────────
 * Returns a reactive Ref<Map<instrumentTrackId, AudioTrack>> so components
 * (e.g. InstrumentTrackView in waveform mode) can look up the rendered
 * AudioTrack to display its waveform.
 */

import { watchEffect, onUnmounted, ref, type Ref } from "vue";
import type { AudioPlayer } from "../audio/player";
import type { InstrumentTrack } from "./instrument-track";
import { createAudioTrack, type AudioTrack } from "../audio/track";
import { createAudioBufferSequence } from "../audio/sequence/AudioBufferSequence";
import {
  createSynthWorkerClient,
  SynthEmptyTrackSignal,
} from "./synthWorker";

// One worker client shared for the lifetime of the app.
const synthClient = createSynthWorkerClient();

export function useInstrumentPlayback(
  player: AudioPlayer,
  instrumentTracks: Ref<InstrumentTrack[]> | InstrumentTrack[]
): Ref<Map<string, AudioTrack>> {
  function getTracks(): InstrumentTrack[] {
    return Array.isArray(instrumentTracks) ? instrumentTracks : instrumentTracks.value;
  }

  /**
   * instrumentTrackId → private AudioTrack (never added to the player's list).
   * Exposed as a reactive ref so InstrumentTrackView can find it for waveform display.
   */
  const managedTracksRef = ref(new Map<string, AudioTrack>());

  /**
   * Plain (non-reactive) mirror of managedTracksRef used inside watchEffect
   * callbacks that must NOT register managedTracksRef.value as a reactive
   * dependency.  toRaw(managedTracksRef.value) still accesses `.value`, which
   * Vue tracks — reading rawManagedTracks instead is truly dependency-free.
   */
  const rawManagedTracks = new Map<string, AudioTrack>();

  /**
   * Number of syncTrack() calls currently in-flight (waiting for the synth
   * worker).  While this is > 0, extraDuration returns a large sentinel value
   * so the player never auto-stops before the first buffer arrives.
   */
  let pendingRenders = 0;

  // ── helpers ───────────────────────────────────────────────────────────────

  function deleteManagedTrack(id: string) {
    const audioTrack = rawManagedTracks.get(id);
    if (!audioTrack) return;
    audioTrack.stop();
    rawManagedTracks.delete(id);
    const next = new Map(rawManagedTracks);
    managedTracksRef.value = next;
  }

  /**
   * Stop the previous AudioTrack for `id` (if any) and replace it with
   * `audioTrack` in a **single** Map assignment.  This avoids the two-step
   * delete-then-set pattern that briefly sets the entry to `undefined`,
   * which caused the waveform view to unmount and remount on every render.
   */
  function replaceManagedTrack(id: string, audioTrack: AudioTrack) {
    const prev = rawManagedTracks.get(id);
    if (prev) prev.stop();
    rawManagedTracks.set(id, audioTrack);
    managedTracksRef.value = new Map(rawManagedTracks);
  }

  // ── re-render on note / bpm / mute changes ─────────────────────────────────

  async function syncTrack(track: InstrumentTrack) {
    let buffer: AudioBuffer;

    pendingRenders++;
    try {
      buffer = await synthClient.render(track);
    } catch (err) {
      pendingRenders--;
      if (err instanceof SynthEmptyTrackSignal) {
        deleteManagedTrack(track.id);
        return;
      }
      if (err instanceof Error && err.message.includes("superseded")) {
        return; // a newer render is already in flight — ignore this one
      }
      console.error("[useInstrumentPlayback] render failed:", err);
      return;
    }
    pendingRenders--;

    const audioTrack = createAudioTrack(track.name);
    audioTrack.volume = track.volume;
    audioTrack.muted = track.muted;
    audioTrack.addSequence(createAudioBufferSequence(buffer, 0));

    // Atomically replace the old AudioTrack — single Map update so
    // hiddenAudioTrack never flickers through undefined between renders.
    replaceManagedTrack(track.id, audioTrack);

    // If the player is currently playing, start this track immediately so it
    // joins in sync with the rest of the playback.
    if (player.state === "playing") {
      const ctx = player.getAudioContext();
      const output = player.getOutputNode();
      if (ctx && output) {
        audioTrack.play(ctx, {
          output,
          currentTime: ctx.currentTime,
          startTime: player.currentTime,
        });
      }
    }
  }

  // ── extra duration so player knows the project length ─────────────────────
  // When there are no recorded AudioTracks the player's getTotalDuration()
  // would return 0, causing it to stop immediately on play().
  // setExtraDuration() lets us contribute the max instrument buffer duration.
  //
  // While a synth render is in-flight (pendingRenders > 0) we return a large
  // sentinel so the player's updatePlaybackTime loop never fires stopPlayback()
  // before the buffer arrives and the hot-join in syncTrack() can execute.
  // Once all renders are done the real AudioTrack.duration takes over.
  const PENDING_SENTINEL = 3600; // 1 hour — effectively infinite for a DAW session
  player.setExtraDuration(() => {
    if (pendingRenders > 0) return PENDING_SENTINEL;

    let max = 0;
    for (const audioTrack of rawManagedTracks.values()) {
      if (isFinite(audioTrack.duration)) max = Math.max(max, audioTrack.duration);
    }
    return max;
  });

  // watchEffect: re-renders when notes/bpm/muted change.
  // Volume is intentionally excluded here — it's handled by a separate watcher
  // that applies it live without triggering a full re-render.
  const stopRenderWatcher = watchEffect(() => {
    const tracks = getTracks();

    // Read the current map from the plain (non-reactive) mirror so that
    // replaceManagedTrack's assignment to managedTracksRef.value does NOT
    // register as a reactive dependency — which would otherwise cause this
    // effect to re-run in an infinite loop every time a render completes.
    const currentIds = new Set(tracks.map((t) => t.id));
    for (const [id] of rawManagedTracks) {
      if (!currentIds.has(id)) deleteManagedTrack(id);
    }

    for (const track of tracks) {
      // Touch reactive properties so watchEffect subscribes to them.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      track.notes.length;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      track.bpm;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      track.muted;

      syncTrack(track);
    }
  });

  // Separate watcher: apply volume changes live without re-rendering.
  const stopVolumeWatcher = watchEffect(() => {
    for (const track of getTracks()) {
      // Read from the plain mirror — not the reactive ref — so this watcher
      // is never invalidated by replaceManagedTrack's Map assignments.
      const audioTrack = rawManagedTracks.get(track.id);
      if (audioTrack) {
        // Only write if the value changed — each setter fires a "change" event
        // on the AudioTrack which would otherwise trigger an infinite loop via
        // the waveform view's syncAudioSequences listener.
        if (audioTrack.volume !== track.volume) audioTrack.volume = track.volume;
        if (audioTrack.muted !== track.muted) audioTrack.muted = track.muted;
      }
    }
  });

  // ── player event hooks ────────────────────────────────────────────────────

  const handlePlayerPlay = () => {
    const ctx = player.getAudioContext();
    const output = player.getOutputNode();
    if (!ctx || !output) return;

    for (const audioTrack of rawManagedTracks.values()) {
      audioTrack.play(ctx, {
        output,
        currentTime: ctx.currentTime,
        startTime: player.currentTime,
      });
    }
  };

  const handlePlayerStop = () => {
    for (const audioTrack of rawManagedTracks.values()) {
      audioTrack.stop();
    }
  };

  player.addEventListener("play", handlePlayerPlay);
  player.addEventListener("pause", handlePlayerStop);
  player.addEventListener("stop", handlePlayerStop);

  // ── cleanup ───────────────────────────────────────────────────────────────

  onUnmounted(() => {
    stopRenderWatcher();
    stopVolumeWatcher();

    player.setExtraDuration(null);

    player.removeEventListener("play", handlePlayerPlay);
    player.removeEventListener("pause", handlePlayerStop);
    player.removeEventListener("stop", handlePlayerStop);

    for (const id of [...rawManagedTracks.keys()]) {
      deleteManagedTrack(id);
    }
  });

  return managedTracksRef as Ref<Map<string, AudioTrack>>;
}
