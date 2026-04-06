<script setup lang="ts">
import { computed } from "vue";
import { useRecordedAudioNode } from "../../../composables/useRecordedAudioNode";
import type { AudioEffect } from "../../../features/effects";
import EffectsPipeline from "../../controls/effects/EffectsPipeline.vue";

const props = defineProps<{ nodeId: string }>();
const recordedNode = useRecordedAudioNode(props.nodeId);

const bufferDuration = computed(() => recordedNode.sourceBuffer.value?.duration);

function onUpdateEffects(effects: AudioEffect[]): void {
  recordedNode.setEffects(effects);
}
</script>

<template>
  <div class="flex-1 min-h-0 overflow-hidden">
    <EffectsPipeline
      :key="props.nodeId"
      :effects="recordedNode.effects.value"
      :maxDuration="bufferDuration"
      sourceLabel="Recorded"
      sourceIcon="mdi--microphone-outline"
      @update:effects="onUpdateEffects"
    >
      <template #source-properties>
        <div class="px-3 py-3 text-xs text-base-content/60">
          <p class="font-medium text-base-content/70 mb-1">
            Recorded Audio Source
          </p>
          <p v-if="recordedNode.sourceBuffer.value" class="text-base-content/40">
            Duration: {{ recordedNode.sourceBuffer.value.duration.toFixed(2) }}s ·
            {{ recordedNode.sourceBuffer.value.numberOfChannels }}ch ·
            {{ recordedNode.sourceBuffer.value.sampleRate }} Hz
          </p>
          <p v-else class="text-base-content/30 italic">
            No audio recorded yet
          </p>
        </div>
      </template>
    </EffectsPipeline>
  </div>
</template>
