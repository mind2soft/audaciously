<script setup lang="ts">
import { inject, ref, onMounted, onBeforeUnmount } from "vue";
import { playerKey, timelineKey } from "../lib/provider-keys";
import type { AudioPlayer } from "../lib/audio/player";
import { formatPixelToTime, type Timeline } from "../lib/timeline";

const player = inject<AudioPlayer>(playerKey);
const timeline = inject<Timeline>(timelineKey);

if (!player) {
  throw new Error("missing player");
} else if (!timeline) {
  throw new Error("missing timeline");
}

const canvasRef = ref<HTMLCanvasElement>();
const pointerCapture = ref<boolean>(false);
const pointerVisible = ref<boolean>(false);
const pointerPosition = ref<number>(0);

const handleTimelineUpdate = () => {
  if (!canvasRef.value) return;

  timeline.render(canvasRef.value, player.currentTime);
};
const handlePointerUpdate = (evt: MouseEvent) => {
  const left = (evt.currentTarget as HTMLDivElement).getBoundingClientRect()
    .left;
  pointerPosition.value = evt.clientX - left; // formatPixelToTime(timeline.ratio, x);
};
const handlePointerVisible = (evt: MouseEvent) => {
  handlePointerUpdate(evt);
  pointerVisible.value = true;
};
const handlePointerHide = () => {
  pointerVisible.value = false;
};
const handlePointerCapture = (evt: MouseEvent) => {
  evt.preventDefault();
  evt.stopPropagation();

  pointerCapture.value = true;
  handlePlaybackSeek(evt);
};
const handlePointerRelease = () => {
  pointerCapture.value = false;
};
const handlePlaybackSeek = (evt: MouseEvent) => {
  if (canvasRef.value && pointerCapture.value) {
    evt.preventDefault();
    evt.stopPropagation();

    const left = evt.clientX - canvasRef.value.getBoundingClientRect().left;

    player.currentTime =
      formatPixelToTime(timeline.ratio, left) + timeline.offsetTime;
  }
};

const resizeObserver = new ResizeObserver(handleTimelineUpdate);

player.addEventListener("seek", handleTimelineUpdate);
player.addEventListener("timeupdate", handleTimelineUpdate);
player.addEventListener("stop", handleTimelineUpdate);
player.addEventListener("change", handleTimelineUpdate);

timeline.addEventListener("change", handleTimelineUpdate);

onMounted(() => {
  if (!canvasRef.value) return;

  resizeObserver.observe(canvasRef.value);
  handleTimelineUpdate();

  document.addEventListener("mouseup", handlePointerRelease);
  document.addEventListener("mousemove", handlePlaybackSeek);
});
onBeforeUnmount(() => {
  if (canvasRef.value) {
    resizeObserver.unobserve(canvasRef.value);
  }

  document.removeEventListener("mouseup", handlePointerRelease);
  document.removeEventListener("mousemove", handlePlaybackSeek);
});
</script>

<template>
  <div
    class="relative w-full h-full"
    v-on:mousemove="handlePointerUpdate"
    v-on:mouseenter="handlePointerVisible"
    v-on:mouseleave="handlePointerHide"
    v-on:mousedown="handlePointerCapture"
    v-on:mouseup="handlePointerRelease"
  >
    <canvas ref="canvasRef" class="w-full h-full"></canvas>
    <div
      class="absolute top-0 bottom-0 left-3 w-4 border-l border-dotted border-l-accent"
      :style="{
        display: pointerVisible ? 'block' : 'none',
        left: `${pointerPosition}px`,
      }"
    ></div>
  </div>
</template>
