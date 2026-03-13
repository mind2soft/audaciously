// composables/useInstrumentNode.ts
// useInstrumentNode — reactive synth render loop for an InstrumentNode.
// See: .opencode/context/refactor/06-tasks.md (P4-02)
//
// Watches the reactive properties that affect synthesis output (notes, bpm,
// timeSignature) and triggers the synth worker whenever they change.
// On success, writes the resulting AudioBuffer back into the store via
// setInstrumentBuffer. On empty notes, clears the buffer to null.
//
// IMPORTANT: Only notes/bpm/timeSignature are watched. Changes to other node
// properties (name, effects, selectedNoteType, etc.) do NOT trigger a re-render.
//
// Usage:
//   // In a component that owns the selected InstrumentNode:
//   useInstrumentNode(instrumentNodeRef)

import { watch, type Ref } from "vue";
import {
  createSynthWorkerClient,
  SynthEmptyTrackSignal,
} from "../lib/music/synthWorker";
import { useNodesStore } from "../stores/nodes";
import type { InstrumentNode } from "../features/nodes";

// ── Module-level synth client ─────────────────────────────────────────────────
// One client is sufficient for the whole application — the underlying worker
// uses per-track seqNum cancellation to handle rapid note edits cleanly.
// (See synthWorker.ts: "A single client instance is sufficient for the whole
// application; create one at the composable level and reuse it across all tracks.")
const synthClient = createSynthWorkerClient();

// ── Composable ─────────────────────────────────────────────────────────────────

/**
 * Registers a reactive watcher on the given InstrumentNode reference.
 * Whenever `notes`, `bpm`, or `timeSignature` change, the synth worker is
 * invoked to regenerate the AudioBuffer, which is then stored via
 * `useNodesStore().setInstrumentBuffer`.
 *
 * @param nodeRef - Reactive ref pointing to the InstrumentNode to watch.
 *                  When set to null, no render is triggered.
 *
 * The watcher fires immediately on mount (immediate: true) so that any node
 * already in the store is rendered without requiring a manual edit.
 */
export function useInstrumentNode(nodeRef: Ref<InstrumentNode | null>): void {
  const nodesStore = useNodesStore();

  // ── Derived snapshot of synthesis-relevant fields ─────────────────────────
  // We extract only the fields that affect output, so watcher does NOT fire on
  // changes to unrelated properties (name, effects, selectedNoteType, etc.).
  watch(
    () => {
      const node = nodeRef.value;
      if (!node) return null;

      return {
        id: node.id,
        instrumentId: node.instrumentId,
        bpm: node.bpm,
        // Flatten time-signature into primitives to trigger watch on nested change.
        tsBeatsPerMeasure: node.timeSignature.beatsPerMeasure,
        tsBeatUnit: node.timeSignature.beatUnit,
        // Snapshot notes array — deep comparison handled by watch's deep option.
        notes: node.notes.map((n) => ({
          id: n.id,
          pitchId: n.pitchId,
          startBeat: n.startBeat,
          durationBeats: n.durationBeats,
        })),
      };
    },
    async (curr) => {
      if (!curr) return;

      try {
        const buffer = await synthClient.render({
          id: curr.id,
          instrumentId: curr.instrumentId,
          bpm: curr.bpm,
          notes: curr.notes,
        });

        // Write the rendered buffer back to the node in the store.
        nodesStore.setInstrumentBuffer(curr.id, buffer);
      } catch (err) {
        if (err instanceof SynthEmptyTrackSignal) {
          // No notes to render — clear the buffer so the node shows as silent.
          nodesStore.setInstrumentBuffer(curr.id, null);
          return;
        }
        // Superseded renders (seqNum mismatch) reject with a generic Error.
        // These are expected during rapid edits and should be silently ignored.
        // Any unexpected error is swallowed here; the buffer simply retains its
        // previous value until the next successful render.
      }
    },
    { deep: true, immediate: true },
  );
}
