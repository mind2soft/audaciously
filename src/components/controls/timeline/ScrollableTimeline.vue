<script setup lang="ts">
/**
 * ScrollableTimeline — unified scroll/zoom/auto-scroll container for all timeline-based node views.
 *
 * Layout (two rows):
 *   Row 1 — Ruler:  [gutter placeholder: gutterWidth px] [TimelineRuler flex-1]
 *   Row 2 — Scroll: outer div (overflow-x: auto) → inner div (width = gutterWidth + contentWidth × scaleFactor)
 *                   → sticky div (position: sticky, left: 0, width = viewportWidth) → <slot>
 *
 * Provides ScrollableTimelineContext via inject key scrollableTimelineKey.
 */

import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import {
  type ScrollableTimelineContext,
  scrollableTimelineKey,
} from "../../../lib/scrollable-timeline";
import TimelineRuler from "./TimelineRuler.vue";

const props = withDefaults(
  defineProps<{
    totalDuration: number;
    gutterWidth?: number;
    minScaleFactor?: number;
    maxPixelsPerSecond?: number;
    maxScaleFactor?: number;
    currentTime?: number;
    scaleFactor?: number;
    playing?: boolean;
    enableWheel?: boolean;
    enableAutoScroll?: boolean;
    enableSeek?: boolean;
  }>(),
  {
    gutterWidth: 0,
    minScaleFactor: 1,
    currentTime: 0,
    scaleFactor: 1,
    playing: false,
    enableWheel: true,
    enableAutoScroll: true,
    enableSeek: true,
  },
);

const emit = defineEmits<{
  "update:currentTime": [value: number];
  "update:scaleFactor": [value: number];
}>();

// ── DOM refs ──────────────────────────────────────────────────────────────────

const scrollEl = ref<HTMLDivElement>();
const viewportWidth = ref(0);
const viewportHeight = ref(0);

// ── Scale factor (v-model) ────────────────────────────────────────────────────

const effectiveMaxScaleFactor = computed(() => {
  if (props.maxScaleFactor != null) return props.maxScaleFactor;
  if (props.maxPixelsPerSecond != null && props.totalDuration > 0) {
    const cw = contentWidth.value;
    if (cw > 0) return (props.maxPixelsPerSecond * props.totalDuration) / cw;
  }
  return Infinity;
});

const scaleFactorModel = computed({
  get: () => props.scaleFactor ?? 1,
  set: (v: number) => {
    const clamped = Math.max(props.minScaleFactor ?? 1, Math.min(effectiveMaxScaleFactor.value, v));
    emit("update:scaleFactor", clamped);
  },
});

// ── currentTime (v-model) ─────────────────────────────────────────────────────

const currentTimeModel = computed({
  get: () => props.currentTime ?? 0,
  set: (v: number) => emit("update:currentTime", v),
});

// ── Geometry ──────────────────────────────────────────────────────────────────

const gutterWidthRef = computed(() => props.gutterWidth ?? 0);
const contentWidth = computed(() => Math.max(0, viewportWidth.value - gutterWidthRef.value));
const innerWidth = computed(
  () => gutterWidthRef.value + contentWidth.value * scaleFactorModel.value,
);
const totalDurationRef = computed(() => props.totalDuration);
const pixelsPerSecond = computed(() => {
  const td = totalDurationRef.value;
  if (td <= 0) return 0;
  return (contentWidth.value * scaleFactorModel.value) / td;
});

// ── Scroll state ──────────────────────────────────────────────────────────────

const scrollLeftPx = ref(0);

const maxScrollLeft = computed(() =>
  Math.max(0, contentWidth.value * (scaleFactorModel.value - 1)),
);

const offsetTime = computed(() => {
  const pps = pixelsPerSecond.value;
  if (pps <= 0) return 0;
  return scrollLeftPx.value / pps;
});

const visibleDuration = computed(() => {
  const pps = pixelsPerSecond.value;
  if (pps <= 0) return totalDurationRef.value;
  return contentWidth.value / pps;
});

const onScroll = () => {
  if (scrollEl.value) {
    scrollLeftPx.value = scrollEl.value.scrollLeft;
  }
};

// ── Wheel handler ─────────────────────────────────────────────────────────────

/** Walk the DOM tree to find the first element that can scroll vertically. */
function findVerticalScrollable(el: Element): Element | null {
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    const { overflowY } = getComputedStyle(child);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      child.scrollHeight > child.clientHeight
    ) {
      return child;
    }
    const found = findVerticalScrollable(child);
    if (found) return found;
  }
  return null;
}

const onWheel = (evt: WheelEvent) => {
  if (!props.enableWheel) return;
  evt.preventDefault();

  if (evt.shiftKey) {
    // Shift + scroll → vertical scroll on the inner scrollable content
    if (!scrollEl.value) return;
    const vEl = findVerticalScrollable(scrollEl.value);
    if (vEl) vEl.scrollTop += evt.deltaY;
    return;
  }

  // Normal wheel → horizontal scroll
  const delta = evt.deltaY || evt.deltaX;
  const scrollDelta = (delta / 300) * contentWidth.value;
  const newLeft = Math.max(0, Math.min(maxScrollLeft.value, scrollLeftPx.value + scrollDelta));
  if (scrollEl.value) {
    scrollEl.value.scrollLeft = newLeft;
    scrollLeftPx.value = newLeft;
  }
};

// ── Auto-scroll (10%–90% band) ────────────────────────────────────────────────

watch(currentTimeModel, (t) => {
  if (!(props.playing || isRulerDragging.value) || !props.enableAutoScroll) return;
  if (!scrollEl.value) return;
  const pps = pixelsPerSecond.value;
  if (pps <= 0) return;

  const vd = visibleDuration.value;
  const low = offsetTime.value + vd * 0.1;
  const high = offsetTime.value + vd * 0.9;

  if (t > high) {
    // Anchor playhead at 90% — scroll advances at exactly playback speed
    const newLeft = Math.max(0, Math.min(maxScrollLeft.value, (t - vd * 0.9) * pps));
    scrollEl.value.scrollLeft = newLeft;
    scrollLeftPx.value = newLeft;
  } else if (t < low) {
    // Anchor playhead at 10% (e.g. seeking backwards while playing)
    const newLeft = Math.max(0, Math.min(maxScrollLeft.value, (t - vd * 0.1) * pps));
    scrollEl.value.scrollLeft = newLeft;
    scrollLeftPx.value = newLeft;
  }
});

// ── Scale-factor change: keep currentTime centred ─────────────────────────────

watch(scaleFactorModel, async () => {
  await nextTick();
  if (!scrollEl.value) return;
  const pps = pixelsPerSecond.value;
  if (pps <= 0) return;
  const cw = contentWidth.value;
  const newLeft = Math.max(0, Math.min(maxScrollLeft.value, currentTimeModel.value * pps - cw / 2));
  scrollEl.value.scrollLeft = newLeft;
  scrollLeftPx.value = newLeft;
});

// ── ResizeObserver ────────────────────────────────────────────────────────────

let ro: ResizeObserver | null = null;

onMounted(() => {
  if (!scrollEl.value) return;
  ro = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    viewportWidth.value = Math.round(entry.contentRect.width);
    viewportHeight.value = Math.round(entry.contentRect.height);
  });
  ro.observe(scrollEl.value);
});

onBeforeUnmount(() => {
  if (ro && scrollEl.value) ro.unobserve(scrollEl.value);
  ro = null;
});

// ── Seek from ruler ───────────────────────────────────────────────────────────

const onRulerSeek = (t: number) => {
  if (props.enableSeek) currentTimeModel.value = t;
};

// ── Ruler drag tracking (for seek-drag auto-scroll) ───────────────────────────

const isRulerDragging = ref(false);

const onRulerMousedown = () => {
  if (!props.enableSeek) return;
  isRulerDragging.value = true;
  document.addEventListener(
    "mouseup",
    () => {
      isRulerDragging.value = false;
    },
    { once: true },
  );
};

// ── Ruler wheel → zoom ────────────────────────────────────────────────────────

const onRulerWheel = (evt: WheelEvent) => {
  if (!props.enableWheel) return;
  evt.preventDefault();
  const delta = evt.deltaY || evt.deltaX;
  // Scroll up (delta < 0) → zoom in; scroll down (delta > 0) → zoom out.
  scaleFactorModel.value = scaleFactorModel.value * 1.002 ** -delta;
};

// ── Provided context ──────────────────────────────────────────────────────────

const context: ScrollableTimelineContext = {
  offsetTime,
  scaleFactor: scaleFactorModel,
  viewportWidth,
  viewportHeight,
  contentWidth,
  gutterWidth: gutterWidthRef,
  pixelsPerSecond,
  totalDuration: totalDurationRef,
  visibleDuration,
  scrollEl: scrollEl as typeof scrollEl & { value: HTMLDivElement | undefined },
};

provide(scrollableTimelineKey, context);
</script>

<template>
  <div class="flex flex-col w-full h-full overflow-hidden">
    <!-- Row 1: Ruler -->
    <div
      class="flex flex-row shrink-0"
      @wheel.prevent="onRulerWheel"
      @mousedown="onRulerMousedown"
    >
      <!-- Gutter placeholder -->
      <div
        v-if="gutterWidthRef > 0"
        :style="{ width: `${gutterWidthRef}px` }"
        class="shrink-0"
      />
      <!-- Ruler fills remaining width -->
      <TimelineRuler
        class="flex-1"
        :duration-seconds="totalDuration"
        :offset-time="offsetTime"
        :ratio="1"
        :current-time="currentTimeModel"
        :visible-duration="visibleDuration"
        @seek="onRulerSeek"
      />
    </div>

    <!-- Row 2: Scroll container -->
    <div
      ref="scrollEl"
      class="flex-1 min-h-0 overflow-x-auto overflow-y-hidden"
      style="overflow-y: hidden"
      @scroll.passive="onScroll"
      @wheel.prevent="onWheel"
    >
      <!-- Inner div establishes the scroll range -->
      <div class="relative h-full" :style="{ width: `${innerWidth}px` }">
        <!-- Sticky div: never scrolls horizontally, always viewport-width -->
        <div
          class="sticky left-0 h-full overflow-hidden"
          :style="{ width: `${viewportWidth}px` }"
        >
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
