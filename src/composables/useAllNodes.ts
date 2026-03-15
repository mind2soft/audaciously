// composables/useAllNodes.ts
// useAllNodes — app-level composable that wires reactive buffer-recompute loops
// for every RecordedNode and InstrumentNode in the store.
//
// Must be called once from App.vue (or another top-level component that is
// never unmounted) so that ALL nodes maintain a live targetBuffer regardless of
// which node is currently selected or viewed.
//
// Implementation notes:
//   - Watches the set of node IDs in nodesById for additions and removals.
//   - For each new RecordedNode / InstrumentNode, creates an effectScope
//     containing the composable's internal watcher.  The scope is stopped when
//     the node is removed, cleaning up the watcher and computed ref.
//   - FolderNodes are skipped — they carry no audio buffer.

import { watch, computed, effectScope } from "vue";
import { useNodesStore } from "../stores/nodes";
import type { RecordedNode, InstrumentNode } from "../features/nodes";
import { useRecordedNode } from "./useRecordedNode";
import { useInstrumentNode } from "./useInstrumentNode";

/**
 * Registers per-node reactive buffer-recompute loops for every
 * RecordedNode and InstrumentNode currently in (or subsequently added to) the
 * store.
 *
 * Call once from App.vue so all nodes have live targetBuffers regardless of
 * which node is selected or viewed.
 */
export function useAllNodes(): void {
  const nodesStore = useNodesStore();

  // Per-node effect scopes so we can stop them when a node is removed.
  const scopes = new Map<string, ReturnType<typeof effectScope>>();

  // Watch the set of node IDs. deep:true ensures the array elements are
  // compared by value so the handler only fires when the key set changes
  // (node added / removed), not on every unrelated reactive update.
  watch(
    () => [...nodesStore.nodesById.keys()],
    (currentIds) => {
      // Stop scopes for nodes that were removed.
      for (const [id, scope] of scopes) {
        if (!nodesStore.nodesById.has(id)) {
          scope.stop();
          scopes.delete(id);
        }
      }

      // Create scopes for newly-added nodes.
      for (const id of currentIds) {
        if (scopes.has(id)) continue;

        const node = nodesStore.nodesById.get(id);
        if (!node) continue;

        if (node.kind === "recorded") {
          const scope = effectScope();
          scopes.set(id, scope);
          scope.run(() => {
            const nodeRef = computed(
              () =>
                (nodesStore.nodesById.get(id) as RecordedNode | undefined) ??
                null,
            );
            useRecordedNode(nodeRef);
          });
        } else if (node.kind === "instrument") {
          const scope = effectScope();
          scopes.set(id, scope);
          scope.run(() => {
            const nodeRef = computed(
              () =>
                (nodesStore.nodesById.get(id) as InstrumentNode | undefined) ??
                null,
            );
            useInstrumentNode(nodeRef);
          });
        }
      }
    },
    { deep: true, immediate: true },
  );
}
