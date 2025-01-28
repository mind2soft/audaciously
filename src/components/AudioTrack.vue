<script setup lang="ts">
import { inject, ref } from "vue";
import { playerKey, timelineKey } from "../lib/provider-keys";
import Waveform from "./Waveform.vue";
import type { AudioTrack } from "../lib/audio/track";
import type { AudioPlayer } from "../lib/audio/player";
import { formatTimeToPixel, type Timeline } from "../lib/timeline";

defineProps<{
  track: AudioTrack;
}>();

const player = inject<AudioPlayer>(playerKey);
const timeline = inject<Timeline>(timelineKey);

if (!player) {
  throw new Error("missing player");
} else if (!timeline) {
  throw new Error("missing timeline");
}

const trackOffset = ref<number>(0);
const baseWidth = ref<number>(formatTimeToPixel(timeline.ratio, 1));
const cursorPosition = ref<number>(
  formatTimeToPixel(timeline.ratio, player.currentTime)
);

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
        v-for="sequence in track.getSequences()"
        class="absolute top-0 h-full"
        :style="{
          left: `${sequence.time * baseWidth}px`,
          minWidth: `${sequence.buffer.duration * baseWidth}px`,
          maxWidth: `${sequence.buffer.duration * baseWidth}px`,
        }"
      >
        <Waveform
          class="border border-primary"
          :current-time="cursorPosition - sequence.time * baseWidth"
          :audio-buffer="sequence.buffer"
        />
      </div>
    </div>
  </div>
</template>
