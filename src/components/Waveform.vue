<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from "vue";
import { createWaveformProcessor } from "../lib/audio/waveform";

const { audioBuffer } = defineProps<{
  audioBuffer: AudioBuffer;
}>();

const waveform = createWaveformProcessor();

const id = useId();
const svgRef = ref<SVGSVGElement>();
const path = ref<string>();

const updatePath = () => {
  if (!svgRef.value || !audioBuffer || !audioBuffer.length) {
    return undefined;
  }

  const rect = svgRef.value.getBoundingClientRect();

  // path.value = "";
  waveform
    .getLinearPath(audioBuffer, {
      channel: 0,
      samples: rect.width / 3,
      type: "steps",
      top: 0,
      height: rect.height,
      width: rect.width,
      paths: [
        { d: "L", sx: 0, sy: 0, ex: 50, ey: 100 },
        { d: "L", sx: 50, sy: 100, ex: 100, ey: 0 },
      ],
      animation: false,
      normalize: false,
    })
    .then(
      (nextPath) => {
        path.value = nextPath;
      },
      () => {
        // path.value = "";
      }
    );
};

const resizeObserver = new ResizeObserver(updatePath);

onMounted(() => {
  if (!svgRef.value) return;

  resizeObserver.observe(svgRef.value);
  updatePath();
});
onBeforeUnmount(() => {
  if (!svgRef.value) return;

  resizeObserver.unobserve(svgRef.value);
});
</script>

<template>
  <svg ref="svgRef" class="w-full h-full">
    <defs>
      <linearGradient
        :id="`svgGrad_${id}`"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
        gradientUnits="objectBoundingBox"
      >
        <stop offset="0%" stop-color="blue" />
        <stop ref="svgStopEnd" offset="0%" stop-color="blue" />
        <stop ref="svgStopStart" offset="0%" stop-color="yellow" />
        <stop offset="100%" stop-color="yellow" />
      </linearGradient>
    </defs>
    <path
      class="stroke-1 fill-none"
      :stroke="`url(#svgGrad_${id})`"
      :d="path"
    />
  </svg>
</template>
