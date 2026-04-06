// stores/nodes.ts
// useNodesStore — manages the project node tree (folder/recorded/instrument).
// See: .opencode/context/refactor/03-state-management.md (P2-03)

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { FolderNode, InstrumentNode, ProjectNode, RecordedNode } from "../features/nodes";
import {
  createFolderNode,
  createInstrumentNode,
  createRecordedNode,
  isAudioNode,
  isFolderNode,
  isRecordedNode,
} from "../features/nodes";
import {
  clearAllBuffers,
  registerBuffer,
  removeBuffer,
} from "../lib/audio/audio-buffer-repository";
import type { MusicInstrumentType } from "../lib/music/instruments";

// ── Serialization types ────────────────────────────────────────────────────────

export interface NodeTreeJSON {
  nodesById: Record<string, ProjectNode>;
  rootIds: string[];
  selectedNodeId: string | null;
}

// ── Target buffer change notification ─────────────────────────────────────────

export type TargetBufferListener = (id: string, buffer: AudioBuffer | null) => void;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useNodesStore = defineStore("nodes", () => {
  // ── State ─────────────────────────────────────────────────────────────────
  /** All nodes by id. */
  const nodesById = ref<Map<string, ProjectNode>>(new Map());
  /** Listeners notified whenever setTargetBuffer writes a new buffer. */
  const targetBufferListeners = new Set<TargetBufferListener>();

  /** Ordered root-level node ids (top-level of the tree). */
  const rootIds = ref<string[]>([]);
  /** Currently selected node id in the node panel. */
  const selectedNodeId = ref<string | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────

  const selectedNode = computed((): ProjectNode | null =>
    selectedNodeId.value ? (nodesById.value.get(selectedNodeId.value) ?? null) : null,
  );

  const rootNodes = computed((): ProjectNode[] =>
    rootIds.value.map((id) => nodesById.value.get(id)).filter((n): n is ProjectNode => n != null),
  );

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Add a node to the map and attach it to parent or root. */
  function _register(node: ProjectNode, parentId?: string): void {
    nodesById.value.set(node.id, node);
    if (parentId) {
      const parent = nodesById.value.get(parentId);
      if (parent && isFolderNode(parent)) {
        parent.childIds.push(node.id);
      }
    } else {
      rootIds.value.push(node.id);
    }
  }

  /** Detach a node id from its current parent or root list. */
  function _detach(id: string): void {
    // Remove from root
    const ri = rootIds.value.indexOf(id);
    if (ri !== -1) {
      rootIds.value.splice(ri, 1);
      return;
    }
    // Remove from any folder's childIds
    for (const node of nodesById.value.values()) {
      if (isFolderNode(node)) {
        const ci = node.childIds.indexOf(id);
        if (ci !== -1) {
          node.childIds.splice(ci, 1);
          return;
        }
      }
    }
  }

  /** Count nodes whose name matches a prefix pattern like "New Folder". */
  function _countByPrefix(prefix: string): number {
    let max = 0;
    for (const node of nodesById.value.values()) {
      const match = node.name.match(new RegExp(`^${prefix} (\\d+)$`));
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    return max;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function addFolderNode(name: string, parentId?: string): FolderNode {
    const node = createFolderNode(name);
    _register(node, parentId);
    return node;
  }

  function addRecordedNode(name: string, parentId?: string): RecordedNode {
    const node = createRecordedNode(name);
    _register(node, parentId);
    return node;
  }

  function addInstrumentNode(
    name: string,
    instrumentId: MusicInstrumentType,
    parentId?: string,
  ): InstrumentNode {
    const node = createInstrumentNode(name, instrumentId);
    _register(node, parentId);
    return node;
  }

  function removeNode(id: string): void {
    const node = nodesById.value.get(id);
    if (!node) return;

    // Recursively remove children for folders
    if (isFolderNode(node)) {
      // Copy array since we'll be mutating it
      for (const childId of [...node.childIds]) {
        removeNode(childId);
      }
    }

    // Clean up buffer repository entries before removing the node
    if (isAudioNode(node)) {
      if (node.targetBufferId) removeBuffer(node.targetBufferId);
      if (isRecordedNode(node) && node.sourceBufferId) removeBuffer(node.sourceBufferId);
    }

    _detach(id);
    nodesById.value.delete(id);

    if (selectedNodeId.value === id) {
      selectedNodeId.value = null;
    }
  }

  function renameNode(id: string, name: string): void {
    const node = nodesById.value.get(id);
    if (node) {
      node.name = name;
    }
  }

  function moveNode(id: string, newParentId: string | null, insertIndex?: number): void {
    const node = nodesById.value.get(id);
    if (!node) return;

    _detach(id);

    if (newParentId) {
      const parent = nodesById.value.get(newParentId);
      if (parent && isFolderNode(parent)) {
        if (insertIndex !== undefined) {
          parent.childIds.splice(insertIndex, 0, id);
        } else {
          parent.childIds.push(id);
        }
      }
    } else {
      if (insertIndex !== undefined) {
        rootIds.value.splice(insertIndex, 0, id);
      } else {
        rootIds.value.push(id);
      }
    }
  }

  function selectNode(id: string | null): void {
    selectedNodeId.value = id;
  }

  function setTargetBuffer(id: string, buffer: AudioBuffer | null): void {
    const node = nodesById.value.get(id);
    if (node && isAudioNode(node)) {
      // Remove old buffer from repository
      if (node.targetBufferId) {
        removeBuffer(node.targetBufferId);
      }
      // Register new buffer (or clear)
      node.targetBufferId = buffer ? registerBuffer(buffer) : null;
      for (const listener of targetBufferListeners) {
        listener(id, buffer);
      }
    }
  }

  /**
   * Register a listener called whenever setTargetBuffer writes a new buffer.
   * Returns an unsubscribe function.
   */
  function onTargetBufferChange(listener: TargetBufferListener): () => void {
    targetBufferListeners.add(listener);
    return () => {
      targetBufferListeners.delete(listener);
    };
  }

  // ── Auto-naming helpers ────────────────────────────────────────────────────

  function nextFolderName(): string {
    const n = _countByPrefix("New Folder");
    return `New Folder ${n + 1}`;
  }

  function nextRecordedName(): string {
    const n = _countByPrefix("New Recording");
    return `New Recording ${n + 1}`;
  }

  function nextInstrumentName(instrumentId: MusicInstrumentType): string {
    const label = instrumentId === "piano" ? "Piano" : "Drums";
    const prefix = `New ${label}`;
    const n = _countByPrefix(prefix);
    return `${prefix} ${n + 1}`;
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  function toJSON(): NodeTreeJSON {
    const obj: Record<string, ProjectNode> = {};
    nodesById.value.forEach((node, id) => {
      // Shallow-copy to strip Vue reactive proxy.
      // Explicitly null targetBufferId — it is never persisted (recomputed on load).
      if (isAudioNode(node)) {
        obj[id] = { ...node, targetBufferId: null };
      } else {
        obj[id] = { ...node };
      }
    });
    return {
      nodesById: obj,
      rootIds: [...rootIds.value],
      selectedNodeId: selectedNodeId.value,
    };
  }

  function fromJSON(data: NodeTreeJSON): void {
    nodesById.value.clear();
    for (const [id, node] of Object.entries(data.nodesById)) {
      nodesById.value.set(id, { ...node } as ProjectNode);
    }
    rootIds.value = [...data.rootIds];
    selectedNodeId.value = data.selectedNodeId;
  }

  function clear(): void {
    clearAllBuffers();
    nodesById.value.clear();
    rootIds.value = [];
    selectedNodeId.value = null;
  }

  return {
    // state
    nodesById,
    rootIds,
    selectedNodeId,
    // computed
    selectedNode,
    rootNodes,
    // actions
    addFolderNode,
    addRecordedNode,
    addInstrumentNode,
    removeNode,
    renameNode,
    moveNode,
    selectNode,
    setTargetBuffer,
    onTargetBufferChange,
    // auto-naming
    nextFolderName,
    nextRecordedName,
    nextInstrumentName,
    // serialization
    toJSON,
    fromJSON,
    clear,
  };
});
