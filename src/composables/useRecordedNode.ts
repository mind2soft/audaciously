// composables/useRecordedNode.ts
// useRecordedNode — reactive effect-bake loop for a RecordedNode.
//
// Delegates entirely to useAudioPipeline:
//   sourceBuffer (from store) + effects → pipeline → targetBuffer
//
// A watch syncs pipeline.targetBuffer back to the store via
// _setRecordedTargetBuffer.  When sourceBuffer is null (no recording yet),
// the pipeline propagates null through to targetBuffer automatically.
//
// Usage:
//   // In the app-level useAllNodes composable (not in individual views):
//   useRecordedNode(recordedNodeRef)

import { computed, type Ref, watch } from "vue";
import type { RecordedNode } from "../features/nodes";
import { computeTargetBuffer } from "../features/nodes/compute-target-buffer";
import { useNodesStore } from "../stores/nodes";
import { useAudioPipeline } from "./useAudioPipeline";

/**
 * Registers a reactive effect-baking pipeline on the given RecordedNode reference.
 *
 * Whenever `sourceBuffer` or `effects` change, bakes effects into a new buffer
 * via useAudioPipeline and writes the result to the store.
 *
 * @param nodeRef - Reactive ref pointing to the RecordedNode to watch.
 *                  When set to null, no recompute is triggered.
 *
 * @returns `{ isComputing }` — true while an async bake is in progress.
 */
export function useRecordedNode(nodeRef: Ref<RecordedNode | null>): {
  isComputing: Ref<boolean>;
} {
  const nodesStore = useNodesStore();

  // ── Derived refs for pipeline inputs ───────────────────────────────────────

  const nodeId = computed(() => nodeRef.value?.id ?? "");
  const sourceBuffer = computed(() => nodeRef.value?.sourceBuffer ?? null);
  const effects = computed(() => nodeRef.value?.effects ?? []);

  // ── Effect pipeline (sourceBuffer + effects → targetBuffer) ────────────────

  const { targetBuffer, isProcessing } = useAudioPipeline(sourceBuffer, effects, nodeId, {
    processFn: computeTargetBuffer,
  });

  // ── Sync pipeline output → store ───────────────────────────────────────────

  watch(
    targetBuffer,
    (buffer) => {
      const id = nodeRef.value?.id;
      if (id) nodesStore._setRecordedTargetBuffer(id, buffer);
    },
    { immediate: true },
  );

  return { isComputing: isProcessing };
}
