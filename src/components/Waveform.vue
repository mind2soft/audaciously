<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watchEffect } from "vue";
import { createWaveformProcessor } from "../lib/audio/waveform";

const props = defineProps<{
  color: string;
  currentTime: number;
  audioBuffer: AudioBuffer;
  disabled?: boolean;
}>();

const waveform = createWaveformProcessor();

const id = useId();
const svgRef = ref<SVGSVGElement>();
const path = ref<string>();
const position = ref<number>(0);

const updatePosition = () => {
  const width = svgRef.value?.clientWidth ?? 1;

  position.value = Math.min(Math.max(props.currentTime / width, 0), 1) * 100;
};

const updatePath = () => {
  if (!svgRef.value || !props.audioBuffer?.length) {
    return undefined;
  }

  const rect = svgRef.value.getBoundingClientRect();

  updatePosition();

  // path.value = "";
  waveform
    .getLinearPath(props.audioBuffer, {
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

watchEffect(() => {
  updatePosition();
});

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
  <svg
    ref="svgRef"
    class="w-full h-full"
    :class="{
      'transition-opacity': true,
      'opacity-40': disabled,
    }"
  >
    <defs>
      <linearGradient
        :id="`svgGrad_${id}`"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
        gradientUnits="objectBoundingBox"
      >
        <stop offset="0%" stop-color="var(--color-accent)" />
        <stop
          ref="svgStopEnd"
          :offset="`${position}%`"
          stop-color="var(--color-accent)"
        />
        <stop ref="svgStopStart" :offset="`${position}%`" :stop-color="color" />
        <stop offset="100%" :stop-color="color" />
      </linearGradient>
    </defs>
    <path
      class="stroke-1 fill-none"
      :stroke="`url(#svgGrad_${id})`"
      :d="path"
    />
  </svg>
</template>
