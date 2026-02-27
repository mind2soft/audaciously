<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from "vue";
import type { Ref } from "vue";
import { playerKey, timelineKey, selectedTrackKey } from "../lib/provider-keys";
import TimelineView from "./Timeline.vue";
import AudioTrackView from "./AudioTrack.vue";

import type { AudioPlayer } from "../lib/audio/player";
import type { AudioTrack } from "../lib/audio/track";
import { ScaleDirection, scaleRatio, type Timeline } from "../lib/timeline";
import TrackHeader, { type DeleteTrackEvent } from "./TrackHeader.vue";
import { formatTimeToPixel, formatPixelToTime } from "../lib/util/formatTime";

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
const selectedTrackRef = inject<Ref<AudioTrack | null>>(selectedTrackKey);

if (!player) {
  throw new Error("missing player");
} else if (!timeline) {
  throw new Error("missing timeline");
}

const tracks = ref<AudioTrack[]>([...player.getTracks()]);
const trackDrag = ref<TrackDrag>({
  isDragging: false,
});
const tracksPosition = ref<number>(
  -formatTimeToPixel(timeline.ratio, timeline.offsetTime)
);
const cursorPosition = ref<number>(
  formatTimeToPixel(timeline.ratio, player.currentTime)
);

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
      delta > 0 ? ScaleDirection.UP : ScaleDirection.DOWN
    );
  }
};
const handleContextMenu = (evt: MouseEvent) => {
  evt.preventDefault();
};

const handleTrackDelete = (evt: DeleteTrackEvent) => {
  if (selectedTrackRef?.value?.id === evt.track.id) {
    selectedTrackRef.value = null;
  }
  player.removeTrack(evt.track);
};

const handleTrackSelect = (track: AudioTrack | null) => {
  if (selectedTrackRef) {
    selectedTrackRef.value = track;
  }
};

const handleUpdateCursor = () => {
  cursorPosition.value = formatTimeToPixel(timeline.ratio, player.currentTime);
};

const handlePlayerChange = () => {
  tracks.value = [...player.getTracks()];
  handleUpdateCursor();
};

const handleTimelineChange = () => {
  tracksPosition.value = -formatTimeToPixel(
    timeline.ratio,
    timeline.offsetTime
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
    <div class="relative ml-10 sm:ml-40 h-10">
      <TimelineView />
    </div>

    <div class="relative flex-1">
      <div
        class="overflow-y-auto absolute top-0 right-0 bottom-0 left-0 overflow-x-clip bg-base-100"
      >
        <div class="flex min-h-full">
          <div class="flex z-10 flex-col w-10 sm:w-40 min-h-full bg-base-200">
            <div class="relative">
              <TrackHeader
                v-for="track in tracks"
                :key="track.id"
                :track="track"
                :is-selected="selectedTrackRef?.id === track.id"
                v-on:track-delete="handleTrackDelete"
                v-on:select="handleTrackSelect"
              />
            </div>
          </div>
          <div class="flex z-0 flex-col flex-1">
            <div
              class="relative min-h-full"
              :style="{
                left: `${tracksPosition}px`,
              }"
            >
              <div class="relative">
                <AudioTrackView v-for="track in tracks" :key="track.id" :track="track" />
              </div>
              <div
                class="absolute top-0 w-[2px] bottom-0 bg-white/50 z-10"
                :style="{
                  left: `${cursorPosition}px`,
                }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
