<script setup lang="ts">
import { computed } from "vue";
import type { AudioEffect } from "../../../features/effects";
import type { RecordedNode } from "../../../features/nodes";
import { useNodesStore } from "../../../stores/nodes";
import { usePlayerStore } from "../../../stores/player";
import EffectsPipeline from "../../controls/EffectsPipeline.vue";

const props = defineProps<{ node: RecordedNode }>();
const nodes = useNodesStore();
const player = usePlayerStore();

const bufferDuration = computed(() => props.node.sourceBuffer?.duration);

function onUpdateEffects(effects: AudioEffect[]): void {
  nodes.setNodeEffects(props.node.id, effects);
}
</script>

<template>
  <div class="flex-1 min-h-0 overflow-hidden">
    <EffectsPipeline
      :key="node.id"
      :effects="node.effects"
      :maxDuration="bufferDuration"
      :currentTime="player.currentTime"
      sourceLabel="Recorded"
      sourceIcon="mdi--microphone-outline"
      @update:effects="onUpdateEffects"
    >
      <template #source-properties>
        <div class="px-3 py-3 text-xs text-base-content/60">
          <p class="font-medium text-base-content/70 mb-1">
            Recorded Audio Source
          </p>
          <p v-if="node.sourceBuffer" class="text-base-content/40">
            Duration: {{ node.sourceBuffer.duration.toFixed(2) }}s ·
            {{ node.sourceBuffer.numberOfChannels }}ch ·
            {{ node.sourceBuffer.sampleRate }} Hz
          </p>
          <p v-else class="text-base-content/30 italic">
            No audio recorded yet
          </p>
        </div>
      </template>
    </EffectsPipeline>
  </div>
</template>
