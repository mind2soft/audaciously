// composables/useAudioPipeline.ts
// Reactive effect-baking pipeline — watches a source buffer and an effects
// list independently, and produces a targetBuffer with effects pre-baked.
//
// Reusable for both RecordedNode and InstrumentNode:
//   - RecordedNode:   sourceBuffer = decoded recording
//   - InstrumentNode: sourceBuffer = synth-rendered raw buffer
//
// When either input changes, the pipeline re-bakes effects into a new
// AudioBuffer.  Stale results are discarded via a generation counter.
//
// The processing function is injectable (required) for testability — production
// callers pass computeTargetBuffer; tests pass a synchronous mock.

import { type Ref, ref, shallowRef, watch } from "vue";
import type { AudioEffect } from "../features/effects/types";

// ── Types ────────────────────────────────────────────────────────────────────

/** Async function that bakes effects into a source buffer. */
export type ProcessFn = (
  source: AudioBuffer,
  effects: AudioEffect[],
  nodeId: string,
) => Promise<AudioBuffer>;

export interface UseAudioPipelineOptions {
  /**
   * Async function that bakes effects into a source buffer.
   *
   * **Required** — callers must provide the concrete implementation.
   * In production, pass `computeTargetBuffer` (from features/nodes/).
   * In tests, pass a synchronous mock.
   */
  processFn: ProcessFn;
}

export interface UseAudioPipelineReturn {
  /** The processed buffer with effects baked in. Null when source is null. */
  targetBuffer: Ref<AudioBuffer | null>;
  /** True while an async bake is in progress. */
  isProcessing: Ref<boolean>;
}

// ── Composable ───────────────────────────────────────────────────────────────

/**
 * Reactive effect-baking pipeline.
 *
 * Watches `sourceBuffer` and `effects` — when either changes, bakes effects
 * into a new AudioBuffer written to `targetBuffer`.
 *
 * @param sourceBuffer  Reactive ref to the unprocessed audio (synth output or recording).
 * @param effects       Reactive ref to the ordered effect chain.
 * @param nodeId        Reactive ref to the node's unique ID (for worker cancellation).
 * @param options       Pipeline options — must include processFn.
 */
export function useAudioPipeline(
  sourceBuffer: Ref<AudioBuffer | null>,
  effects: Ref<ReadonlyArray<AudioEffect>>,
  nodeId: Ref<string>,
  options: UseAudioPipelineOptions,
): UseAudioPipelineReturn {
  const processFn = options.processFn;

  const targetBuffer = shallowRef<AudioBuffer | null>(null);
  const isProcessing = ref(false);

  // Monotonically-increasing counter to discard stale results.
  let generation = 0;

  // Single watcher that fires when sourceBuffer OR effects change.
  // The getter accesses both reactive refs so Vue tracks both as dependencies.
  watch(
    () => ({
      source: sourceBuffer.value,
      // Snapshot effects for deep comparison (same pattern as the old watchers).
      effects: JSON.parse(JSON.stringify(effects.value)) as AudioEffect[],
      id: nodeId.value,
    }),
    async (curr) => {
      const gen = ++generation;

      // No source → clear target.
      if (!curr.source) {
        targetBuffer.value = null;
        isProcessing.value = false;
        return;
      }

      isProcessing.value = true;

      try {
        const result = await processFn(curr.source, curr.effects, curr.id);

        // Discard if superseded by a newer invocation.
        if (gen !== generation) return;

        targetBuffer.value = result;
      } catch {
        // Superseded renders or worker errors — retain the previous targetBuffer
        // so playback continues uninterrupted until the next successful bake.
        if (gen !== generation) return;
      } finally {
        if (gen === generation) isProcessing.value = false;
      }
    },
    { deep: true, immediate: true },
  );

  return { targetBuffer, isProcessing };
}
