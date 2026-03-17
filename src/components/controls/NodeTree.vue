<script setup lang="ts">
/**
 * NodeTree — file-system-like project node tree.
 *
 * Renders folders (expand/collapse), recorded nodes (mic icon), and
 * instrument nodes (piano/drum icon). Single-level nesting only — folders
 * cannot contain folders.
 *
 * Props
 * ─────
 * nodes         Flat array of ALL project nodes.
 * nodeMap       Map<id, ProjectNode> for fast child lookups.
 * selectedId    Currently selected node id (or null).
 *
 * Emits
 * ─────
 * select(id)    User clicked a node.
 * dragstart(id) User started dragging a node (for drop-to-track).
 */

import { ref } from "vue";
import type { ProjectNode } from "../../features/nodes/node";
import NodeTreeItem from "./NodeTreeItem.vue";

const props = defineProps<{
  nodes: ProjectNode[];
  nodeMap: Map<string, ProjectNode>;
  selectedId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string];
  dragstart: [id: string];
}>();

/** Set of currently expanded folder IDs. */
const expandedIds = ref<Set<string>>(new Set());

const onToggle = (id: string) => {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id);
  } else {
    expandedIds.value.add(id);
  }
};

/** Top-level nodes — those not referenced as a child of any folder. */
const childIdSet = (): Set<string> => {
  const set = new Set<string>();
  for (const node of props.nodes) {
    if (node.kind === "folder") {
      for (const childId of node.childIds) set.add(childId);
    }
  }
  return set;
};

const rootNodes = (): ProjectNode[] => {
  const children = childIdSet();
  return props.nodes.filter((n) => !children.has(n.id));
};

const childrenOf = (folderId: string): ProjectNode[] => {
  const folder = props.nodeMap.get(folderId);
  if (!folder || folder.kind !== "folder") return [];
  return folder.childIds
    .map((id) => props.nodeMap.get(id))
    .filter((n): n is ProjectNode => n !== undefined);
};
</script>

<template>
  <div class="flex flex-col w-full">
    <template v-for="node in rootNodes()" :key="node.id">
      <!-- Folder node row -->
      <NodeTreeItem
        :node="node"
        :selected="selectedId === node.id"
        :expanded="expandedIds.has(node.id)"
        :depth="0"
        @select="emit('select', $event)"
        @toggle="onToggle"
        @dragstart="emit('dragstart', $event)"
      />

      <!-- Folder children (shown when expanded) -->
      <template v-if="node.kind === 'folder' && expandedIds.has(node.id)">
        <NodeTreeItem
          v-for="child in childrenOf(node.id)"
          :key="child.id"
          :node="child"
          :selected="selectedId === child.id"
          :expanded="false"
          :depth="1"
          @select="emit('select', $event)"
          @toggle="() => {}"
          @dragstart="emit('dragstart', $event)"
        />
      </template>
    </template>
  </div>
</template>
