<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";
import { playerKey } from "../lib/provider-keys";
import { formatTime } from "../lib/util/formatTime";
/* @ts-ignore */
import { linearPath } from "waveform-path";
import type { AudioPlayer, AudioPlayerTImeUpdateEvent } from "../lib/audio/player";
import { patchSettings } from "../lib/settings";
import AudioRecorder from "./AudioRecorder.vue";

const player = inject<AudioPlayer>(playerKey);

if (!player) {
  throw new Error("missing player");
}

const svgRef = ref<SVGSVGElement>();
const svgPathRef = ref<SVGPathElement>();
const svgStopEnd = ref<SVGStopElement>();
const svgStopStart = ref<SVGStopElement>();

const inputVolumeRef = ref<HTMLInputElement>();

const isPlaying = ref(player.state === "playing");
const isPaused = ref(player.state === "paused");
const currentFrame = ref<AudioBuffer>();
const currentTime = ref(player.currentTime);
const totalDuration = ref(player.totalDuration);

onMounted(() => {
  if (inputVolumeRef.value) {
    inputVolumeRef.value.value = String(player.volume * 100);
  }
});

const handlePlay = () => {
  isPlaying.value = true;
  isPaused.value = false;
};
const handlePause = () => {
  isPlaying.value = false;
  isPaused.value = true;
};
const handleStop = () => {
  isPlaying.value = false;
  isPaused.value = false;
  currentTime.value = player.currentTime;
  currentFrame.value = undefined;

  handleAnalyserUpdate();
};
const handleChange = () => {
  totalDuration.value = player.totalDuration;
};
const handleTimeUpdate = (event: AudioPlayerTImeUpdateEvent) => {
  currentTime.value = player.currentTime;
  currentFrame.value = event.audioFrame;
  totalDuration.value = player.totalDuration;

  handleAnalyserUpdate();
};
const handleSeek = () => {
  currentTime.value = player.currentTime;
};
const handleVolumeChange = () => {
  if (inputVolumeRef.value) {
    inputVolumeRef.value.value = String(player.volume * 100);
  }
};

player.addEventListener("play", handlePlay);
player.addEventListener("pause", handlePause);
player.addEventListener("stop", handleStop);
player.addEventListener("change", handleChange);
player.addEventListener("timeupdate", handleTimeUpdate);
player.addEventListener("seek", handleSeek);
player.addEventListener("volumechange", handleVolumeChange);

const getPath = (audioBuffer: AudioBuffer, svg: SVGSVGElement) => {
  return linearPath(audioBuffer, {
    samples: svg.clientWidth / 2,
    type: "mirror",
    top: 0,
    height: svg.clientHeight,
    width: svg.clientWidth,
    paths: [{ d: "V", sy: 0, x: 50, ey: 100 }],
    animation: false,
    normalize: false,
  }) as string;
};

const handleAnalyserUpdate = () => {
  const audioBuffer = currentFrame.value;

  if (svgRef.value && svgPathRef.value) {
    if (audioBuffer?.length) {
      const path = getPath(audioBuffer, svgRef.value);

      svgPathRef.value.setAttribute("d", path);
    } else {
      svgPathRef.value.removeAttribute("d");
    }
  }

  if (svgStopEnd.value && svgStopStart.value) {
    const progress =
      player.totalDuration > 0
        ? (player.currentTime / player.totalDuration) * 100
        : 0;

    svgStopEnd.value.setAttribute("offset", `${progress}%`);
    svgStopStart.value.setAttribute(
      "offset",
      `${Math.min(progress + 1, 100)}%`
    );
  }
};

const handlePlayToggle = () => {
  if (player.state === "playing") {
    player.pause();
  } else {
    player.play().then(
      () => {
        //console.log("playing...");
      },
      (err: any) => {
        console.error(err);
      }
    );
  }
};
const handleStopClick = () => {
  player.stop();
};
const handleVolumeInput = () => {
  const inputValue = inputVolumeRef.value?.valueAsNumber ?? 0;
  player.volume = inputValue / 100;
  patchSettings({ volume: player.volume });
};

const resizeObserver = new ResizeObserver(handleAnalyserUpdate);

onMounted(() => {
  if (!svgRef.value) return;

  resizeObserver.observe(svgRef.value);
  handleAnalyserUpdate();
});
onBeforeUnmount(() => {
  if (svgRef.value) {
    resizeObserver.unobserve(svgRef.value);
  }

  player.removeEventListener("play", handlePlay);
  player.removeEventListener("pause", handlePause);
  player.removeEventListener("stop", handleStop);
  player.removeEventListener("change", handleChange);
  player.removeEventListener("timeupdate", handleTimeUpdate);
  player.removeEventListener("seek", handleSeek);
  player.removeEventListener("volumechange", handleVolumeChange);
});
</script>

<template>
  <div class="flex h-14 gap-2 items-center px-3 bg-base-200 border-b border-base-300/60">
    <!-- Transport controls: Stop | Play/Pause | Record -->
    <div class="flex gap-1 items-center">
      <button
        :class="{
          'btn btn-square': true,
          'btn-neutral': isPlaying || isPaused,
          'btn-ghost': !isPlaying && !isPaused,
        }"
        title="Stop"
        v-on:click="handleStopClick"
        :disabled="!isPlaying && !isPaused"
      >
        <i class="iconify mdi--stop size-5" />
      </button>
      <button
        :class="{
          'btn btn-square': true,
          'btn-warning': isPlaying,
          'btn-success': !isPlaying,
        }"
        title="Play / Pause"
        v-on:click="handlePlayToggle"
      >
        <i v-if="isPlaying" class="iconify mdi--pause size-5" />
        <i v-else class="iconify mdi--play size-5" />
      </button>
      <AudioRecorder :is-player-playing="isPlaying" />
    </div>

    <!-- Divider -->
    <div class="w-px h-8 bg-base-300/60 mx-1"></div>

    <!-- Timecode -->
    <div class="flex items-center font-mono text-sm tabular-nums text-base-content/70">
      <span>{{ formatTime(currentTime) }}</span>
      <span class="px-1 opacity-40">/</span>
      <span>{{ formatTime(totalDuration) }}</span>
    </div>

    <!-- Waveform preview (hidden on mobile) -->
    <div class="hidden md:flex flex-1 items-center max-w-48 px-1">
      <svg ref="svgRef" class="w-full h-9">
        <defs>
          <linearGradient
            id="waveformgrad"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
            gradientUnits="objectBoundingBox"
          >
            <stop offset="0%" stop-color="var(--color-accent)" />
            <stop
              ref="svgStopEnd"
              offset="0%"
              stop-color="var(--color-accent)"
            />
            <stop
              ref="svgStopStart"
              offset="0%"
              stop-color="var(--color-base-content)"
            />
            <stop offset="100%" stop-color="var(--color-base-content)" />
          </linearGradient>
        </defs>
        <path
          ref="svgPathRef"
          class="stroke-1 fill-none"
          stroke="url(#waveformgrad)"
        />
      </svg>
    </div>

    <!-- BPM placeholder (future tempo control) -->
    <div class="hidden md:flex items-center gap-1 text-sm text-base-content/40 font-mono ml-auto">
      <i class="iconify mdi--metronome size-5" />
      <span>120 BPM</span>
    </div>

    <!-- Divider -->
    <div class="w-px h-8 bg-base-300/60 mx-1"></div>

    <!-- Volume -->
    <div class="flex items-center gap-2 min-w-0">
      <i class="iconify mdi--volume-medium size-5 text-base-content/50 shrink-0" />
      <input
        ref="inputVolumeRef"
        type="range"
        min="0"
        max="200"
        v-on:input="handleVolumeInput"
        class="range range-sm w-24"
      />
    </div>
  </div>
</template>
