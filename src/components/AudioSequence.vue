<script setup lang="ts">
import { inject, onMounted, onBeforeUnmount, ref } from "vue";

import Waveform from "./Waveform.vue";
import {
  audioBufferSequenceType,
  type AudioBufferSequence,
} from "../lib/audio/sequence/AudioBufferSequence";
import { toolsKey } from "../lib/provider-keys";
import type { AudioSequence } from "../lib/audio/sequence";
import type { Tools } from "../lib/audio/tools";

const props = defineProps<{
  baseWidth: number;
  cursorPosition: number;
  sequence: AudioSequence<any>;
  muted: boolean;
}>();

const tools = inject<Tools>(toolsKey);

if (!tools) {
  throw new Error("missing tools");
}

const containerRef = ref<HTMLElement>();

onMounted(() => {
  if (containerRef.value) {
    tools.registerSequence(props.sequence, containerRef.value);
  }
});
onBeforeUnmount(() => {
  tools.unregisterSequence(props.sequence);
});
</script>

<template>
  <div
    ref="containerRef"
    class="absolute top-0 h-full"
    :style="{
      left: `${sequence.time * baseWidth}px`,
      minWidth: `${sequence.playbackDuration * baseWidth}px`,
      maxWidth: `${sequence.playbackDuration * baseWidth}px`,
    }"
  >
    <Waveform
      v-if="sequence.type === audioBufferSequenceType"
      class="border border-dotted border-current/70"
      color="var(--color-base-content)"
      :current-time="cursorPosition - sequence.time * baseWidth"
      :audio-buffer="(sequence as AudioBufferSequence).buffer"
      :disabled="muted"
    />
  </div>
</template>
