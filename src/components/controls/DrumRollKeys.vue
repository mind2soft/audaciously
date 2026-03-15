<script setup lang="ts">
/**
 * DrumRollKeys — sticky left-hand drum pad label strip for DrumRoll.
 *
 * Clicking a pad fires a short drum preview hit via useDrumPreview.
 *
 * Props
 * ─────
 * pitches      Ordered list of drum pads (top → bottom).
 * rowHeightPx  Height of each pad row in pixels.
 * widthPx      Width of the label strip in pixels.
 * disabled     When true, pad clicks are suppressed (e.g. during playback).
 */

import { ref } from "vue";
import type { InstrumentPitch } from "../../lib/music/instruments";
import { useDrumPreview } from "../../composables/useDrumPreview";

const props = defineProps<{
  pitches: InstrumentPitch[];
  rowHeightPx: number;
  widthPx: number;
  disabled?: boolean;
}>();

const { playHit } = useDrumPreview();

/** Pad ID currently held down, or null. */
const pressedId = ref<string | null>(null);

function onPadDown(pitch: InstrumentPitch): void {
  if (props.disabled) return;
  pressedId.value = pitch.key;
  playHit(pitch.key);
}

function onPadUp(): void {
  pressedId.value = null;
}
</script>

<template>
  <div
    class="sticky left-0 z-10 shrink-0 self-start overflow-hidden flex flex-col border-r border-base-300/60 bg-base-200"
    :style="{ width: `${props.widthPx}px` }"
  >
    <div
      v-for="pitch in props.pitches"
      :key="pitch.key"
      class="shrink-0 flex items-center px-2 text-xs leading-none select-none"
      :class="{
        // Disabled state (during playback)
        'cursor-not-allowed opacity-50 text-base-content/70': props.disabled,
        // Idle
        'cursor-pointer text-base-content/70 hover:bg-secondary/20 hover:text-secondary':
          !props.disabled && pressedId !== pitch.key,
        // Pressed
        'bg-secondary/30 text-secondary':
          !props.disabled && pressedId === pitch.key,
      }"
      :style="{ height: `${props.rowHeightPx}px` }"
      @mousedown="onPadDown(pitch)"
      @mouseup="onPadUp"
      @mouseleave="onPadUp"
    >
      {{ pitch.label }}
    </div>
  </div>
</template>
