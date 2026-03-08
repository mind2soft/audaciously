<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import type { InstrumentAudioTrack } from "../../../lib/audio/track/instrument";
import {
  NOTE_TYPE_LIST,
  type NoteDuration,
  type OctaveRange,
  PIANO_OCTAVE_MIN,
  PIANO_OCTAVE_MAX,
  PIANO_OCTAVE_PRESETS,
} from "../../../lib/music/instruments";

const props = defineProps<{ track: InstrumentAudioTrack }>();

// ─── Reactive state ───────────────────────────────────────────────────────────

const octaveRange = ref<OctaveRange>({ ...props.track.octaveRange });
const selectedNoteType = ref<NoteDuration>(props.track.selectedNoteType);

const syncFromTrack = () => {
  octaveRange.value = { ...props.track.octaveRange };
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

// ─── Computed ─────────────────────────────────────────────────────────────────

const octaveRangePct = computed(() => {
  const span = PIANO_OCTAVE_MAX - PIANO_OCTAVE_MIN;
  return {
    low: ((octaveRange.value.low - PIANO_OCTAVE_MIN) / span) * 100,
    high: ((octaveRange.value.high - PIANO_OCTAVE_MIN) / span) * 100,
  };
});

const rangeLabel = computed(() => {
  const { low, high } = octaveRange.value;
  return `C${low} \u2013 B${high} \u00b7 ${high - low + 1} oct`;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isActivePreset = (range: OctaveRange): boolean =>
  octaveRange.value.low === range.low && octaveRange.value.high === range.high;

// ─── Handlers ─────────────────────────────────────────────────────────────────

const handleOctaveLowChange = (e: Event) => {
  const low = Number((e.target as HTMLInputElement).value);
  const high = Math.max(low, octaveRange.value.high);
  const r: OctaveRange = { low, high };
  octaveRange.value = r;
  props.track.octaveRange = { ...r };
};

const handleOctaveHighChange = (e: Event) => {
  const high = Number((e.target as HTMLInputElement).value);
  const low = Math.min(high, octaveRange.value.low);
  const r: OctaveRange = { low, high };
  octaveRange.value = r;
  props.track.octaveRange = { ...r };
};

const handleOctavePreset = (range: OctaveRange) => {
  octaveRange.value = { ...range };
  props.track.octaveRange = { ...range };
};

const handleSelectNoteType = (noteType: NoteDuration) => {
  selectedNoteType.value = noteType;
  props.track.selectedNoteType = noteType;
};
</script>

<template>
  <!-- ── Note Range ─────────────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-2 pt-1 border-t border-base-300/40">
    <!-- Header: label + range text + preset dropdown -->
    <div class="flex items-center justify-between gap-1">
      <span
        class="text-[10px] uppercase tracking-wider text-base-content/35 font-medium"
        >Note Range</span
      >
      <div class="flex items-center gap-1.5">
        <span class="text-[10px] tabular-nums text-base-content/45">{{
          rangeLabel
        }}</span>
        <div class="dropdown dropdown-end">
          <button
            tabindex="0"
            class="btn btn-xs btn-ghost h-auto min-h-0 py-0.5 px-1.5 gap-0.5 text-[10px]"
            title="Range presets"
          >
            Presets <i class="iconify mdi--chevron-down size-2.5" />
          </button>
          <ul
            class="dropdown-content bg-base-100 border border-base-300/40 rounded-box shadow-lg z-20 w-44 p-1 flex flex-col gap-0.5"
          >
            <li v-for="preset in PIANO_OCTAVE_PRESETS" :key="preset.label">
              <button
                tabindex="0"
                class="w-full flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-base-200 transition-colors"
                :class="{
                  'text-primary': isActivePreset(preset.range),
                  'text-base-content/70': !isActivePreset(preset.range),
                }"
                v-on:click="handleOctavePreset(preset.range)"
              >
                <span class="font-medium">{{ preset.label }}</span>
                <span class="text-base-content/40 text-[10px]">{{
                  preset.title
                }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Dual-handle range slider -->
    <div class="relative h-5 flex items-center">
      <!-- Unfilled track -->
      <div class="absolute inset-x-0 h-2 rounded-full bg-primary/10" />
      <!-- Fill between handles -->
      <div
        class="absolute top-0 h-4 rounded-full bg-primary"
        :style="{
          left: `${octaveRangePct.low}%`,
          width: `${octaveRangePct.high - octaveRangePct.low}%`,
        }"
      />
      <input
        type="range"
        class="range range-primary range-xs dual-range-input"
        :style="{ zIndex: octaveRange.low >= octaveRange.high ? 5 : 3 }"
        :min="PIANO_OCTAVE_MIN"
        :max="PIANO_OCTAVE_MAX"
        step="1"
        :value="octaveRange.low"
        v-on:input="handleOctaveLowChange"
      />
      <input
        type="range"
        class="range range-primary range-xs dual-range-input"
        style="z-index: 4"
        :min="PIANO_OCTAVE_MIN"
        :max="PIANO_OCTAVE_MAX"
        step="1"
        :value="octaveRange.high"
        v-on:input="handleOctaveHighChange"
      />
    </div>

    <!-- Min/max octave labels -->
    <div class="flex justify-between text-[9px] text-base-content/25 -mt-1">
      <span>C{{ PIANO_OCTAVE_MIN }}</span>
      <span>C{{ PIANO_OCTAVE_MAX }}</span>
    </div>
  </div>

  <!-- ── Note Duration ──────────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-2 pt-1 border-t border-base-300/40">
    <span
      class="text-[10px] uppercase tracking-wider text-base-content/35 font-medium"
      >Note duration</span
    >
    <div class="flex flex-wrap gap-1">
      <button
        v-for="nt in NOTE_TYPE_LIST"
        :key="nt.id"
        :class="{
          'btn btn-xs min-w-0 px-2 tabular-nums transition-colors': true,
          'btn-primary': selectedNoteType === nt.id,
          'btn-ghost text-base-content/50 hover:text-base-content/80':
            selectedNoteType !== nt.id,
        }"
        :title="`${nt.label} note (${nt.fraction})`"
        v-on:click="handleSelectNoteType(nt.id)"
      >
        <span class="text-[10px] leading-none">{{ nt.fraction }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dual-range-input {
  /* Stretch to fill the container, overriding DaisyUI's width/height */
  position: absolute;
  inset-inline: 0;
  top: 0;
  bottom: 0;
  width: 100%;
  /* Disable DaisyUI's box-shadow fill trick — our div handles the fill */
  --range-fill: 0;
  /* Input itself is non-interactive; only the thumb receives events */
  pointer-events: none;
}

/* Hide DaisyUI's track — our bg-base-300 div is the visual track */
.dual-range-input::-webkit-slider-runnable-track {
  background: transparent;
}

.dual-range-input::-moz-range-track {
  background: transparent;
}

/* Re-enable pointer events on the thumb */
.dual-range-input::-webkit-slider-thumb {
  pointer-events: all;
  cursor: pointer;
}

.dual-range-input::-moz-range-thumb {
  pointer-events: all;
  cursor: pointer;
}
</style>
