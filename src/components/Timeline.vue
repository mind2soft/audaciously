<script setup lang="ts">
import { inject, ref } from "vue";
import { timelineKey } from "../lib/provider-keys";
import type { Timeline } from "../lib/timeline";

const timeline = inject<Timeline>(timelineKey);

if (!timeline) {
  throw new Error("missing timeline");
}

const canvasRef = ref<HTMLCanvasElement>();

timeline.addEventListener("change", () => {
  if (!canvasRef.value) return;

  timeline.render(canvasRef.value);
});
</script>

<template>
  <div class="w-full h-12 border border-primary">
    <canvas
      ref="canvasRef"
      class="w-full h-full border border-primary"
    ></canvas>
  </div>
</template>
