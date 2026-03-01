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
  isSelected: boolean;
}>();

const EXPANDED_HEIGHT = 192; // px  (h-48)
const COLLAPSED_HEIGHT = 32;  // px  (h-8)

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

const handleTimelineChange = () => {
  baseWidth.value = formatTimeToPixel(timeline.ratio, 1);
  handleUpdateCursor();
};

player.addEventListener("timeupdate", handleUpdateCursor);
player.addEventListener("change", handleUpdateCursor);
player.addEventListener("seek", handleUpdateCursor);
player.addEventListener("stop", handleUpdateCursor);

timeline.addEventListener("change", handleTimelineChange);

onMounted(() => {
  props.track.addEventListener("change", handleUpdateSequences);
});
onBeforeUnmount(() => {
  props.track.removeEventListener("change", handleUpdateSequences);

  player.removeEventListener("timeupdate", handleUpdateCursor);
  player.removeEventListener("change", handleUpdateCursor);
  player.removeEventListener("seek", handleUpdateCursor);
  player.removeEventListener("stop", handleUpdateCursor);

  timeline.removeEventListener("change", handleTimelineChange);
});
</script>

<template>
  <div
    class="overflow-hidden border-b border-base-300/60 transition-[height] duration-200 ease-in-out"
    :style="{ height: `${isSelected ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT}px` }"
  >
    <div class="flex relative flex-nowrap h-full">
      <AudioSequenceVue
        v-for="sequence in sequences"
        :key="sequence.id"
        :base-width="baseWidth"
        :cursor-position="cursorPosition"
        :sequence="sequence"
        :muted="track.muted"
      />
    </div>
  </div>
</template>
