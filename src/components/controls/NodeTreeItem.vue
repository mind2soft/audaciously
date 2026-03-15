<script setup lang="ts">
/**
 * NodeTreeItem — single node row in the project tree.
 *
 * Renders:
 *   - FolderNode:     folder icon + name + expand/collapse toggle
 *   - RecordedNode:   microphone icon + name
 *   - InstrumentNode: instrument icon (piano/drum) + name
 *
 * Props
 * ─────
 * node          The ProjectNode to display.
 * selected      True if this node is the currently selected one.
 * expanded      True if this folder is currently expanded (only relevant for FolderNode).
 * depth         Nesting depth for indentation. Default: 0.
 *
 * Emits
 * ─────
 * select(id)         Node was clicked / selected.
 * toggle(id)         Folder expand/collapse was toggled.
 * dragstart(id)      Drag started on this node.
 */

import type { ProjectNode } from "../../features/nodes/node";

const props = withDefaults(
  defineProps<{
    node: ProjectNode;
    selected?: boolean;
    expanded?: boolean;
    depth?: number;
  }>(),
  {
    selected: false,
    expanded: false,
    depth: 0,
  },
);

const emit = defineEmits<{
  select: [id: string];
  toggle: [id: string];
  dragstart: [id: string];
}>();

const onSelect = () => emit("select", props.node.id);
const onToggle = () => emit("toggle", props.node.id);
const onDragstart = (evt: DragEvent) => {
  evt.dataTransfer?.setData("text/plain", props.node.id);
  emit("dragstart", props.node.id);
};

/** Keyboard handler for the row element.
 *  Enter / Space  → select
 *  ArrowRight     → expand folder (if collapsed)
 *  ArrowLeft      → collapse folder (if expanded)
 */
const onKeydown = (evt: KeyboardEvent) => {
  if (evt.key === "Enter" || evt.key === " ") {
    evt.preventDefault();
    onSelect();
  }
  if (props.node.kind === "folder") {
    if (evt.key === "ArrowRight" && !props.expanded) {
      evt.preventDefault();
      onToggle();
    } else if (evt.key === "ArrowLeft" && props.expanded) {
      evt.preventDefault();
      onToggle();
    }
  }
};

/** Icon MDI class per node kind / instrument type. */
const iconClass = (): string => {
  if (props.node.kind === "folder") return "mdi--folder-outline";
  if (props.node.kind === "recorded") return "mdi--microphone-outline";
  // instrument
  const inst = (
    props.node as Extract<typeof props.node, { kind: "instrument" }>
  ).instrumentType;
  if (inst === "drums") return "mdi--drum";
  return "mdi--piano";
};
</script>

<template>
  <div
    role="treeitem"
    :tabindex="0"
    :aria-selected="selected"
    :aria-expanded="node.kind === 'folder' ? expanded : undefined"
    class="flex items-center gap-1 h-8 px-1 rounded cursor-pointer select-none group"
    :class="{
      'bg-primary/20 text-primary': selected,
      'hover:bg-base-300/50': !selected,
    }"
    :style="{ paddingLeft: `${4 + depth * 16}px` }"
    :draggable="node.kind !== 'folder'"
    @click="onSelect"
    @dragstart="onDragstart"
    @keydown="onKeydown"
  >
    <!-- Folder toggle arrow -->
    <button
      v-if="node.kind === 'folder'"
      class="btn btn-ghost btn-xs p-0 min-h-0 h-5 w-5 shrink-0"
      @click.stop="onToggle"
      :aria-label="expanded ? 'Collapse folder' : 'Expand folder'"
    >
      <i
        class="iconify size-4 transition-transform"
        :class="expanded ? 'mdi--chevron-down' : 'mdi--chevron-right'"
      />
    </button>
    <!-- Spacer to align non-folder items when folders exist -->
    <span v-else class="w-5 shrink-0" />

    <!-- Node icon -->
    <i class="iconify size-4 shrink-0 opacity-70" :class="iconClass()" />

    <!-- Node name -->
    <span class="flex-1 truncate text-sm leading-none">{{ node.name }}</span>
  </div>
</template>
