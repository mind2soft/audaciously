// composables/useNodePlayback.ts
// useNodePlayback — independent preview play/pause for a single ProjectNode.
// See: .opencode/context/refactor/06-tasks.md (P4-01)
//
// Creates an ISOLATED AudioContext that is completely separate from the main
// player engine. This guarantees that previewing a node in the node panel
// never interferes with main timeline playback.
//
// Usage:
//   const { state, currentTime, play, pause, stop, seek } = useNodePlayback(nodeRef)

import { ref, watch, onUnmounted, type Ref } from "vue";
import type { RecordedNode, InstrumentNode } from "../features/nodes";
import { applyEffectChain } from "../features/effects";

// ── Public types ───────────────────────────────────────────────────────────────

export type NodePlaybackState = "idle" | "playing" | "paused";

export interface UseNodePlaybackReturn {
  /** Current playback state of the preview. */
  state: Ref<NodePlaybackState>;
  /** Playback cursor position within the node's buffer (seconds). */
  currentTime: Ref<number>;
  /** Start or resume playback from the current cursor position. */
  play(): Promise<void>;
  /** Pause playback, preserving cursor position for resume. */
  pause(): void;
  /** Stop playback and reset the cursor to 0. */
  stop(): void;
  /** Jump the cursor to `time` (seconds). If playing, restarts from that position. */
  seek(time: number): Promise<void>;
}

// ── Composable ─────────────────────────────────────────────────────────────────

/**
 * Provides independent play/pause/stop for a single RecordedNode or
 * InstrumentNode. The audio graph is entirely isolated — a new AudioContext is
 * created on each play() call and closed on stop/pause.
 *
 * @param nodeRef - Reactive ref to the node to preview. When the ref changes
 *                  (e.g. the user selects a different node), playback stops
 *                  automatically.
 */
export function useNodePlayback(
  nodeRef: Ref<RecordedNode | InstrumentNode | null>,
): UseNodePlaybackReturn {
  // ── Reactive state ─────────────────────────────────────────────────────────
  const state = ref<NodePlaybackState>("idle");
  const currentTime = ref(0);

  // ── Isolated playback internals (non-reactive) ─────────────────────────────
  /** The isolated AudioContext for this preview. Replaced on each play(). */
  let ctx: AudioContext | null = null;
  /** The source node currently scheduled. */
  let source: AudioBufferSourceNode | null = null;
  /** Effect nodes created by applyEffectChain (kept for disposal logging). */
  let effectNodes: AudioNode[] = [];
  /** Buffer-relative offset at which playback started (for pause-resume). */
  let resumeFrom = 0;
  /** ctx.currentTime captured at the moment source.start() was called. */
  let startCtxTime = 0;
  /** requestAnimationFrame handle for the cursor-update loop. */
  let raf = 0;

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Tear down the current audio graph without resetting cursor state.
   * Safe to call multiple times.
   */
  function _teardown(): void {
    cancelAnimationFrame(raf);
    raf = 0;

    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped — ignore.
      }
      source = null;
    }

    // AudioContext.close() disconnects all nodes automatically.
    // Explicitly disconnect effect nodes first to free memory sooner.
    for (const node of effectNodes) {
      try { node.disconnect(); } catch { /* ignore */ }
    }
    ctx?.close();
    ctx = null;
    effectNodes = [];
  }

  /** rAF loop: advance the cursor ref and detect natural end-of-buffer. */
  function _tick(): void {
    if (ctx && state.value === "playing") {
      const elapsed = ctx.currentTime - startCtxTime;
      const node = nodeRef.value;
      const duration = node?.buffer?.duration ?? 0;
      const t = resumeFrom + elapsed;

      currentTime.value = Math.min(t, duration);

      if (duration > 0 && t >= duration) {
        // Buffer finished naturally — clean up and return to idle.
        _teardown();
        state.value = "idle";
        currentTime.value = 0;
        resumeFrom = 0;
        return;
      }
    }

    raf = requestAnimationFrame(_tick);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async function play(): Promise<void> {
    if (state.value === "playing") return;

    const node = nodeRef.value;
    if (!node || !node.buffer) return;

    // Create an isolated AudioContext for this preview session.
    ctx = new AudioContext();
    source = ctx.createBufferSource();
    source.buffer = node.buffer;

    const contextTime = ctx.currentTime;
    startCtxTime = contextTime;

    // Wire effects between the source and the context destination.
    effectNodes = applyEffectChain(
      ctx,
      source,
      ctx.destination,
      node.effects,
      { offset: 0, duration: node.buffer.duration },
      contextTime,
    );

    // Start from the saved resume position (0 if coming from idle).
    source.start(0, resumeFrom);

    // Detect natural buffer end via onended as a fallback to the rAF loop.
    source.onended = () => {
      if (state.value === "playing") {
        _teardown();
        state.value = "idle";
        currentTime.value = 0;
        resumeFrom = 0;
      }
    };

    state.value = "playing";
    raf = requestAnimationFrame(_tick);
  }

  function pause(): void {
    if (state.value !== "playing") return;

    // Snapshot the current position before tearing down the context.
    if (ctx) {
      const elapsed = ctx.currentTime - startCtxTime;
      const node = nodeRef.value;
      const duration = node?.buffer?.duration ?? 0;
      resumeFrom = Math.min(resumeFrom + elapsed, duration);
      currentTime.value = resumeFrom;
    }

    // Prevent the onended handler from triggering state changes.
    if (source) {
      source.onended = null;
    }

    _teardown();
    state.value = "paused";
  }

  function stop(): void {
    if (source) {
      source.onended = null;
    }
    _teardown();
    state.value = "idle";
    currentTime.value = 0;
    resumeFrom = 0;
  }

  /**
   * Seek to a specific position in the buffer.
   * Updates the cursor immediately. If currently playing, tears down the
   * existing graph and restarts from the new position.
   */
  async function seek(time: number): Promise<void> {
    const node = nodeRef.value;
    const duration = node?.buffer?.duration ?? 0;
    const clampedTime = Math.max(0, Math.min(time, duration));

    const wasPlaying = state.value === "playing";

    // Tear down current audio graph without resetting cursor.
    if (source) {
      source.onended = null;
    }
    _teardown();

    resumeFrom = clampedTime;
    currentTime.value = clampedTime;

    if (wasPlaying) {
      state.value = "idle"; // play() guards against re-entry when already "playing"
      await play();
    }
    // Otherwise stay in paused or idle state at the new position — no action needed.
  }

  // ── Watchers & lifecycle ───────────────────────────────────────────────────

  // When the node reference changes (user selects a different node), stop
  // the current preview so stale audio does not continue playing.
  watch(nodeRef, () => {
    stop();
  });

  onUnmounted(() => {
    stop();
  });

  return { state, currentTime, play, pause, stop, seek };
}
