<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import type { InstrumentAudioTrack } from "../../../lib/audio/track/instrument";
import { NOTE_TYPE_LIST, type NoteDuration } from "../../../lib/music/instruments";

const props = defineProps<{ track: InstrumentAudioTrack }>();

// ─── Step size filter ─────────────────────────────────────────────────────────

const DRUM_STEP_SIZES = new Set<NoteDuration>([
  "quarter",
  "eighth",
  "sixteenth",
  "thirty-second",
]);

const stepSizes = computed(() =>
  NOTE_TYPE_LIST.filter((nt) => DRUM_STEP_SIZES.has(nt.id)),
);

// ─── Reactive state ───────────────────────────────────────────────────────────

const selectedNoteType = ref<NoteDuration>(props.track.selectedNoteType);

const syncFromTrack = () => {
  selectedNoteType.value = props.track.selectedNoteType;
};

let unsubscribe: (() => void) | null = null;

watch(
  () => props.track,
  (track) => {
    unsubscribe?.();
    syncFromTrack();
    track.addEventListener("change", syncFromTrack);
    unsubscribe = () => track.removeEventListener("change", syncFromTrack);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  unsubscribe?.();
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

const handleSelectStepSize = (noteType: NoteDuration) => {
  selectedNoteType.value = noteType;
  props.track.selectedNoteType = noteType;
};
</script>

<template>
  <!-- ── Step Size ──────────────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-2 pt-1 border-t border-base-300/40">
    <span
      class="text-[10px] uppercase tracking-wider text-base-content/35 font-medium"
      >Step size</span
    >
    <div class="flex flex-wrap gap-1">
      <button
        v-for="nt in stepSizes"
        :key="nt.id"
        :class="{
          'btn btn-xs min-w-0 px-2 tabular-nums transition-colors': true,
          'btn-primary': selectedNoteType === nt.id,
          'btn-ghost text-base-content/50 hover:text-base-content/80':
            selectedNoteType !== nt.id,
        }"
        :title="`${nt.label} (${nt.fraction})`"
        v-on:click="handleSelectStepSize(nt.id)"
      >
        <span class="text-[10px] leading-none">{{ nt.fraction }}</span>
      </button>
    </div>
  </div>
</template>
