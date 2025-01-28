<script setup lang="ts">
import { inject, ref, onMounted, onBeforeUnmount } from "vue";
import { playerKey, timelineKey } from "../lib/provider-keys";
import type { AudioPlayer } from "../lib/audio/player";
import type { Timeline } from "../lib/timeline";

const player = inject<AudioPlayer>(playerKey);
const timeline = inject<Timeline>(timelineKey);

if (!player) {
  throw new Error("missing player");
} else if (!timeline) {
  throw new Error("missing timeline");
}

const canvasRef = ref<HTMLCanvasElement>();

const handleTimelineUpdate = () => {
  if (!canvasRef.value) return;

  timeline.render(canvasRef.value, player.currentTime);
};

const resizeObserver = new ResizeObserver(handleTimelineUpdate);

player.addEventListener("timeupdate", handleTimelineUpdate);
player.addEventListener("stop", handleTimelineUpdate);

timeline.addEventListener("change", handleTimelineUpdate);

onMounted(() => {
  if (!canvasRef.value) return;

  resizeObserver.observe(canvasRef.value);
  handleTimelineUpdate();
});
onBeforeUnmount(() => {
  if (!canvasRef.value) return;

  resizeObserver.unobserve(canvasRef.value);
});
</script>

<template>
  <div class="w-full h-full border border-primary">
    <canvas ref="canvasRef" class="w-full h-full"></canvas>
  </div>
</template>
