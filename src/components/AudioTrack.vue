<script setup lang="ts">
import { inject, ref, onMounted, onBeforeUnmount } from "vue";
import { playerKey, timelineKey } from "../lib/provider-keys";
import AudioSequenceVue from "./AudioSequence.vue";
import type { AudioTrack } from "../lib/audio/track";
import type { AudioPlayer } from "../lib/audio/player";
import type { Timeline } from "../lib/timeline";
import type { AudioSequence } from "../lib/audio/sequence";
import { formatTimeToPixel } from "../lib/util/formatTime";

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
player.addEventListener("change", handleUpdateCursor);
player.addEventListener("seek", handleUpdateCursor);
player.addEventListener("stop", handleUpdateCursor);

timeline.addEventListener("change", () => {
  baseWidth.value = formatTimeToPixel(timeline.ratio, 1);
  handleUpdateCursor();
});

onMounted(() => {
  props.track.addEventListener("change", handleUpdateSequences);
});
onBeforeUnmount(() => {
  props.track.removeEventListener("change", handleUpdateSequences);
});
</script>

<template>
  <div class="h-48">
    <div class="flex relative flex-nowrap h-full">
      <AudioSequenceVue
        v-for="sequence in sequences"
        :base-width="baseWidth"
        :cursor-position="cursorPosition"
        :sequence="sequence"
        :muted="track.muted"
      />
    </div>
  </div>
</template>
