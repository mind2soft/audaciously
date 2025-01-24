<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from "vue";
import { playerKey, timelineKey } from "../lib/provider-keys";
import TimelineView from "./Timeline.vue";
import AudioTrackView from "./AudioTrack.vue";

import type { AudioPlayer } from "../lib/audio/player";
import type { AudioTrack } from "../lib/audio/track";
import { formatPixelToTime, type TImeline } from "../lib/timeline";

type TrackDrag =
  | {
      isDragging: true;
      startClientX: number;
      startOffsetTime: number;
    }
  | {
      isDragging: false;
    };

const player = inject<AudioPlayer>(playerKey);
const timeline = inject<TImeline>(timelineKey);

if (!player) {
  throw new Error("missing player");
} else if (!timeline) {
  throw new Error("missing timeline");
}

const tracks = ref<AudioTrack[]>([...player.getTracks()]);
const trackDrag = ref<TrackDrag>({
  isDragging: false,
});

const handleMouseDown = (evt: MouseEvent) => {
  document.documentElement.style.userSelect = "none";
  trackDrag.value = {
    isDragging: true,
    startClientX: evt.clientX,
    startOffsetTime: timeline.offsetTime,
  };
};
const handleMouseUp = () => {
  document.documentElement.style.userSelect = "";
  trackDrag.value = { isDragging: false };
};
const handleMouseMove = (evt: MouseEvent) => {
  if (!trackDrag.value.isDragging) return;

  const clientDelta = evt.clientX - trackDrag.value.startClientX;
  const offsetDelta = -formatPixelToTime(timeline.ratio, clientDelta);

  timeline.offsetTime = trackDrag.value.startOffsetTime + offsetDelta;
};

player.addEventListener("change", () => {
  tracks.value = [...player.getTracks()];
});

onMounted(() => {
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
});
onUnmounted(() => {
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
});
</script>

<template>
  <div class="grid grid-cols-[96px_auto] grid-rows-[32px-auto]">
    <TimelineView />
    <AudioTrackView
      v-for="track in tracks"
      :track="track"
      v-on:mousedown="handleMouseDown"
    />
  </div>
</template>
