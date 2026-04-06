<script setup lang="ts">
/**
 * WaveformView — seekable audio buffer peak graph.
 *
 * Props
 * ─────
 * buffer            AudioBuffer to visualise.
 * currentTime       Current playback position in seconds.
 * ratio             Zoom ratio (1 = full buffer, 4 = 4× zoom). Default 1.
 * offsetTime        Scroll offset in seconds (start of visible window). Default 0.
 * zoomSelectActive  When true, mousedown starts a rubber-band zoom-select drag.
 * selectionActive   When true, mousedown starts a time-range selection drag
 *                   (used by recorded-node cut/copy tools).
 * selectionRange    Externally-provided [start, end] range to highlight.
 * selectionColor    CSS colour for the selection band. Defaults to primary.
 * panDragActive     When true, mousedown starts a pan-drag (drag right to define
 *                   silence duration at the mousedown position). Matches the
 *                   instrument-node pan tool UX.
 * pastePreviewActive When true, hover shows a paste-indicator line and click
 *                    emits paste-at. Matches the instrument-node paste tool UX.
 * pastePreviewDuration Duration of the clipboard content (seconds) — used to
 *                      render a visual indicator showing the paste region width.
 *
 * Emits
 * ─────
 * seek(time)              User clicked or dragged to seek to a time position.
 * zoom-select(start, end) Completed a rubber-band zoom-select drag.
 * selection(start, end)   Completed a time-range selection drag.
 * pan-commit(at, dur)     Pan-drag completed — insert silence at `at` for `dur` s.
 * pan-preview(at, dur)    Pan-drag in progress — live preview values.
 * paste-at(time)          User clicked to paste at the given time.
 */

import { computed, inject, onBeforeUnmount, onMounted, ref, useId, watch, watchEffect } from "vue";
import { createWaveformProcessor } from "../../../lib/audio/waveform";
import { getWaveformChunk } from "../../../lib/audio/waveform-window";
import { scrollableTimelineKey } from "../../../lib/scrollable-timeline";

const props = defineProps<{
  buffer: AudioBuffer;
  currentTime: number;
  ratio?: number;
  offsetTime?: number;
  zoomSelectActive?: boolean;
  selectionActive?: boolean;
  selectionRange?: { start: number; end: number } | null;
  selectionColor?: string;
  panDragActive?: boolean;
  pastePreviewActive?: boolean;
  pastePreviewDuration?: number;
  /** Pristine Float32Array channel data — used instead of buffer.getChannelData()
   *  to avoid browser-level AudioBuffer sample data corruption. */
  pristineChannels?: Float32Array[];
}>();

const emit = defineEmits<{
  seek: [time: number];
  "zoom-select": [startTime: number, endTime: number];
  selection: [startTime: number, endTime: number];
  "pan-commit": [atTime: number, duration: number];
  "pan-preview": [atTime: number, duration: number];
  "paste-at": [time: number];
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

  const timeFrom = effectiveOffsetTime.value;
  const timeTo = timeFrom + effectiveVisibleDuration.value;
  const numSamples = Math.round(rect.width / 3);

  // Use pristine channel data when available — immune to browser-level
  // AudioBuffer sample data corruption.
  const pristine = props.pristineChannels?.[0];
  const chunk = pristine
    ? getWaveformChunk(pristine, timeFrom, timeTo, numSamples, {
        sampleRate: props.buffer.sampleRate,
        length: props.buffer.length,
      })
    : getWaveformChunk(props.buffer, timeFrom, timeTo, numSamples);

  waveform
    .getLinearPath(chunk, {
      samples: numSamples,
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
      props.pristineChannels,
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
  document.removeEventListener("mousemove", onTimeSelDocMousemove);
  document.removeEventListener("mouseup", onTimeSelDocMouseup);
  document.removeEventListener("mousemove", onPanDragDocMousemove);
  document.removeEventListener("mouseup", onPanDragDocMouseup);
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
  if (isZoomSelecting.value || isTimeSelecting.value || isPanDragging.value) return; // suppress hover during drags
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

// ── Time-range selection (for recorded-node cut/copy) ───────────────────────

const isTimeSelecting = ref(false);
const timeSelStartPct = ref(0);
const timeSelEndPct = ref(0);

const onTimeSelDocMousemove = (evt: MouseEvent) => {
  if (!svgRef.value) return;
  const rect = svgRef.value.getBoundingClientRect();
  timeSelEndPct.value = Math.min(Math.max((evt.clientX - rect.left) / rect.width, 0), 1);
};

const onTimeSelDocMouseup = () => {
  document.removeEventListener("mousemove", onTimeSelDocMousemove);
  document.removeEventListener("mouseup", onTimeSelDocMouseup);
  isTimeSelecting.value = false;
  hoverPct.value = null;

  const start = Math.min(timeSelStartPct.value, timeSelEndPct.value);
  const end = Math.max(timeSelStartPct.value, timeSelEndPct.value);
  // Ignore tiny drags (< 0.5% of visible width)
  if (end - start < 0.005) {
    timeSelStartPct.value = 0;
    timeSelEndPct.value = 0;
    return;
  }

  const visibleDuration = effectiveVisibleDuration.value;
  const startTime = effectiveOffsetTime.value + start * visibleDuration;
  const endTime = effectiveOffsetTime.value + end * visibleDuration;
  emit("selection", startTime, endTime);

  timeSelStartPct.value = 0;
  timeSelEndPct.value = 0;
};

// ── Pan silence preview ─────────────────────────────────────────────────────

/**
 * Computed percentage positions for the optimistic silence gap visual.
 * Renders from props (external control) OR from live pan-drag state.
 */
const panGapPcts = computed(() => {
  if (!isPanDragging.value) return null;
  const at = panDragStartTime.value;
  const dur = panDragDuration.value;
  if (dur <= 0) return null;
  const offset = effectiveOffsetTime.value;
  const visDur = effectiveVisibleDuration.value;
  if (visDur <= 0) return null;
  const startPct = ((at - offset) / visDur) * 100;
  const endPct = ((at + dur - offset) / visDur) * 100;
  return { startPct: Math.max(0, startPct), endPct: Math.min(100, endPct) };
});

// ── Pan-drag interaction ────────────────────────────────────────────────────
// Matches instrument-node pan tool: mousedown captures the insertion point,
// drag right defines the silence duration, mouseup commits.

const isPanDragging = ref(false);
const panDragStartTime = ref(0);
const panDragDuration = ref(0);

const onPanDragDocMousemove = (evt: MouseEvent) => {
  const currentTime = clientXToTime(evt.clientX);
  // Only allow dragging rightward from the start point (positive silence)
  panDragDuration.value = Math.max(0, currentTime - panDragStartTime.value);
  emit("pan-preview", panDragStartTime.value, panDragDuration.value);
};

const onPanDragDocMouseup = () => {
  document.removeEventListener("mousemove", onPanDragDocMousemove);
  document.removeEventListener("mouseup", onPanDragDocMouseup);
  isPanDragging.value = false;
  hoverPct.value = null;

  const dur = panDragDuration.value;
  // Ignore tiny drags (< 10ms)
  if (dur < 0.01) {
    panDragStartTime.value = 0;
    panDragDuration.value = 0;
    return;
  }

  emit("pan-commit", panDragStartTime.value, dur);

  panDragStartTime.value = 0;
  panDragDuration.value = 0;
};

// ── Paste preview ───────────────────────────────────────────────────────────

/**
 * Computed percentage positions for the paste preview indicator.
 * Shows the region that would be filled by pasting at the current hover.
 */
const pastePreviewPcts = computed(() => {
  if (!props.pastePreviewActive || hoverPct.value === null || !props.pastePreviewDuration)
    return null;
  const visDur = effectiveVisibleDuration.value;
  if (visDur <= 0) return null;
  const startPct = hoverPct.value;
  const durPct = (props.pastePreviewDuration / visDur) * 100;
  return { startPct, endPct: Math.min(100, startPct + durPct) };
});

// ── External selection range → percentage positions ─────────────────────────

const externalSelPcts = computed(() => {
  const range = props.selectionRange;
  if (!range) return null;
  const offset = effectiveOffsetTime.value;
  const visDur = effectiveVisibleDuration.value;
  if (visDur <= 0) return null;
  const startPct = ((range.start - offset) / visDur) * 100;
  const endPct = ((range.end - offset) / visDur) * 100;
  return { startPct: Math.max(0, startPct), endPct: Math.min(100, endPct) };
});

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

  if (props.panDragActive) {
    // Start pan-drag (drag right to define silence duration at click point)
    const time = clientXToTime(evt.clientX);
    panDragStartTime.value = time;
    panDragDuration.value = 0;
    isPanDragging.value = true;
    hoverPct.value = null;
    document.addEventListener("mousemove", onPanDragDocMousemove);
    document.addEventListener("mouseup", onPanDragDocMouseup);
    return;
  }

  if (props.pastePreviewActive) {
    // Click to paste at the clicked time position
    const time = clientXToTime(evt.clientX);
    emit("paste-at", time);
    return;
  }

  if (props.selectionActive) {
    // Start time-range selection drag (for recorded-node cut/copy)
    if (!svgRef.value) return;
    const rect = svgRef.value.getBoundingClientRect();
    const pct = Math.min(Math.max((evt.clientX - rect.left) / rect.width, 0), 1);
    timeSelStartPct.value = pct;
    timeSelEndPct.value = pct;
    isTimeSelecting.value = true;
    hoverPct.value = null;
    document.addEventListener("mousemove", onTimeSelDocMousemove);
    document.addEventListener("mouseup", onTimeSelDocMouseup);
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
    :style="{
      cursor:
        panDragActive || isPanDragging
          ? 'col-resize'
          : pastePreviewActive
            ? 'cell'
            : zoomSelectActive
              ? 'crosshair'
              : selectionActive
                ? 'text'
                : 'pointer',
    }"
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
        <!-- Played portion: accent colour (positionPct is clamped to [0, 100]
             so when the playhead is past the view the entire waveform is accent,
             and when it's before the view the entire waveform is muted) -->
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
    <!-- Time-range selection drag rectangle (active drag) -->
    <rect
      v-if="isTimeSelecting"
      :x="`${Math.min(timeSelStartPct, timeSelEndPct) * 100}%`"
      :width="`${Math.abs(timeSelEndPct - timeSelStartPct) * 100}%`"
      y="0"
      height="100%"
      :fill="selectionColor ?? 'var(--color-primary)'"
      fill-opacity="0.15"
      :stroke="selectionColor ?? 'var(--color-primary)'"
      stroke-opacity="0.6"
      stroke-width="1"
      pointer-events="none"
    />
    <!-- External selection range (committed selection from parent) -->
    <rect
      v-if="externalSelPcts && !isTimeSelecting"
      :x="`${externalSelPcts.startPct}%`"
      :width="`${externalSelPcts.endPct - externalSelPcts.startPct}%`"
      y="0"
      height="100%"
      :fill="selectionColor ?? 'var(--color-primary)'"
      fill-opacity="0.15"
      :stroke="selectionColor ?? 'var(--color-primary)'"
      stroke-opacity="0.6"
      stroke-width="1"
      pointer-events="none"
    />
    <!-- Pan tool optimistic silence gap -->
    <rect
      v-if="panGapPcts"
      :x="`${panGapPcts.startPct}%`"
      :width="`${panGapPcts.endPct - panGapPcts.startPct}%`"
      y="0"
      height="100%"
      fill="var(--color-base-300)"
      fill-opacity="0.5"
      stroke="var(--color-accent)"
      stroke-opacity="0.6"
      stroke-width="1"
      stroke-dasharray="4 2"
      pointer-events="none"
    />
    <!-- Paste preview band (shows region that would be filled) -->
    <rect
      v-if="pastePreviewPcts"
      :x="`${pastePreviewPcts.startPct}%`"
      :width="`${pastePreviewPcts.endPct - pastePreviewPcts.startPct}%`"
      y="0"
      height="100%"
      fill="var(--color-success)"
      fill-opacity="0.15"
      stroke="var(--color-success)"
      stroke-opacity="0.6"
      stroke-width="1"
      stroke-dasharray="4 2"
      pointer-events="none"
    />
  </svg>
</template>
