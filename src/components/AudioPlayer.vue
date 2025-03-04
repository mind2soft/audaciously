<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";
import { playerKey } from "../lib/provider-keys";
import { formatTime } from "../lib/util/formatTime";
/* @ts-ignore */
import { linearPath } from "waveform-path";
import type { AudioPlayer } from "../lib/audio/player";

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

player.addEventListener("play", () => {
  isPlaying.value = true;
  isPaused.value = false;
});
player.addEventListener("pause", () => {
  isPlaying.value = false;
  isPaused.value = true;
});
player.addEventListener("stop", () => {
  isPlaying.value = false;
  isPaused.value = false;
  currentTime.value = player.currentTime;
  currentFrame.value = undefined;

  handleAnalyserUpdate();
});
player.addEventListener("change", () => {
  totalDuration.value = player.totalDuration;
});
player.addEventListener("timeupdate", (event) => {
  currentTime.value = player.currentTime;
  currentFrame.value = event.audioFrame;
  totalDuration.value = player.totalDuration;

  handleAnalyserUpdate();
});
player.addEventListener("seek", () => {
  currentTime.value = player.currentTime;
});
player.addEventListener("volumechange", () => {
  if (inputVolumeRef.value) {
    inputVolumeRef.value.value = String(player.volume * 100);
  }
});

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
const handleStop = () => {
  player.stop();
};
const handleVolumeChange = () => {
  const inputValue = inputVolumeRef.value?.valueAsNumber ?? 0;
  player.volume = inputValue / 100;
};

const resizeObserver = new ResizeObserver(handleAnalyserUpdate);

onMounted(() => {
  if (!svgRef.value) return;

  resizeObserver.observe(svgRef.value);
  handleAnalyserUpdate();
});
onBeforeUnmount(() => {
  if (!svgRef.value) return;

  resizeObserver.unobserve(svgRef.value);
});
</script>

<template>
  <div class="flex gap-3 items-center px-4 bg-base-200">
    <button class="btn btn-circle btn-lg" v-on:click="handlePlayToggle">
      <i v-if="isPlaying" class="iconify mdi--pause size-8" />
      <i v-else class="iconify mdi--play size-8" />
    </button>
    <button
      class="btn btn-circle btn-md"
      v-on:click="handleStop"
      :disabled="!isPlaying && !isPaused"
    >
      <i class="iconify mdi--stop size-4" />
    </button>
    <div class="flex flex-nowrap font-mono">
      <div>
        {{ formatTime(currentTime) }}
      </div>
      <div class="px-2">/</div>
      <div>
        {{ formatTime(totalDuration) }}
      </div>
    </div>

    <div class="flex-1 xs:hidden md:block">
      <svg ref="svgRef" class="px-2 w-full h-10 max-w-48">
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
    <div>
      <input
        ref="inputVolumeRef"
        type="range"
        min="0"
        max="200"
        v-on:input="handleVolumeChange"
        class="range range-sm"
      />
    </div>
  </div>
</template>
