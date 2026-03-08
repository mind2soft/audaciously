<script setup lang="ts">
import { inject, onMounted, onBeforeUnmount, ref } from "vue";

import Waveform from "./Waveform.vue";
import { toolsKey } from "../lib/provider-keys";
import type { BufferedAudioSequence } from "../lib/audio/sequence";
import type { Tools } from "../lib/audio/tools";

const props = defineProps<{
  baseWidth: number;
  cursorPosition: number;
  sequence: BufferedAudioSequence<any>;
  muted: boolean;
}>();

const tools = inject<Tools>(toolsKey);

if (!tools) {
  throw new Error("missing tools");
}

const containerRef = ref<HTMLElement>();

/**
 * Mirror of `sequence.buffer` kept in a Vue ref so the template re-renders
 * whenever the buffer is replaced (e.g. when a live recording preview chunk
 * arrives).  We update it on every `change` event from the sequence because
 * the sequence object itself is not a Vue reactive proxy and Vue cannot
 * track its internal property mutations.
 */
const sequenceBuffer = ref<AudioBuffer>(props.sequence.buffer);

const handleSequenceChange = () => {
  sequenceBuffer.value = props.sequence.buffer;
};

onMounted(() => {
  if (containerRef.value) {
    tools.registerSequence(props.sequence, containerRef.value);
  }
  props.sequence.addEventListener("change", handleSequenceChange);
});
onBeforeUnmount(() => {
  tools.unregisterSequence(props.sequence);
  props.sequence.removeEventListener("change", handleSequenceChange);
});
</script>

<template>
  <div
    ref="containerRef"
    class="absolute top-0 h-full"
    :style="{
      left: `${sequence.time * baseWidth}px`,
      width: `${sequence.playbackDuration * baseWidth}px`,
    }"
  >
    <!--
      Show a waveform for any sequence that has real audio data (length > 1).
      This covers both finished AudioBufferSequences and live RecordingSequences
      whose preview buffer has been populated by the first decoded chunk.
      DummySequence returns a 1-sample sentinel, so it is correctly excluded.
    -->
    <Waveform
      v-if="sequenceBuffer.length > 1"
      class="border border-base-content/20 bg-base-content/5"
      color="var(--color-base-content)"
      :current-time="cursorPosition - sequence.time * baseWidth"
      :audio-buffer="sequenceBuffer"
      :pixel-width="sequence.playbackDuration * baseWidth"
      :disabled="muted"
    />
  </div>
</template>
