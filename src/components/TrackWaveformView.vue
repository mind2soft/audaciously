<script setup lang="ts">
import AudioSequenceVue from "./AudioSequence.vue";
import type { BufferedAudioSequence } from "../lib/audio/sequence";

/**
 * Reusable waveform renderer for any track type (recorded or instrument).
 *
 * The parent's outer wrapper MUST apply `transform: translateX(+timelineOffsetPx)`
 * to cancel the `AudioTracks.vue` column's `left: -timelineOffsetPx` shift and
 * move the `overflow-hidden` clip box back to the viewport origin.
 * This component then counters that with `translateX(-timelineOffsetPx)` so
 * sequences scroll correctly within the now-correctly-placed clip box.
 */
defineProps<{
  sequences: BufferedAudioSequence<any>[];
  baseWidth: number;
  cursorPosition: number;
  muted: boolean;
  timelineOffsetPx: number;
}>();
</script>

<template>
  <div
    class="flex relative flex-nowrap h-full"
    :style="{ transform: `translateX(${-timelineOffsetPx}px)` }"
  >
    <template v-if="sequences.length">
      <AudioSequenceVue
        v-for="seq in sequences"
        :key="seq.id"
        :base-width="baseWidth"
        :cursor-position="cursorPosition"
        :sequence="seq"
        :muted="muted"
      />
    </template>
    <div v-else class="flex h-full items-center px-4">
      <span class="text-xs text-base-content/25 italic"
        >No audio rendered yet</span
      >
    </div>
  </div>
</template>
