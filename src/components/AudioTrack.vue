<script setup lang="ts">
import { inject, ref } from "vue";
import { playerKey, timelineKey } from "../lib/provider-keys";
import Waveform from "./Waveform.vue";
import type { AudioTrack } from "../lib/audio/track";
import type { AudioPlayer } from "../lib/audio/player";
import {
  formatPixelToTime,
  formatTimeToPixel,
  ScaleDirection,
  scaleRatio,
  type TImeline,
} from "../lib/timeline";

defineProps<{
  track: AudioTrack;
}>();

const emit = defineEmits<{
  mousedown: [evt: MouseEvent];
}>();

const scale = 16;
const player = inject<AudioPlayer>(playerKey);
const timeline = inject<TImeline>(timelineKey);

if (!player) {
  throw new Error("missing player");
} else if (!timeline) {
  throw new Error("missing timeline");
}

const cursorRef = ref<HTMLDivElement>();
const trackOffset = ref<number>(
  -formatTimeToPixel(timeline.ratio, timeline.offsetTime)
);
const baseWidth = ref<number>(timeline.ratio * scale);

const updateCursor = () => {
  if (!cursorRef.value) {
    return;
  }

  const left = player.currentTime * baseWidth.value;

  cursorRef.value.style.left = `${left}px`;
};

const handleMouseDown = (evt: MouseEvent) => {
  emit("mousedown", evt);
};
const handleMouseWheel = (evt: WheelEvent) => {
  const delta = evt.deltaY;

  if (evt.shiftKey) {
    evt.preventDefault();
    evt.stopPropagation();

    const deltaPx = delta > 0 ? 64 : -64;

    timeline.offsetTime =
      timeline.offsetTime + formatPixelToTime(timeline.ratio, deltaPx);
  } else if (evt.ctrlKey) {
    evt.preventDefault();
    evt.stopPropagation();

    timeline.ratio = scaleRatio(
      timeline.ratio,
      delta > 0 ? ScaleDirection.UP : ScaleDirection.DOWN
    );
  }
};

player.addEventListener("timeupdate", updateCursor);
player.addEventListener("stop", updateCursor);

timeline.addEventListener("change", () => {
  baseWidth.value = timeline.ratio * scale;
  trackOffset.value = -formatTimeToPixel(timeline.ratio, timeline.offsetTime);
  updateCursor();
});
</script>

<template>
  <div class="pr-2">
    {{ track.name }}
  </div>
  <div
    class="overflow-hidden w-full h-48"
    v-on:mousedown="handleMouseDown"
    v-on:wheel="handleMouseWheel"
  >
    <div
      class="flex relative flex-nowrap h-full"
      :style="{
        left: `${trackOffset}px`,
      }"
    >
      <div
        v-for="sequence in track.getSequences()"
        class="absolute top-0 h-full"
        :style="{
          left: `${sequence.time * baseWidth}px`,
          minWidth: `${sequence.buffer.duration * baseWidth}px`,
          maxWidth: `${sequence.buffer.duration * baseWidth}px`,
        }"
      >
        <Waveform
          class="border border-yellow-400"
          :audio-buffer="sequence.buffer"
        />
      </div>
      <div ref="cursorRef" class="absolute w-[2px] h-full bg-white/50"></div>
    </div>
  </div>
</template>
