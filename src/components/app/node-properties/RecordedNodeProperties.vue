<script setup lang="ts">
import { computed } from "vue";
import { useNodesStore } from "../../../stores/nodes";
import EffectsPanel from "../../controls/EffectsPanel.vue";
import type { RecordedNode } from "../../../features/nodes";
import type { AudioEffect } from "../../../features/effects";

const props = defineProps<{ node: RecordedNode }>();
const nodes = useNodesStore();

const bufferDuration = computed(() => props.node.buffer?.duration);

function onUpdateEffects(effects: AudioEffect[]): void {
  nodes.setNodeEffects(props.node.id, effects);
}
</script>

<template>
  <div class="flex-1 overflow-y-auto min-h-0">
    <EffectsPanel
      :effects="node.effects"
      :maxDuration="bufferDuration"
      @update:effects="onUpdateEffects"
    />
  </div>
</template>
