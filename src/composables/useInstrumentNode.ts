// composables/useInstrumentNode.ts
// useInstrumentNode — single-watcher reactive pipeline for an InstrumentNode.
//
// Architecture: ONE watcher, ONE AbortController.
//
//   Watches ALL inputs: notes, bpm, timeSignature, instrumentType, effects.
//   Any change triggers the full cycle:
//     1. Abort the previous cycle (if any)
//     2. Synth render → raw AudioBuffer
//     3. Effect processing → baked AudioBuffer
//     4. Store update → targetBuffer written to store
//
//   This eliminates the two-stage architecture (separate synth watcher +
//   useAudioPipeline) that caused coordination bugs with long tracks.
//   Cancellation is purely AbortController-based — no generation counters.
//
// Usage:
//   // In the app-level useAllNodes composable (not in individual views):
//   useInstrumentNode(instrumentNodeRef)

import { onScopeDispose, type Ref, ref, watch } from "vue";
import type { AudioEffect } from "../features/effects/types";
import type { InstrumentNode } from "../features/nodes";
import { computeTargetBuffer } from "../features/nodes/compute-target-buffer";
import { createSynthWorkerClient, SynthEmptyTrackSignal } from "../lib/music/synthWorker";
import { useNodesStore } from "../stores/nodes";

// ── Module-level synth client ─────────────────────────────────────────────────
// One client is sufficient for the whole application — the underlying worker
// uses per-track seqNum cancellation to handle rapid note edits cleanly.
const synthClient = createSynthWorkerClient();

// ── Composable ─────────────────────────────────────────────────────────────────

/**
 * Registers a single-watcher reactive pipeline on the given InstrumentNode.
 *
 * When ANY input changes (notes, bpm, timeSignature, instrumentType, effects),
 * aborts the previous cycle and runs: synth render → effect bake → store update.
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
  const isComputing = ref(false);

  // ONE AbortController per regeneration cycle.
  let controller: AbortController | null = null;

  // Single watcher covering ALL inputs.
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
        // Snapshot effects for deep comparison (strips Vue reactive proxies).
        effects: JSON.parse(JSON.stringify(node.effects)) as AudioEffect[],
      };
    },
    async (curr) => {
      // Abort any in-progress cycle.
      if (controller) controller.abort();

      if (!curr) {
        controller = null;
        isComputing.value = false;
        return;
      }

      // Fresh controller for this cycle.
      controller = new AbortController();
      const { signal } = controller;

      isComputing.value = true;

      try {
        // ── Step 1: Synth render ──────────────────────────────────────────
        const rawBuffer = await synthClient.render({
          trackId: curr.id,
          instrumentType: curr.instrumentType,
          bpm: curr.bpm,
          notes: curr.notes,
        });

        if (signal.aborted) return;

        // ── Step 2: Effect processing ─────────────────────────────────────
        const targetBuffer = await computeTargetBuffer(rawBuffer, curr.effects, signal, curr.id);

        if (signal.aborted) return;

        // ── Step 3: Store update ──────────────────────────────────────────
        nodesStore.setTargetBuffer(curr.id, targetBuffer);
      } catch (err) {
        if (signal.aborted) return;

        if (err instanceof SynthEmptyTrackSignal) {
          // No notes → clear target buffer.
          nodesStore.setTargetBuffer(curr.id, null);
          return;
        }

        // Worker error — retain previous targetBuffer so playback continues.
      } finally {
        if (!signal.aborted) isComputing.value = false;
      }
    },
    { deep: true, immediate: true },
  );

  // Abort any in-flight cycle when the enclosing effect scope is disposed.
  onScopeDispose(() => {
    controller?.abort();
  });

  return { isComputing };
}
