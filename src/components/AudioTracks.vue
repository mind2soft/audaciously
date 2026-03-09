<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, computed } from "vue";
import type { Ref } from "vue";
import { playerKey, timelineKey, selectedTrackKey } from "../lib/provider-keys";
import TimelineView from "./Timeline.vue";
import AudioTrackView from "./AudioTrack.vue";
import InstrumentTrackHeader from "./InstrumentTrackHeader.vue";
import InstrumentTrackView from "./InstrumentTrackView.vue";
import ZoomControl from "./ZoomControl.vue";

import type { AudioPlayer } from "../lib/audio/player";
import type { AudioTrack } from "../lib/audio/track";
import type { RecordedAudioTrack } from "../lib/audio/track/recorded/recorded-track";
import type { InstrumentAudioTrack } from "../lib/audio/track/instrument";
import {
  ScaleDirection,
  scaleRatio,
  scale_min,
  scale_max,
  type Timeline,
} from "../lib/timeline";
import TrackHeader from "./TrackHeader.vue";
import { formatTimeToPixel, formatPixelToTime } from "../lib/util/formatTime";
import { usePinchGesture } from "../composables/usePinchGesture";

type TrackDrag =
  | {
      isDragging: true;
      startClientX: number;
      startOffsetTime: number;
    }
  | {
      isDragging: false;
    };

const scrollSpeed = 64; // px
const player = inject<AudioPlayer>(playerKey);
const timeline = inject<Timeline>(timelineKey);
const selectedTrackRef = inject<Ref<AudioTrack<any> | null>>(selectedTrackKey);
const selectedTrackId = computed(() => selectedTrackRef?.value?.id ?? null);

if (!player) {
  throw new Error("missing player");
} else if (!timeline) {
  throw new Error("missing timeline");
}

// ---------------------------------------------------------------------------
// Template refs for gesture composable
// ---------------------------------------------------------------------------

/** The right-column track-content area — gesture target. */
const tracksAreaRef = ref<HTMLElement | null>(null);

/** The inner overflow-y-auto scroll container — used for programmatic scroll. */
const scrollContainerRef = ref<HTMLElement | null>(null);

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

const tracks = ref<AudioTrack<any>[]>([...player.getTracks()]);
const trackDrag = ref<TrackDrag>({
  isDragging: false,
});
const tracksPosition = ref<number>(
  -formatTimeToPixel(timeline.ratio, timeline.offsetTime),
);
const cursorPosition = ref<number>(
  formatTimeToPixel(timeline.ratio, player.currentTime),
);

/**
 * Mirrors `timeline.ratio` as a Vue ref so ZoomControl (and any other reactive
 * consumer) receives updates whenever the timeline emits a "change" event.
 * Kept in sync via `handleTimelineChange`.
 */
const timelineRatio = ref<number>(timeline.ratio);

// ---------------------------------------------------------------------------
// Mouse drag (existing pan behaviour)
// ---------------------------------------------------------------------------

// --- Sort drag state ---
const draggingId = ref<string | null>(null);
const insertionIndex = ref<number | null>(null);
/** Set to true only when the mousedown started on a drag handle element. */
let dragHandleActive = false;

const handleMouseDown = (evt: MouseEvent) => {
  if (
    evt.buttons !== 1 ||
    (evt.target as HTMLDivElement).closest("[data-track-header]")
  ) {
    return;
  }

  document.documentElement.style.userSelect = "none";
  trackDrag.value = {
    isDragging: true,
    startClientX: evt.clientX,
    startOffsetTime: timeline.offsetTime,
  };
};
const handleMouseUp = () => {
  document.documentElement.style.userSelect = "";
  trackDrag.value = { isDragging: false };
};
const handleMouseMove = (evt: MouseEvent) => {
  if (!trackDrag.value.isDragging) return;

  const clientDelta = evt.clientX - trackDrag.value.startClientX;
  const offsetDelta = -formatPixelToTime(timeline.ratio, clientDelta);

  timeline.offsetTime = trackDrag.value.startOffsetTime + offsetDelta;
};
const handleMouseWheel = (evt: WheelEvent) => {
  const delta = evt.deltaY;

  if (evt.shiftKey) {
    evt.preventDefault();
    evt.stopPropagation();

    const deltaPx = delta > 0 ? scrollSpeed : -scrollSpeed;

    timeline.offsetTime =
      timeline.offsetTime + formatPixelToTime(timeline.ratio, deltaPx);
  } else if (evt.altKey) {
    evt.preventDefault();
    evt.stopPropagation();

    timeline.ratio = scaleRatio(
      timeline.ratio,
      delta > 0 ? ScaleDirection.UP : ScaleDirection.DOWN,
    );
  }
};
const handleContextMenu = (evt: MouseEvent) => {
  evt.preventDefault();
};

// ---------------------------------------------------------------------------
// Touch / pointer gestures  (pinch-to-zoom + touch drag)
// ---------------------------------------------------------------------------

usePinchGesture(tracksAreaRef, {
  /**
   * Two-finger pinch → zoom.
   * scaleDelta > 1 means fingers spreading  → zoom in (higher ratio).
   * scaleDelta < 1 means fingers converging → zoom out (lower ratio).
   */
  onPinch(scaleDelta) {
    const clamped = Math.min(
      Math.max(timeline.ratio * scaleDelta, scale_min),
      scale_max,
    );
    timeline.ratio = clamped;
  },

  /**
   * Single-touch drag → horizontal pan + vertical scroll.
   * deltaX > 0 means finger moved right → show earlier content (offsetTime ↓).
   * deltaY > 0 means finger moved down  → scroll container up.
   */
  onDrag(deltaX, deltaY) {
    timeline.offsetTime -= formatPixelToTime(timeline.ratio, deltaX);

    if (scrollContainerRef.value) {
      scrollContainerRef.value.scrollTop -= deltaY;
    }
  },
});

// ---------------------------------------------------------------------------
// Drag-to-reorder track headers
// ---------------------------------------------------------------------------

/** Intercept mousedown on header column — only allow HTML5 drag when the
 *  pointer starts on a [data-drag-handle] element. */
const handleHeaderMouseDown = (evt: MouseEvent) => {
  const handle = (evt.target as HTMLElement).closest("[data-drag-handle]");
  dragHandleActive = !!handle;
};

const handleDragStart = (evt: DragEvent, track: AudioTrack<any>) => {
  if (!dragHandleActive) {
    evt.preventDefault();
    return;
  }
  draggingId.value = track.id;
  if (evt.dataTransfer) {
    evt.dataTransfer.effectAllowed = "move";
    evt.dataTransfer.setData("text/plain", track.id);
  }
};

const handleDragOver = (evt: DragEvent, trackIndex: number) => {
  if (draggingId.value === null) return;
  evt.preventDefault();
  if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";

  // Determine insertion position from pointer Y relative to the row mid-point
  const target = evt.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  insertionIndex.value = evt.clientY < midY ? trackIndex : trackIndex + 1;
};

const handleDrop = (evt: DragEvent) => {
  evt.preventDefault();
  if (draggingId.value === null || insertionIndex.value === null) return;

  const fromIndex = tracks.value.findIndex((t) => t.id === draggingId.value);
  if (fromIndex < 0) return;

  // Compute the actual destination index after the removal of the dragged item
  let toIndex = insertionIndex.value;
  if (toIndex > fromIndex) toIndex -= 1;

  player.reorderTracks(fromIndex, toIndex);

  draggingId.value = null;
  insertionIndex.value = null;
  dragHandleActive = false;
};

const handleDragEnd = () => {
  draggingId.value = null;
  insertionIndex.value = null;
  dragHandleActive = false;
};

// ---------------------------------------------------------------------------
// Track selection
// ---------------------------------------------------------------------------

const handleTrackSelect = (track: AudioTrack<any> | null) => {
  if (selectedTrackRef) {
    selectedTrackRef.value = track;
  }
};

// ---------------------------------------------------------------------------
// Timeline / player event handlers
// ---------------------------------------------------------------------------

const handleUpdateCursor = () => {
  cursorPosition.value = formatTimeToPixel(timeline.ratio, player.currentTime);
};

const handlePlayerChange = () => {
  tracks.value = [...player.getTracks()];
  handleUpdateCursor();
};

const handleTimelineChange = () => {
  timelineRatio.value = timeline.ratio;
  tracksPosition.value = -formatTimeToPixel(
    timeline.ratio,
    timeline.offsetTime,
  );
  handleUpdateCursor();
};

player.addEventListener("change", handlePlayerChange);
player.addEventListener("seek", handleUpdateCursor);
player.addEventListener("timeupdate", handleUpdateCursor);
player.addEventListener("stop", handleUpdateCursor);

timeline.addEventListener("change", handleTimelineChange);

onMounted(() => {
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
});
onUnmounted(() => {
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);

  player.removeEventListener("change", handlePlayerChange);
  player.removeEventListener("seek", handleUpdateCursor);
  player.removeEventListener("timeupdate", handleUpdateCursor);
  player.removeEventListener("stop", handleUpdateCursor);

  timeline.removeEventListener("change", handleTimelineChange);
});
</script>

<template>
  <div
    class="flex relative flex-col flex-1 bg-base-200"
    v-on:wheel="handleMouseWheel"
    v-on:mousedown="handleMouseDown"
    v-on:contextmenu="handleContextMenu"
  >
    <!-- ── Timeline ruler ─────────────────────────────────────────────────── -->
    <div class="relative ml-10 sm:ml-40 h-10">
      <TimelineView />
    </div>

    <!-- ── Track content ──────────────────────────────────────────────────── -->
    <div class="relative flex-1">
      <div
        ref="scrollContainerRef"
        class="overflow-y-auto absolute top-0 right-0 bottom-0 left-0 overflow-x-clip bg-base-100"
      >
        <div class="flex min-h-full">
          <!-- Left column: track headers -->
          <div class="flex z-10 flex-col w-10 sm:w-40 min-h-full bg-base-200">
            <div class="relative" v-on:mousedown="handleHeaderMouseDown">
              <!-- Drop indicator: before first track -->
              <div
                v-if="insertionIndex === 0"
                class="h-0.5 bg-primary w-full"
              />
              <template v-for="(track, trackIndex) in tracks" :key="track.id">
                <div
                  draggable="true"
                  :class="{ 'opacity-40': draggingId === track.id }"
                  v-on:dragstart="(e) => handleDragStart(e, track)"
                  v-on:dragover="(e) => handleDragOver(e, trackIndex)"
                  v-on:drop="handleDrop"
                  v-on:dragend="handleDragEnd"
                >
                  <TrackHeader
                    v-if="track.kind === 'recorded'"
                    :track="track as RecordedAudioTrack"
                    :is-selected="selectedTrackId === track.id"
                    v-on:select="handleTrackSelect"
                  />
                  <InstrumentTrackHeader
                    v-else-if="track.kind === 'instrument'"
                    :track="track as InstrumentAudioTrack"
                    :is-selected="selectedTrackId === track.id"
                    v-on:select="handleTrackSelect"
                  />
                </div>
                <!-- Drop indicator: after this track -->
                <div
                  v-if="insertionIndex === trackIndex + 1"
                  class="h-0.5 bg-primary w-full"
                />
              </template>
            </div>
          </div>

          <!-- Right column: track content + gesture target -->
          <div ref="tracksAreaRef" class="flex z-0 flex-col flex-1 touch-none">
            <div
              class="relative min-h-full"
              :style="{
                left: `${tracksPosition}px`,
              }"
            >
              <div class="relative">
                <template v-for="track in tracks" :key="track.id">
                  <AudioTrackView
                    v-if="track.kind === 'recorded'"
                    :track="track as RecordedAudioTrack"
                    :is-selected="selectedTrackId === track.id"
                  />
                  <InstrumentTrackView
                    v-else-if="track.kind === 'instrument'"
                    :track="track as InstrumentAudioTrack"
                    :is-selected="selectedTrackId === track.id"
                  />
                </template>
              </div>
              <div
                class="absolute top-0 w-0.5 bottom-0 bg-white/50 z-10"
                :style="{
                  left: `${cursorPosition}px`,
                }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Zoom control footer ────────────────────────────────────────────── -->
    <div
      class="flex h-8 bg-base-200 border-t border-base-300 items-center shrink-0"
    >
      <!-- Spacer matching the track-header column width -->
      <div class="w-10 sm:w-40 shrink-0"></div>
      <!-- Zoom control spans the track-content column -->
      <div class="flex-1 min-w-0">
        <ZoomControl
          :model-value="timelineRatio"
          :min="scale_min"
          :max="scale_max"
          @update:model-value="
            (v: number) => {
              timeline.ratio = v;
            }
          "
        />
      </div>
    </div>
  </div>
</template>
