// composables/useInstrumentNode.ts
// useInstrumentNode — reactive synth render + effect-bake loop for an InstrumentNode.
//
// Architecture: two-stage pipeline.
//
//   Stage 1 — Synth watcher (this file):
//     Watches notes, bpm, timeSignature, instrumentType.
//     Calls synthClient.render() → writes result to a local `rawBuffer` shallowRef.
//     Changes to effects do NOT trigger a synth re-render.
//
//   Stage 2 — Effect pipeline (useAudioPipeline):
//     Watches rawBuffer + effects → bakes effects via computeTargetBuffer worker
//     → writes result to pipeline.targetBuffer.
//
//   A final watch syncs pipeline.targetBuffer → store._setInstrumentTargetBuffer.
//
// This separation fixes the bug where effect-only edits triggered full synth
// re-renders, causing cascading seqNum cancellations that prevented the
// effect-baked buffer from ever reaching the store.
//
// Usage:
//   // In the app-level useAllNodes composable (not in individual views):
//   useInstrumentNode(instrumentNodeRef)

import { computed, type Ref, ref, shallowRef, watch } from "vue";
import type { InstrumentNode } from "../features/nodes";
import { computeTargetBuffer } from "../features/nodes/compute-target-buffer";
import { createSynthWorkerClient, SynthEmptyTrackSignal } from "../lib/music/synthWorker";
import { useNodesStore } from "../stores/nodes";
import { useAudioPipeline } from "./useAudioPipeline";

// ── Module-level synth client ─────────────────────────────────────────────────
// One client is sufficient for the whole application — the underlying worker
// uses per-track seqNum cancellation to handle rapid note edits cleanly.
const synthClient = createSynthWorkerClient();

// ── Composable ─────────────────────────────────────────────────────────────────

/**
 * Registers a two-stage reactive pipeline on the given InstrumentNode reference.
 *
 * Stage 1 — Synth render:
 *   When `notes`, `bpm`, `timeSignature`, or `instrumentType` change, invokes
 *   the synth worker to regenerate the raw AudioBuffer into a local shallowRef.
 *
 * Stage 2 — Effect bake (delegated to useAudioPipeline):
 *   When `rawBuffer` or `effects` change, bakes effects into targetBuffer.
 *
 * A final watch syncs targetBuffer → store._setInstrumentTargetBuffer.
 *
 * @param nodeRef - Reactive ref pointing to the InstrumentNode to watch.
 *                  When set to null, no render is triggered.
 *
 * @returns `{ isComputing }` — true while synth render OR effect bake is in progress.
 */
export function useInstrumentNode(nodeRef: Ref<InstrumentNode | null>): {
  isComputing: Ref<boolean>;
} {
  const nodesStore = useNodesStore();

  // ── Stage 1: Synth render → rawBuffer ──────────────────────────────────────

  const rawBuffer = shallowRef<AudioBuffer | null>(null);
  const isSynthRendering = ref(false);

  // Monotonically-increasing counter to discard stale synth results.
  let synthGeneration = 0;

  // Watch ONLY synth-relevant fields — NOT effects.
  watch(
    () => {
      const node = nodeRef.value;
      if (!node) return null;

      return {
        id: node.id,
        instrumentType: node.instrumentType,
        bpm: node.bpm,
        tsBeatsPerMeasure: node.timeSignature.beatsPerMeasure,
        tsBeatUnit: node.timeSignature.beatUnit,
        notes: node.notes.map((n) => ({
          id: n.id,
          pitchKey: n.pitchKey,
          startBeat: n.startBeat,
          durationBeats: n.durationBeats,
        })),
      };
    },
    async (curr) => {
      if (!curr) return;

      const gen = ++synthGeneration;
      isSynthRendering.value = true;

      try {
        const buffer = await synthClient.render({
          trackId: curr.id,
          instrumentType: curr.instrumentType,
          bpm: curr.bpm,
          notes: curr.notes,
        });

        if (gen !== synthGeneration) return; // Superseded during render.

        rawBuffer.value = buffer;
      } catch (err) {
        if (err instanceof SynthEmptyTrackSignal) {
          // No notes → clear raw buffer so pipeline propagates null to target.
          if (gen === synthGeneration) rawBuffer.value = null;
          return;
        }
        // Superseded renders (seqNum mismatch) reject with a generic Error.
        // Silently retain the previous rawBuffer.
      } finally {
        if (gen === synthGeneration) isSynthRendering.value = false;
      }
    },
    { deep: true, immediate: true },
  );

  // ── Stage 2: Effect pipeline (rawBuffer + effects → targetBuffer) ──────────

  const nodeId = computed(() => nodeRef.value?.id ?? "");
  const effects = computed(() => nodeRef.value?.effects ?? []);

  const { targetBuffer, isProcessing } = useAudioPipeline(rawBuffer, effects, nodeId, {
    processFn: computeTargetBuffer,
  });

  // ── Sync pipeline output → store ───────────────────────────────────────────

  watch(
    targetBuffer,
    (buffer) => {
      const id = nodeRef.value?.id;
      if (id) nodesStore._setInstrumentTargetBuffer(id, buffer);
    },
    { immediate: true },
  );

  // ── Combined computing state ───────────────────────────────────────────────

  const isComputing = computed(() => isSynthRendering.value || isProcessing.value);

  return { isComputing };
}
