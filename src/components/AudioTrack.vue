<script setup lang="ts">
import { inject, ref, computed, onMounted, onUnmounted } from "vue";
import { playerKey, timelineKey } from "../lib/provider-keys";
import TrackWaveformView from "./TrackWaveformView.vue";
import type { AudioTrack } from "../lib/audio/track";
import type { AudioPlayer } from "../lib/audio/player";
import type { Timeline } from "../lib/timeline";
import type { BufferedAudioSequence } from "../lib/audio/sequence";
import { formatTimeToPixel } from "../lib/util/formatTime";

const props = defineProps<{
  track: AudioTrack<any>;
  isSelected: boolean;
}>();

const EXPANDED_HEIGHT = 192; // px  (h-48)
const COLLAPSED_HEIGHT = 32; // px  (h-8)

const player = inject<AudioPlayer>(playerKey);
const timeline = inject<Timeline>(timelineKey);

if (!player) {
  throw new Error("missing player");
} else if (!timeline) {
  throw new Error("missing timeline");
}

const sequences = ref<BufferedAudioSequence<any>[]>(
  Array.from(props.track.getSequences()) as BufferedAudioSequence<any>[],
);

/**
 * Mirror of timeline.ratio — updated via the "change" event so that all
 * computed properties (e.g. baseWidth) re-evaluate reactively on zoom.
 */
const timelineRatio = ref(timeline.ratio);

/** Pixels per second at the current zoom level — reactive via timelineRatio. */
const baseWidth = computed(() => formatTimeToPixel(timelineRatio.value, 1));

const cursorPosition = ref<number>(
  formatTimeToPixel(timeline.ratio, player.currentTime),
);

/**
 * Mirrors timeline.offsetTime in pixels so the outer wrapper can apply
 * `translateX(+timelineOffsetPx)` to cancel the parent column's
 * `left: -timelineOffsetPx` shift, keeping the `overflow-hidden` clip box
 * aligned with the viewport regardless of scroll position.
 */
const timelineOffsetPx = ref<number>(
  formatTimeToPixel(timeline.ratio, timeline.offsetTime),
);

const handleUpdateSequences = () => {
  sequences.value = Array.from(
    props.track.getSequences(),
  ) as BufferedAudioSequence<any>[];
};

/**
 * Refresh both the cursor position and the sequences array.
 *
 * Refreshing sequences on every tick is necessary for live RecordingSequences
 * whose `playbackDuration` getter is wall-clock-driven (not reactive).
 * Without this, the recording block stays zero-width until the next
 * `bufferupdate` chunk fires a `track.change` event (~2 s intervals).
 * For static sequences the operation is cheap: same object references, new
 * array wrapper — Vue's v-for key diffing skips all DOM mutations.
 */
const handleUpdateCursor = () => {
  cursorPosition.value = formatTimeToPixel(timeline.ratio, player.currentTime);
  sequences.value = Array.from(
    props.track.getSequences(),
  ) as BufferedAudioSequence<any>[];
};

const handleTimelineChange = () => {
  timelineRatio.value = timeline.ratio;
  timelineOffsetPx.value = formatTimeToPixel(
    timeline.ratio,
    timeline.offsetTime,
  );
  handleUpdateCursor();
};

/**
 * When the player emits `change` (e.g. a track was added/removed), refresh
 * the sequences list in addition to the cursor so newly-added sequences are
 * immediately visible.
 */
const handlePlayerChange = () => {
  handleUpdateSequences();
  handleUpdateCursor();
};

// Register all listeners in onMounted so the component is fully initialised
// before receiving events — matches the pattern in InstrumentTrackView.vue.
onMounted(() => {
  props.track.addEventListener("change", handleUpdateSequences);

  player.addEventListener("timeupdate", handleUpdateCursor);
  player.addEventListener("change", handlePlayerChange);
  player.addEventListener("seek", handleUpdateCursor);
  player.addEventListener("stop", handleUpdateCursor);

  timeline.addEventListener("change", handleTimelineChange);
});

onUnmounted(() => {
  props.track.removeEventListener("change", handleUpdateSequences);

  player.removeEventListener("timeupdate", handleUpdateCursor);
  player.removeEventListener("change", handlePlayerChange);
  player.removeEventListener("seek", handleUpdateCursor);
  player.removeEventListener("stop", handleUpdateCursor);

  timeline.removeEventListener("change", handleTimelineChange);
});
</script>

<template>
  <!--
    The outer wrapper counter-translates by +timelineOffsetPx to cancel the
    parent column's `left: -timelineOffsetPx` shift (applied in AudioTracks.vue).
    This repositions the `overflow-hidden` clip box back to the viewport origin
    so waveform content is never incorrectly clipped during horizontal scroll.
    TrackWaveformView then re-applies -timelineOffsetPx so sequences render at
    the correct scrolled position within that clip box.
  -->
  <div
    class="overflow-hidden border-b border-base-300/60 transition-[height] duration-200 ease-in-out"
    :style="{
      height: `${isSelected ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT}px`,
      transform: `translateX(${timelineOffsetPx}px)`,
    }"
  >
    <TrackWaveformView
      :sequences="sequences"
      :base-width="baseWidth"
      :cursor-position="cursorPosition"
      :muted="track.muted"
      :timeline-offset-px="timelineOffsetPx"
    />
  </div>
</template>
