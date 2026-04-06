// composables/useAudioPipeline.ts
// Reactive effect-baking pipeline — watches a source buffer and an effects
// list, and produces a targetBuffer with effects pre-baked.
//
// Reusable for both RecordedNode and InstrumentNode:
//   - RecordedNode:   sourceBuffer = decoded recording
//   - InstrumentNode: sourceBuffer = synth-rendered raw buffer
//
// When either input changes, the pipeline re-bakes effects into a new
// AudioBuffer.  Stale/superseded runs are cancelled via AbortController.
//
// The processing function is injectable (required) for testability — production
// callers pass computeTargetBuffer; tests pass a synchronous mock.

import { markRaw, onScopeDispose, type Ref, ref, shallowRef, watch } from "vue";
import type { AudioEffect } from "../features/effects/types";

// ── Types ────────────────────────────────────────────────────────────────────

/** Async function that bakes effects into a source buffer. */
export type ProcessFn = (
  source: AudioBuffer,
  effects: AudioEffect[],
  signal: AbortSignal,
  nodeId?: string,
  pristineChannels?: Float32Array[],
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
  /**
   * Optional node ID — forwarded to processFn so the worker can use per-node
   * seqNum cancellation. Without this, all nodes share a single seqNum namespace.
   */
  nodeId?: Ref<string>;
  /**
   * Optional pristine channel snapshots — forwarded to processFn so it can
   * use corruption-immune Float32Array data instead of AudioBuffer.getChannelData().
   */
  pristineChannels?: Ref<Float32Array[] | undefined>;
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
 * Cancellation: each invocation aborts the previous one via AbortController.
 * No generation counters, no seqNum maps — just standard AbortSignal.
 *
 * @param sourceBuffer  Reactive ref to the unprocessed audio (synth output or recording).
 * @param effects       Reactive ref to the ordered effect chain.
 * @param options       Pipeline options — must include processFn.
 */
export function useAudioPipeline(
  sourceBuffer: Ref<AudioBuffer | null>,
  effects: Ref<ReadonlyArray<AudioEffect>>,
  options: UseAudioPipelineOptions,
): UseAudioPipelineReturn {
  const processFn = options.processFn;
  const nodeIdRef = options.nodeId;
  const pristineRef = options.pristineChannels;

  const targetBuffer = shallowRef<AudioBuffer | null>(null);
  const isProcessing = ref(false);

  // ONE AbortController per regeneration cycle.
  let controller: AbortController | null = null;

  // Single watcher that fires when sourceBuffer OR effects change.
  // The getter accesses both reactive refs so Vue tracks both as dependencies.
  watch(
    () => ({
      source: sourceBuffer.value,
      // Snapshot effects for deep comparison (strips Vue reactive proxies).
      effects: JSON.parse(JSON.stringify(effects.value)) as AudioEffect[],
    }),
    async (curr) => {
      // Abort any in-progress bake.
      if (controller) controller.abort();

      // No source → clear target.
      if (!curr.source) {
        controller = null;
        targetBuffer.value = null;
        isProcessing.value = false;
        return;
      }

      // Fresh controller for this cycle.
      controller = new AbortController();
      const { signal } = controller;

      isProcessing.value = true;

      try {
        const result = await processFn(
          curr.source,
          curr.effects,
          signal,
          nodeIdRef?.value,
          pristineRef?.value,
        );

        // If aborted between await and here, signal.aborted is true.
        if (signal.aborted) return;

        targetBuffer.value = markRaw(result);
      } catch {
        // Aborted or worker error — retain previous targetBuffer so playback
        // continues uninterrupted until the next successful bake.
        if (signal.aborted) return;
      } finally {
        if (!signal.aborted) isProcessing.value = false;
      }
    },
    { deep: true, immediate: true },
  );

  onScopeDispose(() => controller?.abort());

  return { targetBuffer, isProcessing };
}
