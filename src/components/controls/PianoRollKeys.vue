<script setup lang="ts">
/**
 * PianoRollKeys — sticky left-hand pitch-label strip for PianoRoll.
 *
 * Clicking a key plays a short preview tone via useNotePreview.
 *
 * Props
 * ─────
 * pitches      Ordered list of pitches (top → bottom), same order as the roll rows.
 * rowHeightPx  Height of each pitch row in pixels.
 * widthPx      Width of the key strip in pixels.
 */

import { ref } from "vue";
import type { InstrumentPitch } from "../../lib/music/instruments";
import { useNotePreview } from "../../composables/useNotePreview";

const props = defineProps<{
  pitches: InstrumentPitch[];
  rowHeightPx: number;
  widthPx: number;
  /** When true, key clicks are suppressed (e.g. during playback). */
  disabled?: boolean;
}>();

const { playNote } = useNotePreview();

/** Pitch ID of the currently depressed key, or null when no key is held. */
const pressedId = ref<string | null>(null);

function onKeyDown(pitch: InstrumentPitch): void {
  if (props.disabled) return;
  pressedId.value = pitch.id;
  playNote(pitch.id);
}

function onKeyUp(): void {
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
      :key="pitch.id"
      class="shrink-0 flex items-center justify-end pr-1 text-xs leading-none select-none"
      :class="{
        // Disabled state (during playback)
        'cursor-not-allowed opacity-50': props.disabled,
        // Natural key idle
        'cursor-pointer text-base-content/70 hover:bg-primary/20 hover:text-primary':
          !props.disabled && !pitch.id.includes('#') && pressedId !== pitch.id,
        // Sharp key idle
        'cursor-pointer text-base-content/40 bg-base-300/30 hover:bg-primary/20 hover:text-primary':
          !props.disabled && pitch.id.includes('#') && pressedId !== pitch.id,
        // Any key pressed
        'bg-primary/30 text-primary': !props.disabled && pressedId === pitch.id,
        // Disabled natural key (preserve sharp tint distinction)
        'text-base-content/70': props.disabled && !pitch.id.includes('#'),
        'text-base-content/40 bg-base-300/30': props.disabled && pitch.id.includes('#'),
      }"
      :style="{ height: `${props.rowHeightPx}px` }"
      @mousedown="onKeyDown(pitch)"
      @mouseup="onKeyUp"
      @mouseleave="onKeyUp"
    >
      {{ pitch.short ?? pitch.label }}
    </div>
  </div>
</template>
