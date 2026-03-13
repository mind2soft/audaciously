// stores/player.ts
// usePlayerStore — wraps the AudioPlayer engine with reactive Vue state.
// See: .opencode/context/refactor/03-state-management.md (P2-01)
//
// The AudioPlayer engine (lib/audio/player.ts) is kept UNCHANGED.
// This store mirrors engine state into reactive refs and exposes it for UI.
//
// P7-04: Before each play(), buildTracksFromStore() translates the current
// Track/Segment/ProjectNode data from useSequenceStore + useNodesStore into
// engine AudioTrack objects with per-segment applyEffectChain wiring.

import { defineStore } from "pinia";
import { ref } from "vue";
import { createPlayer, type AudioPlayer } from "../lib/audio/player";
import { loadSettings } from "../lib/settings";
import { buildTracksFromStore } from "../features/playback/build-tracks";
import { useSequenceStore } from "./sequence";
import { useNodesStore } from "./nodes";

// ── Module-level engine singleton (initialized with persisted settings) ─────
// Created once per app lifetime; reused across HMR reloads via Pinia.
function createEngineWithSettings(): AudioPlayer {
  const engine = createPlayer();
  const settings = loadSettings();
  engine.volume = settings.volume;
  // setOutputDeviceId is async but resolves immediately when no context exists yet.
  void engine.setOutputDeviceId(settings.outputDeviceId);
  return engine;
}

export const usePlayerStore = defineStore("player", () => {
  // ── Internal engine (not reactive — use events for state sync) ─────────────
  const engine: AudioPlayer = createEngineWithSettings();

  // ── Reactive state (mirrors engine state for UI) ──────────────────────────
  const state = ref<"ready" | "playing" | "paused">("ready");
  const currentTime = ref(0);
  const totalDuration = ref(0);
  const volume = ref(1);
  const currentFrame = ref<AudioBuffer | null>(null);

  // ── Sync engine events → reactive refs ────────────────────────────────────
  engine.addEventListener("play", () => {
    state.value = "playing";
  });
  engine.addEventListener("resume", () => {
    state.value = "playing";
  });
  engine.addEventListener("pause", () => {
    state.value = "paused";
  });
  engine.addEventListener("stop", () => {
    state.value = "ready";
    currentTime.value = 0;
    currentFrame.value = null;
  });
  engine.addEventListener("seek", (event) => {
    currentTime.value = event.player.currentTime;
  });
  engine.addEventListener("timeupdate", (event) => {
    currentTime.value = event.player.currentTime;
    totalDuration.value = event.player.totalDuration;
    currentFrame.value = event.audioFrame;
  });
  engine.addEventListener("change", () => {
    totalDuration.value = engine.totalDuration;
  });
  engine.addEventListener("volumechange", () => {
    volume.value = engine.volume;
  });

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * Synchronise the engine's track list from the current store state, then
   * start playback.  Called before every play() so that any changes made to
   * nodes/segments/effects while stopped are reflected in the audio graph.
   *
   * Only called when the engine is in "ready" state (not when resuming from
   * pause) because setTracks() internally calls stopPlayback(true), which
   * would reset the pause position.
   */
  function _syncEngineTracksIfReady(): void {
    if (engine.state !== "ready") return;

    const sequenceStore = useSequenceStore();
    const nodesStore = useNodesStore();

    const engineTracks = buildTracksFromStore(
      sequenceStore.tracks,
      nodesStore.nodesById,
    );
    engine.setTracks(engineTracks);
  }

  async function play(): Promise<void> {
    _syncEngineTracksIfReady();
    await engine.play();
  }

  function pause(): void {
    engine.pause();
  }

  function stop(): void {
    engine.stop();
  }

  function seek(time: number): void {
    engine.currentTime = time;
    currentTime.value = time;
  }

  function setVolume(v: number): void {
    engine.volume = v;
    volume.value = v;
  }

  // ── Engine access (for audio-graph wiring by composables) ─────────────────

  function getEngine(): AudioPlayer {
    return engine;
  }

  function getAudioContext(): AudioContext | null {
    return engine.getAudioContext();
  }

  function getOutputNode(): AudioNode | null {
    return engine.getOutputNode();
  }

  return {
    // state
    state,
    currentTime,
    totalDuration,
    volume,
    currentFrame,
    // actions
    play,
    pause,
    stop,
    seek,
    setVolume,
    // engine access
    getEngine,
    getAudioContext,
    getOutputNode,
  };
});
