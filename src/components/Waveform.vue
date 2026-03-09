<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
  watchEffect,
} from "vue";
import { createWaveformProcessor } from "../lib/audio/waveform";

const props = defineProps<{
  color: string;
  currentTime: number;
  audioBuffer: AudioBuffer;
  disabled?: boolean;
  /**
   * The rendered pixel width of the sequence container, computed from
   * `sequence.playbackDuration * baseWidth` by the parent.  Passed in as a
   * prop so `updatePath` never has to call `getBoundingClientRect()` for the
   * width axis — that call returns 0 when the element is translated off-screen
   * by the parent column's scroll offset, which would produce a blank waveform.
   */
  pixelWidth: number;
}>();

const waveform = createWaveformProcessor();

const id = useId();
const svgRef = ref<SVGSVGElement>();
const path = ref<string>();
const position = ref<number>(0);

const updatePosition = () => {
  // Use the prop-driven pixel width so the playhead position is correct even
  // when the element is off-screen (where clientWidth would return 0).
  const width = props.pixelWidth || svgRef.value?.clientWidth || 1;

  position.value = Math.min(Math.max(props.currentTime / width, 0), 1) * 100;
};

const updatePath = () => {
  if (!svgRef.value || !props.audioBuffer?.length || !props.pixelWidth) {
    return undefined;
  }

  // Use the prop for width — getBoundingClientRect().width returns 0 when the
  // element is translated off-screen, which would silently skip path generation.
  // Height is read from the DOM because it is driven by track expand/collapse,
  // not by the zoom ratio, and is never affected by horizontal scroll offset.
  const height = svgRef.value.getBoundingClientRect().height;
  const width = props.pixelWidth;

  updatePosition();

  // path.value = "";
  waveform
    .getLinearPath(props.audioBuffer, {
      channel: 0,
      samples: width / 3,
      type: "steps",
      top: 0,
      height,
      width,
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
      },
    );
};

const resizeObserver = new ResizeObserver(updatePath);

watchEffect(() => {
  updatePosition();
});

watch(
  () => props.audioBuffer,
  () => {
    updatePath();
  },
);

// Re-draw whenever the zoom ratio changes (pixelWidth is derived from
// `sequence.playbackDuration * baseWidth` and updated by the parent on every
// timeline "change" event).
watch(
  () => props.pixelWidth,
  () => {
    updatePath();
  },
  { flush: "post" },
);

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
