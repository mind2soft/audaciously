// composables/useFolderNode.ts
// Typed reactive accessor + mutations for a FolderNode.
//
// Takes a nodeId string, returns ComputedRef properties and mutation methods.
// Components use this instead of receiving a full node object via props,
// keeping the reactive surface narrow and type-safe.

import { type ComputedRef, computed } from "vue";
import type { FolderNode } from "../features/nodes";
import type { ProjectNodeID } from "../features/nodes/node";
import { useNodesStore } from "../stores/nodes";

export interface UseFolderNode {
  // Reactive reads
  name: ComputedRef<string>;
  childIds: ComputedRef<ProjectNodeID[]>;

  // Mutations
  rename(newName: string): void;
}

/**
 * Typed reactive accessor for a FolderNode.
 *
 * @param nodeId - ID of the node in the store. Must exist and be kind "folder".
 * @throws If the node is not found or is the wrong kind (developer error).
 */
export function useFolderNode(nodeId: string): UseFolderNode {
  const store = useNodesStore();

  /** Resolve the node from the reactive Map, asserting correct kind. */
  function getNode(): FolderNode {
    const node = store.nodesById.get(nodeId);
    if (!node) throw new Error(`Node "${nodeId}" not found`);
    if (node.kind !== "folder") {
      throw new Error(`Node "${nodeId}" is "${node.kind}", expected "folder"`);
    }
    return node;
  }

  // ── Reactive reads ──────────────────────────────────────────────────────

  const name = computed(() => getNode().name);
  const childIds = computed(() => getNode().childIds);

  // ── Mutations ───────────────────────────────────────────────────────────

  function rename(newName: string): void {
    getNode().name = newName;
  }

  return {
    name,
    childIds,
    rename,
  };
}
