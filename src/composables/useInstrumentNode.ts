// composables/useInstrumentNode.ts
// useInstrumentNode — reactive synth render + effect-bake loop for an InstrumentNode.
// See: .opencode/context/refactor/06-tasks.md (P4-02)
//
// Watches the reactive properties that affect the synthesized output (notes, bpm,
// timeSignature, effects) and triggers the synth worker whenever they change.
// On success, the raw buffer is passed through computeTargetBuffer to pre-bake
// effects, and the result is written back as `targetBuffer` via
// _setInstrumentTargetBuffer.  On empty notes, clears targetBuffer to null.
//
// IMPORTANT: notes/bpm/timeSignature/effects are all watched. Changes to other
// node properties (name, selectedNoteType, etc.) do NOT trigger a re-render.
//
// Usage:
//   // In the app-level useAllNodes composable (not in individual views):
//   useInstrumentNode(instrumentNodeRef)

import { watch, ref, type Ref } from "vue";
import {
  createSynthWorkerClient,
  SynthEmptyTrackSignal,
} from "../lib/music/synthWorker";
import { useNodesStore } from "../stores/nodes";
import type { InstrumentNode } from "../features/nodes";
import { computeTargetBuffer } from "../features/nodes/compute-target-buffer";

// ── Module-level synth client ─────────────────────────────────────────────────
// One client is sufficient for the whole application — the underlying worker
// uses per-track seqNum cancellation to handle rapid note edits cleanly.
// (See synthWorker.ts: "A single client instance is sufficient for the whole
// application; create one at the composable level and reuse it across all tracks.")
const synthClient = createSynthWorkerClient();

// ── Composable ─────────────────────────────────────────────────────────────────

/**
 * Registers a reactive watcher on the given InstrumentNode reference.
 * Whenever `notes`, `bpm`, `timeSignature`, or `effects` change, the synth
 * worker is invoked to regenerate the raw AudioBuffer, then computeTargetBuffer
 * pre-bakes the effects into a final buffer stored via
 * `useNodesStore()._setInstrumentTargetBuffer`.
 *
 * Stale-render cancellation: if a new watcher invocation begins before a prior
 * async render completes, the prior result is discarded (generation counter).
 * The synthClient already handles seqNum-based cancellation within the worker;
 * the generation counter covers the computeTargetBuffer step as well.
 *
 * @param nodeRef - Reactive ref pointing to the InstrumentNode to watch.
 *                  When set to null, no render is triggered.
 *
 * @returns `{ isComputing }` — true while an async render is in progress.
 *
 * The watcher fires immediately on mount (immediate: true) so that any node
 * already in the store is rendered without requiring a manual edit.
 */
export function useInstrumentNode(
  nodeRef: Ref<InstrumentNode | null>,
): { isComputing: Ref<boolean> } {
  const nodesStore = useNodesStore();
  const isComputing = ref(false);

  // Monotonically-increasing counter to discard results from superseded renders.
  let generation = 0;

  // ── Derived snapshot of synthesis-relevant fields ─────────────────────────
  // We extract only the fields that affect output, so watcher does NOT fire on
  // changes to unrelated properties (name, selectedNoteType, etc.).
  watch(
    () => {
      const node = nodeRef.value;
      if (!node) return null;

      return {
        id: node.id,
        instrumentType: node.instrumentType,
        bpm: node.bpm,
        // Flatten time-signature into primitives to trigger watch on nested change.
        tsBeatsPerMeasure: node.timeSignature.beatsPerMeasure,
        tsBeatUnit: node.timeSignature.beatUnit,
        // Snapshot notes array — deep comparison handled by watch's deep option.
        notes: node.notes.map((n) => ({
          id: n.id,
          pitchKey: n.pitchKey,
          startBeat: n.startBeat,
          durationBeats: n.durationBeats,
        })),
        // Snapshot effects so changes trigger a re-bake.
        effects: node.effects.map((e) => ({ ...e })),
      };
    },
    async (curr) => {
      if (!curr) return;

      const gen = ++generation;
      isComputing.value = true;

      try {
        const rawBuffer = await synthClient.render({
          trackId: curr.id,
          instrumentType: curr.instrumentType,
          bpm: curr.bpm,
          notes: curr.notes,
        });

        if (gen !== generation) return; // Superseded during synth render.

        // Pre-bake effects into the synthesized buffer.
        const target = await computeTargetBuffer(rawBuffer, curr.effects);

        if (gen !== generation) return; // Superseded during effect bake.

        // Write the final buffer back to the node in the store.
        nodesStore._setInstrumentTargetBuffer(curr.id, target);
      } catch (err) {
        if (err instanceof SynthEmptyTrackSignal) {
          // No notes to render — clear the buffer so the node shows as silent.
          if (gen === generation) {
            nodesStore._setInstrumentTargetBuffer(curr.id, null);
          }
          return;
        }
        // Superseded renders (seqNum mismatch) reject with a generic Error.
        // These are expected during rapid edits and should be silently ignored.
        // Any unexpected error is swallowed here; the buffer simply retains its
        // previous value until the next successful render.
      } finally {
        if (gen === generation) isComputing.value = false;
      }
    },
    { deep: true, immediate: true },
  );

  return { isComputing };
}
