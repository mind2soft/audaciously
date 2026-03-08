<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import type { InstrumentAudioTrack } from "../lib/audio/track/instrument";
import {
  MUSIC_INSTRUMENTS,
  filterPitchesByOctaveRange,
  type OctaveRange,
} from "../lib/music/instruments";

const props = defineProps<{
  track: InstrumentAudioTrack;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  select: [InstrumentAudioTrack | null];
}>(); 

const instrument = computed(() => MUSIC_INSTRUMENTS[props.track.instrumentId]);

/** Each pitch row is always exactly 16 px tall when expanded. */
const NOTE_HEIGHT_PX = 16;

/**
 * Fixed expanded height when in waveform view — matches AudioTrack.vue.
 * Must stay in sync with InstrumentTrackView.vue.
 */
const WAVEFORM_EXPANDED_HEIGHT = 192; // px

/**
 * Mirror of track.showWaveform — kept in sync via the track's "change" event
 * so that computed expandedHeight re-evaluates when the value changes.
 */
const showWaveform = ref(props.track.showWaveform);
const octaveRange = ref<OctaveRange>({ ...props.track.octaveRange });

const syncFromTrack = () => {
  showWaveform.value = props.track.showWaveform;
  octaveRange.value = { ...props.track.octaveRange };
};

onMounted(() => {
  props.track.addEventListener("change", syncFromTrack);
});
onUnmounted(() => {
  props.track.removeEventListener("change", syncFromTrack);
});

/**
 * Filtered pitch list based on octave range (piano only).
 * Drives both the expanded height and the pitch label rows.
 */
const filteredPitches = computed(() =>
  instrument.value.id === "piano"
    ? filterPitchesByOctaveRange(instrument.value.pitches, octaveRange.value)
    : instrument.value.pitches,
);

/**
 * Total expanded height: one 16 px row per visible pitch (piano roll mode).
 * Must stay in sync with InstrumentTrackView.vue.
 */
const expandedHeight = computed(() =>
  showWaveform.value
    ? WAVEFORM_EXPANDED_HEIGHT
    : filteredPitches.value.length * NOTE_HEIGHT_PX,
);

/** Row height in expanded mode — always 16 px (plain number). */
const dynamicRowHeight = NOTE_HEIGHT_PX;

const handleHeaderClick = () => {
  if (props.track.locked) return;
  emit("select", props.isSelected ? null : props.track);
};
</script>

<template>
  <div
    data-track-header
    :class="{
      'relative flex border-b group overflow-hidden transition-all duration-200 ease-in-out': true,
      'cursor-pointer': !track.locked,
      'cursor-default': track.locked,
      'bg-base-300 ring-1 ring-inset ring-accent/40 border-accent/30':
        isSelected,
      'bg-base-200 hover:bg-base-300/50 border-base-300/60':
        !isSelected && !track.locked,
      'bg-base-200 border-base-300/60': !isSelected && track.locked,
    }"
    :style="{ height: isSelected ? `${expandedHeight}px` : '32px' }"
    v-on:click="handleHeaderClick"
  >
    <!-- Mobile strip (<640px) -->
    <div
      class="flex sm:hidden flex-col items-center justify-center w-full gap-2 py-1"
    >
      <div
        :class="{
          'h-0.5 w-5 rounded-sm transition-colors': true,
          'bg-primary': isSelected,
          'bg-error': !isSelected && track.muted,
          'bg-base-content/15': !isSelected && !track.muted,
        }"
      />
      <i :class="`iconify ${instrument.icon} size-3 text-base-content/40`" />
    </div>

    <!-- Desktop: pitch labels — only rendered when expanded and in piano roll mode -->
    <div
      v-if="isSelected && !showWaveform"
      class="hidden sm:block absolute inset-0 overflow-hidden"
    >
      <div class="absolute top-0 left-0 right-0">
        <div
          v-for="pitch in filteredPitches"
          :key="pitch.id"
          :style="{ height: `${dynamicRowHeight}px` }"
          :class="{
            'flex items-center px-1 border-b text-right justify-end leading-none overflow-hidden': true,
            'border-base-300/30': true,
            'bg-base-100/30 text-base-content/70 font-medium':
              !pitch.id.includes('#'),
            'bg-base-300/20 text-base-content/30': pitch.id.includes('#'),
          }"
        >
          <span v-if="dynamicRowHeight >= 8" class="truncate text-[10px]">
            {{ pitch.short ?? pitch.label }}
          </span>
        </div>
      </div>
    </div>

    <!-- Desktop: waveform mode placeholder — shown instead of pitch rows -->
    <div
      v-if="isSelected && showWaveform"
      class="hidden sm:flex absolute inset-0 items-center justify-center overflow-hidden pointer-events-none"
    >
      <span
        class="text-[10px] text-base-content/30 tracking-widest uppercase select-none"
        >Waveform</span
      >
    </div>

    <!-- Desktop: track name row — always visible, vertically centered, respects left strip -->
    <div
      class="hidden sm:flex absolute top-0 left-1 right-0 z-10 items-center gap-1 pl-0 pr-1"
      :style="{
        height: isSelected ? 'auto' : '100%',
        paddingTop: isSelected ? '4px' : '0',
        paddingBottom: isSelected ? '4px' : '0',
      }"
    >
      <span
        data-drag-handle="true"
        class="iconify mdi--drag-vertical size-3.5 text-base-content/30 hover:text-base-content/60 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
        v-on:click.stop
      />
      <i
        :class="`iconify ${instrument.icon} size-3.5 text-base-content/40 shrink-0`"
      />
      <span
        class="truncate text-xs font-medium text-base-content/80 flex-1 min-w-0"
        :title="track.name"
        >{{ track.name }}</span
      >
    </div>

    <!-- Desktop: status indicators (locked / muted) — bottom strip when expanded -->
    <div
      v-if="isSelected && (track.locked || track.muted)"
      class="hidden sm:flex absolute bottom-0 left-0 right-0 z-10 items-center gap-1 px-2 py-0.5 bg-base-200/70"
    >
      <i
        v-if="track.locked"
        class="iconify mdi--lock size-3 text-warning"
        title="Locked"
      />
      <span v-if="track.locked" class="text-xs text-warning/60 leading-none"
        >Locked</span
      >
      <i
        v-if="track.muted"
        class="iconify mdi--volume-off size-3 text-base-content/30"
        title="Muted"
      />
    </div>

    <!-- Left accent strip -->
    <div
      :class="{
        'hidden sm:block absolute left-0 top-0 bottom-0 w-1 transition-colors': true,
        'bg-primary': isSelected,
        'bg-error': !isSelected && track.muted,
        'bg-base-content/15': !isSelected && !track.muted,
      }"
    />
  </div>
</template>
