<script setup lang="ts">
import {
  inject,
  ref,
  onMounted,
  onBeforeUpdate,
  onBeforeUnmount,
  onUpdated,
} from "vue";
import { playerKey, timelineKey } from "../lib/provider-keys";
import Waveform from "./Waveform.vue";
import type { AudioTrack } from "../lib/audio/track";
import type { AudioPlayer } from "../lib/audio/player";
import { formatTimeToPixel, type Timeline } from "../lib/timeline";
import {
  audioBufferSequenceType,
  type AudioBufferSequence,
} from "../lib/audio/sequence/AudioBufferSequence";
import type { AudioSequence } from "../lib/audio/sequence";

const props = defineProps<{
  track: AudioTrack;
}>();

const player = inject<AudioPlayer>(playerKey);
const timeline = inject<Timeline>(timelineKey);

if (!player) {
  throw new Error("missing player");
} else if (!timeline) {
  throw new Error("missing timeline");
}

const sequences = ref<AudioSequence<any>[]>(
  Array.from(props.track.getSequences())
);
const trackOffset = ref<number>(0);
const baseWidth = ref<number>(formatTimeToPixel(timeline.ratio, 1));
const cursorPosition = ref<number>(
  formatTimeToPixel(timeline.ratio, player.currentTime)
);

const handleUpdateSequences = () => {
  sequences.value = Array.from(props.track.getSequences());
};

const handleUpdateCursor = () => {
  cursorPosition.value = formatTimeToPixel(timeline.ratio, player.currentTime);
};

player.addEventListener("timeupdate", handleUpdateCursor);
player.addEventListener("stop", handleUpdateCursor);

timeline.addEventListener("change", () => {
  baseWidth.value = formatTimeToPixel(timeline.ratio, 1);
  // trackOffset.value = -formatTimeToPixel(timeline.ratio, timeline.offsetTime);
  trackOffset.value = 0;
  handleUpdateCursor();
});

onMounted(() => {
  props.track.addEventListener("change", handleUpdateSequences);
});

onBeforeUpdate(() => {
  props.track.removeEventListener("change", handleUpdateSequences);
});

onUpdated(() => {
  props.track.addEventListener("change", handleUpdateSequences);
});

onBeforeUnmount(() => {
  props.track.removeEventListener("change", handleUpdateSequences);
});
</script>

<template>
  <div class="h-48">
    <div
      class="flex relative flex-nowrap h-full"
      :style="{
        left: `${trackOffset}px`,
      }"
    >
      <div
        v-for="sequence in sequences"
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
          :current-time="cursorPosition - sequence.time * baseWidth"
          :audio-buffer="(sequence as AudioBufferSequence).buffer"
          :disabled="track.muted"
        />
      </div>
    </div>
  </div>
</template>
