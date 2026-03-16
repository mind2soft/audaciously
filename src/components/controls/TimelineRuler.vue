<script setup lang="ts">
/**
 * TimelineRuler — canvas-based time ruler for the sequence timeline.
 *
 * Migrated from Timeline.vue. All inject() calls are replaced with props/emits.
 *
 * Props
 * ─────
 * durationSeconds  Total duration of the sequence in seconds.
 * offsetTime       Timeline scroll offset in seconds (from useTimelineStore).
 * ratio            Zoom ratio (from useTimelineStore).
 * currentTime      Current playback position in seconds.
 * visibleDuration  Optional. When provided, overrides the ratio-based pixel-per-second
 *                  calculation so the ruler always shows exactly this many seconds
 *                  across its full width. Used by RecordedNodeView where the waveform
 *                  is window-fit rather than pixel-scaled. Default: derived from ratio.
 *
 * Emits
 * ─────
 * seek(time)       User clicked or dragged to seek.
 */

import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { formatPixelToTime, formatTimeScale } from "../../lib/util/formatTime";

const props = defineProps<{
  durationSeconds: number;
  offsetTime: number;
  ratio: number;
  currentTime: number;
  /** When set, the ruler spans exactly this many seconds across its canvas width. */
  visibleDuration?: number;
}>();

const emit = defineEmits<{
  seek: [time: number];
}>();

// ── Canvas rendering ─────────────────────────────────────────────────────────

const canvasRef = ref<HTMLCanvasElement>();

const render = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  // Sync canvas resolution with display size
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Background
  const bgColor =
    getComputedStyle(canvas).getPropertyValue("--color-base-200") || "#1e1e2e";
  ctx.fillStyle = `oklch(${bgColor})`;

  // Use CSS variables via computed style
  const style = getComputedStyle(canvas);
  const textColor = style.color || "#aaa";
  const tickColor = "rgba(128,128,128,0.4)";
  const accentColor = style.getPropertyValue("--color-accent") || "#0ea5e9";

  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, w, h);

  // ── Draw tick marks ───────────────────────────────────────────────────────

  // When visibleDuration is provided (window-fit mode), derive px/sec from the
  // canvas width so the ruler spans exactly the visible window. Otherwise fall
  // back to the DAW-style fixed pixel-per-second scale (ratio * 16).
  const pixelsPerSecond = props.visibleDuration
    ? w / props.visibleDuration
    : props.ratio * 16; // baseSecondWidthInPixels = 16
  const minTickSpacing = 40; // px
  const rawInterval = minTickSpacing / pixelsPerSecond;

  // Round to a "nice" interval
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  const niceFactor = rawInterval / magnitude;
  let tickInterval: number;
  if (niceFactor < 1.5) tickInterval = magnitude;
  else if (niceFactor < 3.5) tickInterval = 2 * magnitude;
  else if (niceFactor < 7.5) tickInterval = 5 * magnitude;
  else tickInterval = 10 * magnitude;

  tickInterval = Math.max(tickInterval, 0.001);

  const startTime = props.offsetTime;
  const endTime = startTime + w / pixelsPerSecond;

  // First tick at or after startTime
  const firstTick = Math.ceil(startTime / tickInterval) * tickInterval;

  ctx.font = `10px monospace`;
  ctx.fillStyle = textColor;
  ctx.strokeStyle = tickColor;
  ctx.lineWidth = 1;

  for (let t = firstTick; t <= endTime + tickInterval; t += tickInterval) {
    const x = (t - startTime) * pixelsPerSecond;
    if (x < 0 || x > w + 1) continue;

    const isMajor = Math.abs(Math.round(t / tickInterval) % 4) === 0;

    // Tick line
    ctx.beginPath();
    ctx.strokeStyle = isMajor ? "rgba(128,128,128,0.6)" : tickColor;
    ctx.moveTo(Math.round(x) + 0.5, isMajor ? 0 : h / 2);
    ctx.lineTo(Math.round(x) + 0.5, h);
    ctx.stroke();

    // Label (only on major ticks or every other if zoomed out)
    if (isMajor) {
      ctx.fillStyle = textColor;
      ctx.fillText(formatTimeScale(t), Math.round(x) + 3, h - 4);
    }
  }

  // ── Draw playhead ─────────────────────────────────────────────────────────
  const playheadX = (props.currentTime - startTime) * pixelsPerSecond;
  if (playheadX >= 0 && playheadX <= w) {
    ctx.strokeStyle = `oklch(${accentColor})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.round(playheadX) + 0.5, 0);
    ctx.lineTo(Math.round(playheadX) + 0.5, h);
    ctx.stroke();

    // Playhead triangle marker at top
    ctx.fillStyle = `oklch(${accentColor})`;
    ctx.beginPath();
    ctx.moveTo(playheadX - 5, 0);
    ctx.lineTo(playheadX + 5, 0);
    ctx.lineTo(playheadX, 8);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
};

const resizeObserver = new ResizeObserver(render);

watch(
  () => [
    props.currentTime,
    props.ratio,
    props.offsetTime,
    props.durationSeconds,
    props.visibleDuration,
  ],
  render,
);

onMounted(() => {
  if (!canvasRef.value) return;
  resizeObserver.observe(canvasRef.value);
  render();
});

onBeforeUnmount(() => {
  if (canvasRef.value) resizeObserver.unobserve(canvasRef.value);
});

// ── Seek interaction ─────────────────────────────────────────────────────────

const isCapturing = ref(false);

const xToTime = (clientX: number): number => {
  if (!canvasRef.value) return 0;
  const rect = canvasRef.value.getBoundingClientRect();
  const px = clientX - rect.left;
  // In window-fit mode, derive seconds-per-pixel from visibleDuration.
  // In DAW mode, use the ratio * baseSecondWidthInPixels scale.
  const secondsPerPixel = props.visibleDuration
    ? props.visibleDuration / rect.width
    : formatPixelToTime(props.ratio, 1);
  return px * secondsPerPixel + props.offsetTime;
};

const onMousedown = (evt: MouseEvent) => {
  evt.preventDefault();
  isCapturing.value = true;
  emit("seek", Math.max(0, xToTime(evt.clientX)));
  document.addEventListener("mousemove", onDocMousemove);
  document.addEventListener("mouseup", onDocMouseup);
};

const onDocMousemove = (evt: MouseEvent) => {
  if (!isCapturing.value) return;
  emit("seek", Math.max(0, xToTime(evt.clientX)));
};

const onDocMouseup = () => {
  isCapturing.value = false;
  document.removeEventListener("mousemove", onDocMousemove);
  document.removeEventListener("mouseup", onDocMouseup);
};

// ── Pointer hover indicator ───────────────────────────────────────────────────

const pointerVisible = ref(false);
const pointerX = ref(0);

const onMouseenter = (evt: MouseEvent) => {
  pointerVisible.value = true;
  updatePointer(evt);
};
const onMouseleave = () => {
  pointerVisible.value = false;
};
const onMousemove = (evt: MouseEvent) => {
  updatePointer(evt);
};
const updatePointer = (evt: MouseEvent) => {
  const rect = (evt.currentTarget as HTMLElement).getBoundingClientRect();
  pointerX.value = evt.clientX - rect.left;
};
</script>

<template>
  <div
    class="relative w-full h-10 bg-[color-mix(in_oklch,var(--color-base-100)_30%,var(--color-base-200))] cursor-pointer select-none"
    @mouseenter="onMouseenter"
    @mouseleave="onMouseleave"
    @mousemove="onMousemove"
    @mousedown="onMousedown"
  >
    <canvas ref="canvasRef" class="w-full h-full" />

    <!-- Hover cursor indicator -->
    <div
      v-if="pointerVisible"
      class="absolute top-0 bottom-0 w-px border-l border-dotted border-accent pointer-events-none"
      :style="{ left: `${pointerX}px` }"
      aria-hidden="true"
    />
  </div>
</template>
