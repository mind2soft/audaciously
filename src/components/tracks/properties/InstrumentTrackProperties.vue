<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import type {
  InstrumentAudioTrack,
  TimeSignature,
} from "../../../lib/audio/track/instrument";
import { MUSIC_INSTRUMENTS } from "../../../lib/music/instruments";
import PianoTrackProperties from "./PianoTrackProperties.vue";
import DrumTrackProperties from "./DrumTrackProperties.vue";

const props = defineProps<{ track: InstrumentAudioTrack }>();

// ─── Reactive state ───────────────────────────────────────────────────────────

const volume = ref(Math.round(props.track.volume * 100));
const showWaveform = ref(props.track.showWaveform);
const bpm = ref(props.track.bpm);
const timeSignature = ref<TimeSignature>({ ...props.track.timeSignature });

const syncFromTrack = () => {
  volume.value = Math.round(props.track.volume * 100);
  showWaveform.value = props.track.showWaveform;
  bpm.value = props.track.bpm;
  timeSignature.value = { ...props.track.timeSignature };
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

const instrument = computed(() => MUSIC_INSTRUMENTS[props.track.instrumentId]);

// ─── Handlers ─────────────────────────────────────────────────────────────────

const handleVolumeInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  volume.value = val;
  props.track.volume = val / 100;
};

const handleBpmInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  if (val >= 20 && val <= 300) {
    bpm.value = val;
    props.track.bpm = val;
  }
};

const handleTimeSigNumeratorChange = (e: Event) => {
  const val = Number((e.target as HTMLSelectElement).value);
  props.track.timeSignature = { ...props.track.timeSignature, beatsPerMeasure: val };
};

const handleTimeSigDenominatorChange = (e: Event) => {
  const val = Number((e.target as HTMLSelectElement).value);
  props.track.timeSignature = { ...props.track.timeSignature, beatUnit: val };
};

const beatUnitLabel = (unit: number): string => {
  const map: Record<number, string> = {
    2: "Half note",
    4: "Quarter note",
    8: "Eighth note",
    16: "Sixteenth note",
  };
  return map[unit] ?? `1/${unit} note`;
};
</script>

<template>
  <!-- Volume -->
  <div class="flex flex-col gap-1">
    <div class="flex items-center justify-between">
      <span class="text-xs text-base-content/50">Volume</span>
      <span class="text-xs tabular-nums text-base-content/70">{{ volume }}%</span>
    </div>
    <input
      type="range"
      class="range range-xs range-primary w-full"
      min="0"
      max="100"
      step="1"
      :value="volume"
      v-on:input="handleVolumeInput"
    />
  </div>

  <!-- View toggle: piano roll / waveform -->
  <div class="flex flex-col gap-1">
    <span class="text-xs text-base-content/50">View</span>
    <div class="flex rounded-lg overflow-hidden border border-base-300/60">
      <button
        :class="{
          'flex-1 flex items-center justify-center gap-1 py-1 text-xs transition-colors': true,
          'bg-primary text-primary-content': !showWaveform,
          'bg-base-100 text-base-content/50 hover:bg-base-200': showWaveform,
        }"
        title="Piano roll"
        v-on:click="props.track.showWaveform = false"
      >
        <i :class="`iconify ${instrument.icon} size-3`" />
        <span>Roll</span>
      </button>
      <button
        :class="{
          'flex-1 flex items-center justify-center gap-1 py-1 text-xs transition-colors': true,
          'bg-primary text-primary-content': showWaveform,
          'bg-base-100 text-base-content/50 hover:bg-base-200': !showWaveform,
        }"
        title="Waveform"
        v-on:click="props.track.showWaveform = true"
      >
        <i class="iconify mdi--waveform size-3" />
        <span>Wave</span>
      </button>
    </div>
  </div>

  <!-- ── Tempo & Meter ──────────────────────────────────────────────────────── -->
  <div class="flex flex-col gap-2 pt-1 border-t border-base-300/40">
    <span
      class="text-[10px] uppercase tracking-wider text-base-content/35 font-medium"
      >Tempo &amp; Meter</span
    >

    <!-- BPM -->
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between">
        <span class="text-xs text-base-content/50">Tempo</span>
        <span class="text-xs tabular-nums text-base-content/70">{{ bpm }} BPM</span>
      </div>
      <input
        type="range"
        class="range range-xs range-primary w-full"
        min="20"
        max="300"
        step="1"
        :value="bpm"
        v-on:input="handleBpmInput"
      />
    </div>

    <!-- Beats per measure -->
    <div class="flex flex-col gap-1">
      <span class="text-xs text-base-content/50">Beats per measure</span>
      <select
        class="select select-xs flex-1 bg-base-100 text-xs tabular-nums"
        :value="timeSignature.beatsPerMeasure"
        v-on:change="handleTimeSigNumeratorChange"
      >
        <option v-for="n in [2, 3, 4, 5, 6, 7, 8, 9, 12]" :key="n" :value="n">
          {{ n }} beats
        </option>
      </select>
    </div>

    <!-- Beat unit -->
    <div class="flex flex-col gap-1">
      <span class="text-xs text-base-content/50">Beat unit</span>
      <select
        class="select select-xs flex-1 bg-base-100 text-xs"
        :value="timeSignature.beatUnit"
        v-on:change="handleTimeSigDenominatorChange"
      >
        <option v-for="d in [2, 4, 8, 16]" :key="d" :value="d">
          {{ beatUnitLabel(d) }} (1/{{ d }})
        </option>
      </select>
    </div>
  </div>

  <!-- ── Instrument-specific properties ────────────────────────────────────── -->
  <PianoTrackProperties v-if="track.instrumentId === 'piano'" :track="track" />
  <DrumTrackProperties v-else-if="track.instrumentId === 'drums'" :track="track" />
</template>
