// stores/nodes.ts
// useNodesStore — manages the project node tree (folder/recorded/instrument).
// See: .opencode/context/refactor/03-state-management.md (P2-03)

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { AudioEffect, AudioEffectType } from "../features/effects";
import {
  createBalanceEffect,
  createFadeInEffect,
  createFadeOutEffect,
  createGainEffect,
  createSplitEffect,
  createVolumeEffect,
} from "../features/effects";
import type { FolderNode, InstrumentNode, ProjectNode, RecordedNode } from "../features/nodes";
import { createFolderNode, createInstrumentNode, createRecordedNode } from "../features/nodes";
import type { PlacedNote, TimeSignature } from "../features/nodes/instrument/instrument-node";
import type { MusicInstrumentType, NoteDuration, OctaveRange } from "../lib/music/instruments";

// ── Serialization types ────────────────────────────────────────────────────────

export interface NodeTreeJSON {
  nodesById: Record<string, ProjectNode>;
  rootIds: string[];
  selectedNodeId: string | null;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useNodesStore = defineStore("nodes", () => {
  // ── State ─────────────────────────────────────────────────────────────────
  /** All nodes by id. */
  const nodesById = ref<Map<string, ProjectNode>>(new Map());
  /** Ordered root-level node ids (top-level of the tree). */
  const rootIds = ref<string[]>([]);
  /** Currently selected node id in the node panel. */
  const selectedNodeId = ref<string | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────

  const selectedNode = computed((): ProjectNode | null =>
    selectedNodeId.value ? (nodesById.value.get(selectedNodeId.value) ?? null) : null,
  );

  const rootNodes = computed((): ProjectNode[] =>
    rootIds.value.map((id) => nodesById.value.get(id)!).filter(Boolean),
  );

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Add a node to the map and attach it to parent or root. */
  function _register(node: ProjectNode, parentId?: string): void {
    nodesById.value.set(node.id, node);
    if (parentId) {
      const parent = nodesById.value.get(parentId);
      if (parent && parent.kind === "folder") {
        (parent as FolderNode).childIds.push(node.id);
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
      if (node.kind === "folder") {
        const ci = (node as FolderNode).childIds.indexOf(id);
        if (ci !== -1) {
          (node as FolderNode).childIds.splice(ci, 1);
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
    if (node.kind === "folder") {
      const folder = node as FolderNode;
      // Copy array since we'll be mutating it
      for (const childId of [...folder.childIds]) {
        removeNode(childId);
      }
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
      if (parent && parent.kind === "folder") {
        const folder = parent as FolderNode;
        if (insertIndex !== undefined) {
          folder.childIds.splice(insertIndex, 0, id);
        } else {
          folder.childIds.push(id);
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

  // ── Node content updates ──────────────────────────────────────────────────

  function setRecordedSourceBuffer(id: string, buffer: AudioBuffer | null): void {
    const node = nodesById.value.get(id);
    if (node && node.kind === "recorded") {
      (node as RecordedNode).sourceBuffer = buffer;
    }
  }

  function _setRecordedTargetBuffer(id: string, buffer: AudioBuffer | null): void {
    const node = nodesById.value.get(id);
    if (node && node.kind === "recorded") {
      (node as RecordedNode).targetBuffer = buffer;
    }
  }

  function setRecordingState(id: string, isRecording: boolean): void {
    const node = nodesById.value.get(id);
    if (node && node.kind === "recorded") {
      (node as RecordedNode).isRecording = isRecording;
    }
  }

  function setNodeEffects(id: string, effects: AudioEffect[]): void {
    const node = nodesById.value.get(id);
    if (node && (node.kind === "recorded" || node.kind === "instrument")) {
      (node as RecordedNode | InstrumentNode).effects = effects;
    }
  }

  function addEffect(id: string, type: AudioEffectType): void {
    const node = nodesById.value.get(id);
    if (!node || (node.kind !== "recorded" && node.kind !== "instrument")) return;
    const target = node as RecordedNode | InstrumentNode;

    // Enforce one instance per type
    if (target.effects.some((e) => e.type === type)) return;

    let effect: AudioEffect;
    switch (type) {
      case "gain":
        effect = createGainEffect();
        break;
      case "balance":
        effect = createBalanceEffect();
        break;
      case "fadeIn":
        effect = createFadeInEffect();
        break;
      case "fadeOut":
        effect = createFadeOutEffect();
        break;
      case "split":
        effect = createSplitEffect();
        break;
      case "volume":
        effect = createVolumeEffect();
        break;
    }
    target.effects.push(effect);
  }

  function removeEffect(id: string, effectId: string): void {
    const node = nodesById.value.get(id);
    if (!node || (node.kind !== "recorded" && node.kind !== "instrument")) return;
    const target = node as RecordedNode | InstrumentNode;
    const idx = target.effects.findIndex((e) => e.id === effectId);
    if (idx !== -1) {
      target.effects.splice(idx, 1);
    }
  }

  function reorderEffects(id: string, fromIndex: number, toIndex: number): void {
    const node = nodesById.value.get(id);
    if (!node || (node.kind !== "recorded" && node.kind !== "instrument")) return;
    const target = node as RecordedNode | InstrumentNode;
    if (
      fromIndex < 0 ||
      fromIndex >= target.effects.length ||
      toIndex < 0 ||
      toIndex >= target.effects.length
    )
      return;
    const [moved] = target.effects.splice(fromIndex, 1);
    target.effects.splice(toIndex, 0, moved);
  }

  // ── Instrument node specific ──────────────────────────────────────────────

  function _setInstrumentTargetBuffer(id: string, buffer: AudioBuffer | null): void {
    const node = nodesById.value.get(id);
    if (node && node.kind === "instrument") {
      (node as InstrumentNode).targetBuffer = buffer;
    }
  }

  function setInstrumentNotes(id: string, notes: PlacedNote[]): void {
    const node = nodesById.value.get(id);
    if (node && node.kind === "instrument") {
      (node as InstrumentNode).notes = notes;
    }
  }

  function setInstrumentBpm(id: string, bpm: number): void {
    const node = nodesById.value.get(id);
    if (node && node.kind === "instrument") {
      (node as InstrumentNode).bpm = bpm;
    }
  }

  function setInstrumentTimeSignature(id: string, ts: TimeSignature): void {
    const node = nodesById.value.get(id);
    if (node && node.kind === "instrument") {
      (node as InstrumentNode).timeSignature = { ...ts };
    }
  }

  function setInstrumentSelectedNoteType(id: string, noteType: NoteDuration): void {
    const node = nodesById.value.get(id);
    if (node && node.kind === "instrument") {
      (node as InstrumentNode).selectedNoteType = noteType;
    }
  }

  function setInstrumentOctaveRange(id: string, range: OctaveRange): void {
    const node = nodesById.value.get(id);
    if (node && node.kind === "instrument") {
      (node as InstrumentNode).octaveRange = { ...range };
    }
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
      // Explicitly null targetBuffer — it is never persisted (recomputed on load)
      // and AudioBuffer is not JSON-serialisable.
      const copy: any = { ...node };
      if ("targetBuffer" in copy) copy.targetBuffer = null;
      obj[id] = copy as ProjectNode;
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
    // node content updates
    setRecordedSourceBuffer,
    _setRecordedTargetBuffer,
    setRecordingState,
    setNodeEffects,
    addEffect,
    removeEffect,
    reorderEffects,
    // instrument specific
    _setInstrumentTargetBuffer,
    setInstrumentNotes,
    setInstrumentBpm,
    setInstrumentTimeSignature,
    setInstrumentSelectedNoteType,
    setInstrumentOctaveRange,
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
