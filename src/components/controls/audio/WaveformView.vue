<script setup lang="ts">
/**
 * WaveformView — seekable audio buffer peak graph.
 *
 * Replaces Waveform.vue. Adds click/drag seek support, zoom, and scroll.
 *
 * Props
 * ─────
 * buffer            AudioBuffer to visualise.
 * currentTime       Current playback position in seconds.
 * ratio             Zoom ratio (1 = full buffer, 4 = 4× zoom). Default 1.
 * offsetTime        Scroll offset in seconds (start of visible window). Default 0.
 * zoomSelectActive  When true, mousedown starts a rubber-band zoom-select drag
 *                   instead of seeking.
 *
 * Emits
 * ─────
 * seek(time)              User clicked or dragged to seek to a time position.
 * zoom-select(start, end) User completed a rubber-band drag while in zoom-select
 *                         mode; start/end are times in seconds.
 */

import { computed, inject, onBeforeUnmount, onMounted, ref, useId, watch, watchEffect } from "vue";
import { createWaveformProcessor } from "../../../lib/audio/waveform";
import { scrollableTimelineKey } from "../../../lib/scrollable-timeline";

const props = defineProps<{
  buffer: AudioBuffer;
  currentTime: number;
  ratio?: number;
  offsetTime?: number;
  zoomSelectActive?: boolean;
}>();

const emit = defineEmits<{
  seek: [time: number];
  "zoom-select": [startTime: number, endTime: number];
}>();

const ctx = inject(scrollableTimelineKey, null);

const waveform = createWaveformProcessor();

const id = useId();
const svgRef = ref<SVGSVGElement>();
const path = ref<string>();
const positionPct = ref<number>(0);
/** True when the playhead is within the visible window. */
const positionVisible = ref(false);

const isSeeking = ref(false);

// ── Helpers ──────────────────────────────────────────────────────────────────

const effectiveOffsetTime = computed(() => ctx?.offsetTime.value ?? props.offsetTime ?? 0);
const effectiveVisibleDuration = computed(() => {
  if (ctx) return ctx.visibleDuration.value;
  const totalDuration = props.buffer?.duration || 1;
  return totalDuration / (props.ratio ?? 1);
});

// ── Playback cursor ─────────────────────────────────────────────────────────

const updatePosition = () => {
  const visibleDuration = effectiveVisibleDuration.value;
  const offsetTime = effectiveOffsetTime.value;
  const relativeTime = props.currentTime - offsetTime;
  const pct = relativeTime / visibleDuration;
  positionVisible.value = pct >= 0 && pct <= 1;
  positionPct.value = Math.min(Math.max(pct, 0), 1) * 100;
};

watchEffect(updatePosition);

// ── Waveform path ───────────────────────────────────────────────────────────

const updatePath = () => {
  if (!svgRef.value || !props.buffer?.length) return;
  const rect = svgRef.value.getBoundingClientRect();
  // Guard against degenerate frames (e.g. during resize or before layout)
  if (rect.width < 10 || !rect.height) return;

  updatePosition();

  const offsetTime = effectiveOffsetTime.value;
  const visibleDuration = effectiveVisibleDuration.value;
  const sampleRate = props.buffer.sampleRate;
  const totalSamples = props.buffer.length;

  const startSample = Math.floor(offsetTime * sampleRate);
  const endSample = Math.min(Math.ceil((offsetTime + visibleDuration) * sampleRate), totalSamples);

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
      start: startSample,
      end: endSample,
    })
    .then(
      (nextPath) => {
        path.value = nextPath;
      },
      () => {},
    );
};

// Debounced variant used by ResizeObserver to avoid thrashing on resize drag.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedUpdatePath = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updatePath, 50);
};

const resizeObserver = new ResizeObserver(debouncedUpdatePath);

// Re-render immediately when props that affect the visible window change.
watch(
  () =>
    [
      props.buffer,
      props.ratio,
      props.offsetTime,
      effectiveOffsetTime.value,
      effectiveVisibleDuration.value,
    ] as const,
  updatePath,
);

onMounted(() => {
  if (!svgRef.value) return;
  resizeObserver.observe(svgRef.value);
  updatePath();
});

onBeforeUnmount(() => {
  if (svgRef.value) resizeObserver.unobserve(svgRef.value);
  if (debounceTimer) clearTimeout(debounceTimer);
  waveform.dispose();
  document.removeEventListener("mousemove", onDocMousemove);
  document.removeEventListener("mouseup", onDocMouseup);
  document.removeEventListener("mousemove", onZoomDocMousemove);
  document.removeEventListener("mouseup", onZoomDocMouseup);
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
  if (isZoomSelecting.value) return; // suppress hover during zoom-select drag
  if (!svgRef.value) return;
  const rect = svgRef.value.getBoundingClientRect();
  const pct = Math.min(Math.max((evt.clientX - rect.left) / rect.width, 0), 1);
  hoverPct.value = pct * 100;
  hoverTime.value = effectiveOffsetTime.value + pct * effectiveVisibleDuration.value;
};

const onHoverLeave = () => {
  hoverPct.value = null;
};

const clientXToTime = (clientX: number): number => {
  if (!svgRef.value) return 0;
  const rect = svgRef.value.getBoundingClientRect();
  const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  return effectiveOffsetTime.value + pct * effectiveVisibleDuration.value;
};

// ── Seek interaction ────────────────────────────────────────────────────────

const onDocMousemove = (evt: MouseEvent) => {
  if (isSeeking.value) emit("seek", clientXToTime(evt.clientX));
};

const onDocMouseup = () => {
  isSeeking.value = false;
  document.removeEventListener("mousemove", onDocMousemove);
  document.removeEventListener("mouseup", onDocMouseup);
};

// ── Zoom-select rubber-band ─────────────────────────────────────────────────

const isZoomSelecting = ref(false);
const zoomBandStartPct = ref(0);
const zoomBandEndPct = ref(0);

const onZoomDocMousemove = (evt: MouseEvent) => {
  if (!svgRef.value) return;
  const rect = svgRef.value.getBoundingClientRect();
  zoomBandEndPct.value = Math.min(Math.max((evt.clientX - rect.left) / rect.width, 0), 1);
};

const onZoomDocMouseup = () => {
  document.removeEventListener("mousemove", onZoomDocMousemove);
  document.removeEventListener("mouseup", onZoomDocMouseup);
  isZoomSelecting.value = false;
  hoverPct.value = null;

  const start = Math.min(zoomBandStartPct.value, zoomBandEndPct.value);
  const end = Math.max(zoomBandStartPct.value, zoomBandEndPct.value);
  // Ignore tiny drags (< 0.5% of visible width)
  if (end - start < 0.005) {
    zoomBandStartPct.value = 0;
    zoomBandEndPct.value = 0;
    return;
  }

  const visibleDuration = effectiveVisibleDuration.value;
  const startTime = effectiveOffsetTime.value + start * visibleDuration;
  const endTime = effectiveOffsetTime.value + end * visibleDuration;
  emit("zoom-select", startTime, endTime);

  zoomBandStartPct.value = 0;
  zoomBandEndPct.value = 0;
};

// ── Unified mousedown ───────────────────────────────────────────────────────

const onMousedown = (evt: MouseEvent) => {
  if (props.zoomSelectActive) {
    // Start rubber-band zoom-select drag
    if (!svgRef.value) return;
    const rect = svgRef.value.getBoundingClientRect();
    const pct = Math.min(Math.max((evt.clientX - rect.left) / rect.width, 0), 1);
    zoomBandStartPct.value = pct;
    zoomBandEndPct.value = pct;
    isZoomSelecting.value = true;
    hoverPct.value = null;
    document.addEventListener("mousemove", onZoomDocMousemove);
    document.addEventListener("mouseup", onZoomDocMouseup);
    return;
  }

  // Normal seek drag
  isSeeking.value = true;
  emit("seek", clientXToTime(evt.clientX));
  document.addEventListener("mousemove", onDocMousemove);
  document.addEventListener("mouseup", onDocMouseup);
};
</script>

<template>
  <svg
    ref="svgRef"
    class="w-full h-full"
    :style="{ cursor: zoomSelectActive ? 'crosshair' : 'pointer' }"
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
        <template v-if="positionVisible">
          <!-- Played portion: accent colour -->
          <stop offset="0%" stop-color="var(--color-accent)" />
          <stop :offset="`${positionPct}%`" stop-color="var(--color-accent)" />
          <!-- Unplayed portion: muted -->
          <stop
            :offset="`${positionPct}%`"
            stop-color="var(--color-base-content)"
            stop-opacity="0.3"
          />
          <stop
            offset="100%"
            stop-color="var(--color-base-content)"
            stop-opacity="0.3"
          />
        </template>
        <!-- Playhead outside visible window: uniform muted colour -->
        <template v-else>
          <stop
            offset="0%"
            stop-color="var(--color-base-content)"
            stop-opacity="0.3"
          />
          <stop
            offset="100%"
            stop-color="var(--color-base-content)"
            stop-opacity="0.3"
          />
        </template>
      </linearGradient>
    </defs>
    <path class="stroke-1 fill-none" :stroke="`url(#wfGrad_${id})`" :d="path" />
    <!-- Playhead cursor line (only when within the visible window) -->
    <line
      v-if="positionVisible"
      :x1="`${positionPct}%`"
      y1="0"
      :x2="`${positionPct}%`"
      y2="100%"
      stroke="var(--color-accent)"
      stroke-width="1.5"
      stroke-dasharray="3 2"
      opacity="0.8"
    />
    <!-- Hover ghost cursor line + time label (hidden while actively seeking or zoom-selecting) -->
    <template v-if="hoverPct !== null && !isSeeking && !isZoomSelecting">
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
      >
        {{ formatTime(hoverTime) }}
      </text>
    </template>
    <!-- Zoom-select rubber-band rectangle -->
    <rect
      v-if="isZoomSelecting"
      :x="`${Math.min(zoomBandStartPct, zoomBandEndPct) * 100}%`"
      :width="`${Math.abs(zoomBandEndPct - zoomBandStartPct) * 100}%`"
      y="0"
      height="100%"
      fill="var(--color-primary)"
      fill-opacity="0.15"
      stroke="var(--color-primary)"
      stroke-opacity="0.6"
      stroke-width="1"
      pointer-events="none"
    />
  </svg>
</template>
