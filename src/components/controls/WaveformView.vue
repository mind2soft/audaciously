<script setup lang="ts">
/**
 * WaveformView — seekable audio buffer peak graph.
 *
 * Replaces Waveform.vue. Adds click/drag seek support.
 *
 * Props
 * ─────
 * buffer       AudioBuffer to visualise.
 * currentTime  Current playback position in seconds.
 *
 * Emits
 * ─────
 * seek(time)   User clicked or dragged to seek to a time position.
 */

import {
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
  watchEffect,
} from "vue";
import { createWaveformProcessor } from "../../lib/audio/waveform";

const props = defineProps<{
  buffer: AudioBuffer;
  currentTime: number;
}>();

const emit = defineEmits<{
  seek: [time: number];
}>();

const waveform = createWaveformProcessor();

const id = useId();
const svgRef = ref<SVGSVGElement>();
const path = ref<string>();
const positionPct = ref<number>(0);

const isSeeking = ref(false);

// ── Playback cursor ─────────────────────────────────────────────────────────

const updatePosition = () => {
  const duration = props.buffer?.duration || 1;
  positionPct.value = Math.min(Math.max(props.currentTime / duration, 0), 1) * 100;
};

watchEffect(updatePosition);

// ── Waveform path ───────────────────────────────────────────────────────────

const updatePath = () => {
  if (!svgRef.value || !props.buffer?.length) return;
  const rect = svgRef.value.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  updatePosition();

  waveform
    .getLinearPath(props.buffer, {
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
      (nextPath) => { path.value = nextPath; },
      () => {},
    );
};

const resizeObserver = new ResizeObserver(updatePath);

watch(() => props.buffer, updatePath);

onMounted(() => {
  if (!svgRef.value) return;
  resizeObserver.observe(svgRef.value);
  updatePath();
});

onBeforeUnmount(() => {
  if (svgRef.value) resizeObserver.unobserve(svgRef.value);
});

// ── Hover ghost cursor ──────────────────────────────────────────────────────

/** X position as a [0, 100] percentage while the pointer is inside the SVG. */
const hoverPct = ref<number | null>(null);
const hoverTime = ref<number>(0);

const formatTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const ss = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${ss}`;
};

const onHoverMove = (evt: MouseEvent) => {
  if (!svgRef.value) return;
  const rect = svgRef.value.getBoundingClientRect();
  const pct = Math.min(Math.max((evt.clientX - rect.left) / rect.width, 0), 1);
  hoverPct.value = pct * 100;
  hoverTime.value = pct * (props.buffer?.duration ?? 0);
};

const onHoverLeave = () => {
  hoverPct.value = null;
};

const clientXToTime = (clientX: number): number => {
  if (!svgRef.value) return 0;
  const rect = svgRef.value.getBoundingClientRect();
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  return ratio * (props.buffer?.duration ?? 0);
};

// ── Seek interaction ────────────────────────────────────────────────────────

const onMousedown = (evt: MouseEvent) => {
  isSeeking.value = true;
  emit("seek", clientXToTime(evt.clientX));
  document.addEventListener("mousemove", onDocMousemove);
  document.addEventListener("mouseup", onDocMouseup);
};

const onDocMousemove = (evt: MouseEvent) => {
  if (isSeeking.value) emit("seek", clientXToTime(evt.clientX));
};

const onDocMouseup = () => {
  isSeeking.value = false;
  document.removeEventListener("mousemove", onDocMousemove);
  document.removeEventListener("mouseup", onDocMouseup);
};
</script>

<template>
  <svg
    ref="svgRef"
    class="w-full h-full cursor-pointer"
    @mousedown="onMousedown"
    @mousemove="onHoverMove"
    @mouseleave="onHoverLeave"
  >
    <defs>
      <linearGradient
        :id="`wfGrad_${id}`"
        x1="0"
        y1="0"
        x2="1"
        y2="0"
        gradientUnits="objectBoundingBox"
      >
        <!-- Played portion: accent colour -->
        <stop offset="0%" stop-color="var(--color-accent)" />
        <stop :offset="`${positionPct}%`" stop-color="var(--color-accent)" />
        <!-- Unplayed portion: muted -->
        <stop :offset="`${positionPct}%`" stop-color="var(--color-base-content)" stop-opacity="0.3" />
        <stop offset="100%" stop-color="var(--color-base-content)" stop-opacity="0.3" />
      </linearGradient>
    </defs>
    <path
      class="stroke-1 fill-none"
      :stroke="`url(#wfGrad_${id})`"
      :d="path"
    />
    <!-- Playhead cursor line -->
    <line
      :x1="`${positionPct}%`"
      y1="0"
      :x2="`${positionPct}%`"
      y2="100%"
      stroke="var(--color-accent)"
      stroke-width="1.5"
      stroke-dasharray="3 2"
      opacity="0.8"
    />
    <!-- Hover ghost cursor line + time label (hidden while actively seeking) -->
    <template v-if="hoverPct !== null && !isSeeking">
      <line
        :x1="`${hoverPct}%`"
        y1="0"
        :x2="`${hoverPct}%`"
        y2="100%"
        stroke="var(--color-base-content)"
        stroke-opacity="0.35"
        stroke-width="1"
        stroke-dasharray="3 2"
      />
      <text
        :x="`${hoverPct}%`"
        y="12"
        fill="var(--color-base-content)"
        fill-opacity="0.65"
        font-size="9"
        text-anchor="middle"
        pointer-events="none"
      >{{ formatTime(hoverTime) }}</text>
    </template>
  </svg>
</template>
