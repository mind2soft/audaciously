// composables/useRecordedNode.ts
// useRecordedNode — reactive target-buffer recompute loop for a RecordedNode.
//
// Mirrors the pattern of useInstrumentNode.ts.  Watches the reactive properties
// that affect the pre-baked output (sourceBuffer + effects) and triggers
// computeTargetBuffer whenever they change.  On success, writes the resulting
// AudioBuffer back into the store via _setRecordedTargetBuffer.  When
// sourceBuffer is null, clears targetBuffer to null.
//
// Usage:
//   // In the app-level useAllNodes composable (not in individual views):
//   useRecordedNode(recordedNodeRef)

import { type Ref, ref, watch } from "vue";
import type { RecordedNode } from "../features/nodes";
import { computeTargetBuffer } from "../features/nodes/compute-target-buffer";
import { useNodesStore } from "../stores/nodes";

/**
 * Registers a reactive watcher on the given RecordedNode reference.
 * Whenever `sourceBuffer` or `effects` change, computeTargetBuffer is called
 * to pre-bake effects into a new buffer, which is then stored via
 * `useNodesStore()._setRecordedTargetBuffer`.
 *
 * When sourceBuffer is null (no recording yet), targetBuffer is cleared to null.
 *
 * Stale-render cancellation: if a new watcher invocation begins before a prior
 * async render completes, the prior result is discarded (generation counter).
 *
 * @param nodeRef - Reactive ref pointing to the RecordedNode to watch.
 *                  When set to null, no recompute is triggered.
 *
 * @returns `{ isComputing }` — true while an async render is in progress.
 *
 * The watcher fires immediately on mount (immediate: true) so that a node
 * already in the store gets its targetBuffer set without requiring an edit.
 */
export function useRecordedNode(nodeRef: Ref<RecordedNode | null>): {
  isComputing: Ref<boolean>;
} {
  const nodesStore = useNodesStore();
  const isComputing = ref(false);

  // Monotonically-increasing counter to discard results from superseded renders.
  let generation = 0;

  // ── Derived snapshot of buffer-affecting fields ───────────────────────────
  // We extract only the fields that affect the target output, so the watcher
  // does NOT fire on changes to unrelated properties (name, isRecording, etc.).
  watch(
    () => {
      const node = nodeRef.value;
      if (!node) return null;

      return {
        id: node.id,
        sourceBuffer: node.sourceBuffer,
        // Snapshot effects array — deep comparison handled by watch's deep option.
        effects: node.effects.map((e) => ({ ...e })),
      };
    },
    async (curr) => {
      if (!curr) return;

      if (!curr.sourceBuffer) {
        // No source recording — clear targetBuffer.
        nodesStore._setRecordedTargetBuffer(curr.id, null);
        return;
      }

      const gen = ++generation;
      isComputing.value = true;

      try {
        const target = await computeTargetBuffer(curr.sourceBuffer, curr.effects);

        if (gen !== generation) return; // Superseded by a newer invocation.

        nodesStore._setRecordedTargetBuffer(curr.id, target);
      } catch {
        // computeTargetBuffer should not throw in normal operation.
        // If it does (e.g. OfflineAudioContext render failure), silently retain
        // the previous targetBuffer value so playback continues uninterrupted.
      } finally {
        if (gen === generation) isComputing.value = false;
      }
    },
    { deep: true, immediate: true },
  );

  return { isComputing };
}
