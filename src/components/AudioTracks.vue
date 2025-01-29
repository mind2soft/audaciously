<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from "vue";
import { playerKey, timelineKey } from "../lib/provider-keys";
import TimelineView from "./Timeline.vue";
import AudioTrackView from "./AudioTrack.vue";

import type { AudioPlayer } from "../lib/audio/player";
import type { AudioTrack } from "../lib/audio/track";
import {
  formatPixelToTime,
  formatTimeToPixel,
  ScaleDirection,
  scaleRatio,
  type Timeline,
} from "../lib/timeline";
import TrackHeader from "./TrackHeader.vue";

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
  if ((evt.target as HTMLDivElement).closest("[data-track-header]")) {
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

const handleUpdateCursor = () => {
  cursorPosition.value = formatTimeToPixel(timeline.ratio, player.currentTime);
};

player.addEventListener("change", () => {
  tracks.value = [...player.getTracks()];
  handleUpdateCursor();
});
player.addEventListener("timeupdate", handleUpdateCursor);
player.addEventListener("stop", handleUpdateCursor);

timeline.addEventListener("change", () => {
  tracksPosition.value = -formatTimeToPixel(
    timeline.ratio,
    timeline.offsetTime
  );
  handleUpdateCursor();
});

onMounted(() => {
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
});
onUnmounted(() => {
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
});
</script>

<template>
  <div
    class="flex flex-col flex-1"
    v-on:wheel="handleMouseWheel"
    v-on:mousedown="handleMouseDown"
  >
    <div class="grid grid-cols-[96px_auto]">
      <div></div>
      <div class="h-12">
        <TimelineView />
      </div>
    </div>

    <div class="relative flex-1">
      <div
        class="overflow-y-auto absolute top-0 right-0 bottom-0 left-0 overflow-x-clip bg-base-200"
      >
        <div class="relative grid grid-cols-[96px_auto]">
          <template v-for="track in tracks">
            <div class="z-20 bg-base-100" data-track-header>
              <TrackHeader :track="track" />
            </div>
            <div
              class="relative"
              :style="{
                left: `${tracksPosition}px`,
              }"
            >
              <AudioTrackView :track="track" />
              <div
                class="absolute top-0 w-[2px] h-full bg-white/50 z-10"
                :style="{
                  left: `${cursorPosition}px`,
                }"
              ></div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
