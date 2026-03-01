<script setup lang="ts">
import { inject, ref, computed, watch, onBeforeUnmount } from "vue";
import type { Ref } from "vue";
import { selectedTrackKey, playerKey, selectedInstrumentTrackKey, instrumentTracksKey } from "../lib/provider-keys";
import type { AudioTrack } from "../lib/audio/track";
import type { AudioPlayer } from "../lib/audio/player";
import type { InstrumentTrack } from "../lib/music/instrument-track";
import { MUSIC_INSTRUMENTS } from "../lib/music/instruments";

const selectedTrackRef = inject<Ref<AudioTrack | null>>(selectedTrackKey);
const selectedInstrumentTrackRef = inject<Ref<InstrumentTrack | null>>(selectedInstrumentTrackKey);
const instrumentTracks = inject<InstrumentTrack[]>(instrumentTracksKey) ?? [];
const player = inject<AudioPlayer>(playerKey);
if (!player) throw new Error("missing player");

const isOpen = ref(true);

// ─── Audio track state ────────────────────────────────────────────────────────

const currentAudioTrack = computed(() => selectedTrackRef?.value ?? null);

const trackName = ref("");
const trackVolume = ref(100);   // 0–100
const trackBalance = ref(0);    // -100–100
const trackMuted = ref(false);

const syncFromAudioTrack = (t: AudioTrack) => {
  trackName.value = t.name;
  trackVolume.value = Math.round(t.volume * 100);
  trackBalance.value = Math.round(t.balance * 100);
  trackMuted.value = t.muted;
};

let unsubscribeAudioTrack: (() => void) | null = null;

watch(currentAudioTrack, (track) => {
  unsubscribeAudioTrack?.();
  unsubscribeAudioTrack = null;
  if (track) {
    syncFromAudioTrack(track);
    const h = () => syncFromAudioTrack(track);
    track.addEventListener("change", h);
    unsubscribeAudioTrack = () => track.removeEventListener("change", h);
  }
}, { immediate: true });

onBeforeUnmount(() => {
  unsubscribeAudioTrack?.();
});

// ─── Instrument track state ───────────────────────────────────────────────────

const currentInstrumentTrack = computed(() => selectedInstrumentTrackRef?.value ?? null);

// ─── Which panel to show ──────────────────────────────────────────────────────

/** Show instrument panel when an instrument track is selected (audio deselected). */
const showInstrumentPanel = computed(() =>
  currentInstrumentTrack.value !== null && currentAudioTrack.value === null
);
const showAudioPanel = computed(() =>
  currentAudioTrack.value !== null
);
const showEmpty = computed(() =>
  !showAudioPanel.value && !showInstrumentPanel.value
);

// ─── Audio track handlers ─────────────────────────────────────────────────────

const handleToggleMute = () => {
  if (!currentAudioTrack.value) return;
  currentAudioTrack.value.muted = !currentAudioTrack.value.muted;
};

const handleVolumeInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  trackVolume.value = val;
  if (currentAudioTrack.value) currentAudioTrack.value.volume = val / 100;
};

const handleBalanceInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  trackBalance.value = val;
  if (currentAudioTrack.value) currentAudioTrack.value.balance = val / 100;
};

const handleDeleteAudioTrack = () => {
  if (!currentAudioTrack.value || !selectedTrackRef) return;
  player.removeTrack(currentAudioTrack.value);
  selectedTrackRef.value = null;
};

const balanceLabel = computed(() => {
  if (trackBalance.value < -10) return "L";
  if (trackBalance.value > 10) return "R";
  return "C";
});

// ─── Instrument track handlers ────────────────────────────────────────────────

const instrInstrument = computed(() =>
  currentInstrumentTrack.value
    ? MUSIC_INSTRUMENTS[currentInstrumentTrack.value.instrumentId]
    : null
);

const handleInstrToggleMute = () => {
  if (!currentInstrumentTrack.value) return;
  currentInstrumentTrack.value.muted = !currentInstrumentTrack.value.muted;
};

const handleInstrToggleLock = () => {
  if (!currentInstrumentTrack.value) return;
  currentInstrumentTrack.value.locked = !currentInstrumentTrack.value.locked;
};

const handleTimeSigNumeratorChange = (e: Event) => {
  if (!currentInstrumentTrack.value) return;
  const val = Number((e.target as HTMLSelectElement).value);
  currentInstrumentTrack.value.timeSignature = {
    ...currentInstrumentTrack.value.timeSignature,
    beatsPerMeasure: val,
  };
};

const handleTimeSigDenominatorChange = (e: Event) => {
  if (!currentInstrumentTrack.value) return;
  const val = Number((e.target as HTMLSelectElement).value);
  currentInstrumentTrack.value.timeSignature = {
    ...currentInstrumentTrack.value.timeSignature,
    beatUnit: val,
  };
};

const handleBpmInput = (e: Event) => {
  if (!currentInstrumentTrack.value) return;
  const val = Number((e.target as HTMLInputElement).value);
  if (val >= 20 && val <= 300) currentInstrumentTrack.value.bpm = val;
};

const handleInstrVolumeInput = (e: Event) => {
  if (!currentInstrumentTrack.value) return;
  const val = Number((e.target as HTMLInputElement).value);
  currentInstrumentTrack.value.volume = val / 100;
};

const handleDeleteInstrumentTrack = () => {
  if (!currentInstrumentTrack.value || !selectedInstrumentTrackRef) return;
  const idx = instrumentTracks.findIndex((t) => t.id === currentInstrumentTrack.value!.id);
  if (idx !== -1) instrumentTracks.splice(idx, 1);
  selectedInstrumentTrackRef.value = null;
};
</script>

<template>
  <aside
    class="flex flex-col shrink-0 overflow-hidden bg-base-200 border-l border-base-300/60 transition-[width] duration-200 ease-in-out"
    :style="{ width: isOpen ? '12rem' : '2rem' }"
  >
    <!-- Toggle button -->
    <button
      class="btn btn-ghost btn-xs h-8 w-full rounded-none border-b border-base-300/60 flex items-center justify-center shrink-0"
      :title="isOpen ? 'Collapse track properties' : 'Expand track properties'"
      v-on:click="isOpen = !isOpen"
    >
      <i :class="isOpen ? 'iconify mdi--chevron-right size-4' : 'iconify mdi--chevron-left size-4'" />
    </button>

    <!-- Content (only meaningful when open) -->
    <div class="flex flex-col flex-1 overflow-y-auto overflow-x-hidden min-w-0 p-2 gap-3">

      <!-- ── Nothing selected ────────────────────────────────────── -->
      <template v-if="showEmpty">
        <p class="text-xs text-base-content/30 italic leading-snug">
          Click a track to select it
        </p>
      </template>

      <!-- ── Audio track selected ───────────────────────────────── -->
      <template v-else-if="showAudioPanel">
        <!-- Track name -->
        <div class="flex items-center gap-1 min-w-0">
          <i class="iconify mdi--microphone size-3.5 text-accent shrink-0" />
          <span class="text-xs font-semibold truncate min-w-0" :title="trackName">
            {{ trackName }}
          </span>
        </div>

        <!-- Mute toggle -->
        <div class="flex items-center gap-2">
          <button
            :class="{
              'btn btn-xs btn-square': true,
              'btn-accent': !trackMuted,
              'btn-ghost text-base-content/30': trackMuted,
            }"
            :title="trackMuted ? 'Unmute' : 'Mute'"
            v-on:click="handleToggleMute"
          >
            <i :class="trackMuted ? 'iconify mdi--volume-off size-3.5' : 'iconify mdi--volume size-3.5'" />
          </button>
          <span class="text-xs text-base-content/50">{{ trackMuted ? 'Muted' : 'Active' }}</span>
        </div>

        <!-- Volume -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs text-base-content/50">Volume</span>
            <span class="text-xs tabular-nums text-base-content/70">{{ trackVolume }}%</span>
          </div>
          <input
            type="range"
            class="range range-xs range-primary w-full"
            min="0" max="100" step="1"
            :value="trackVolume"
            v-on:input="handleVolumeInput"
          />
        </div>

        <!-- Balance -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs text-base-content/50">Balance</span>
            <span class="text-xs tabular-nums text-base-content/70">{{ balanceLabel }}</span>
          </div>
          <input
            type="range"
            class="range range-xs w-full"
            min="-100" max="100" step="1"
            :value="trackBalance"
            v-on:input="handleBalanceInput"
          />
        </div>

        <!-- Delete -->
        <div class="mt-auto pt-2 border-t border-base-300/40">
          <button
            class="btn btn-xs btn-ghost text-error w-full gap-1"
            title="Delete track"
            v-on:click="handleDeleteAudioTrack"
          >
            <i class="iconify mdi--trash size-3.5" />
            Delete
          </button>
        </div>
      </template>

      <!-- ── Instrument track selected ──────────────────────────── -->
      <template v-else-if="showInstrumentPanel && currentInstrumentTrack && instrInstrument">
        <!-- Track name + instrument -->
        <div class="flex items-center gap-1 min-w-0">
          <i :class="`iconify ${instrInstrument.icon} size-3.5 text-accent shrink-0`" />
          <span class="text-xs font-semibold truncate min-w-0" :title="currentInstrumentTrack.name">
            {{ currentInstrumentTrack.name }}
          </span>
        </div>

        <!-- Instrument label -->
        <div class="flex items-center gap-1">
          <span class="text-xs text-base-content/40">Instrument</span>
          <span class="text-xs text-base-content/70 ml-auto">{{ instrInstrument.label }}</span>
        </div>

        <!-- Mute toggle -->
        <div class="flex items-center gap-2">
          <button
            :class="{
              'btn btn-xs btn-square': true,
              'btn-accent': !currentInstrumentTrack.muted,
              'btn-ghost text-base-content/30': currentInstrumentTrack.muted,
            }"
            :title="currentInstrumentTrack.muted ? 'Unmute' : 'Mute'"
            v-on:click="handleInstrToggleMute"
          >
            <i :class="currentInstrumentTrack.muted
              ? 'iconify mdi--volume-off size-3.5'
              : 'iconify mdi--volume size-3.5'" />
          </button>
          <span class="text-xs text-base-content/50">
            {{ currentInstrumentTrack.muted ? 'Muted' : 'Active' }}
          </span>
        </div>

        <!-- Volume -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs text-base-content/50">Volume</span>
            <span class="text-xs tabular-nums text-base-content/70">{{ Math.round(currentInstrumentTrack.volume * 100) }}%</span>
          </div>
          <input
            type="range"
            class="range range-xs range-primary w-full"
            min="0" max="100" step="1"
            :value="Math.round(currentInstrumentTrack.volume * 100)"
            v-on:input="handleInstrVolumeInput"
          />
        </div>

        <!-- View toggle: piano roll / waveform -->
        <div class="flex flex-col gap-1">
          <span class="text-xs text-base-content/50">View</span>
          <div class="flex rounded-lg overflow-hidden border border-base-300/60">
            <button
              :class="{
                'flex-1 flex items-center justify-center gap-1 py-1 text-xs transition-colors': true,
                'bg-primary text-primary-content': !currentInstrumentTrack.showWaveform,
                'bg-base-100 text-base-content/50 hover:bg-base-200': currentInstrumentTrack.showWaveform,
              }"
              title="Piano roll"
              v-on:click="() => { if (currentInstrumentTrack) currentInstrumentTrack.showWaveform = false }"
            >
              <i class="iconify mdi--piano size-3" />
              <span>Roll</span>
            </button>
            <button
              :class="{
                'flex-1 flex items-center justify-center gap-1 py-1 text-xs transition-colors': true,
                'bg-primary text-primary-content': currentInstrumentTrack.showWaveform,
                'bg-base-100 text-base-content/50 hover:bg-base-200': !currentInstrumentTrack.showWaveform,
              }"
              title="Waveform"
              v-on:click="() => { if (currentInstrumentTrack) currentInstrumentTrack.showWaveform = true }"
            >
              <i class="iconify mdi--waveform size-3" />
              <span>Wave</span>
            </button>
          </div>
        </div>

        <!-- BPM -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="text-xs text-base-content/50">Tempo</span>
            <span class="text-xs tabular-nums text-base-content/70">{{ currentInstrumentTrack.bpm }} BPM</span>
          </div>
          <input
            type="range"
            class="range range-xs range-primary w-full"
            min="20" max="300" step="1"
            :value="currentInstrumentTrack.bpm"
            v-on:input="handleBpmInput"
          />
        </div>

        <!-- Time signature (editable) -->
        <div class="flex flex-col gap-1">
          <span class="text-xs text-base-content/50">Time sig.</span>
          <div class="flex items-center gap-1">
            <select
              class="select select-xs flex-1 bg-base-100 text-xs tabular-nums"
              :value="currentInstrumentTrack.timeSignature.beatsPerMeasure"
              v-on:change="handleTimeSigNumeratorChange"
            >
              <option v-for="n in [2,3,4,5,6,7,8,9,12]" :key="n" :value="n">{{ n }}</option>
            </select>
            <span class="text-xs text-base-content/40">/</span>
            <select
              class="select select-xs flex-1 bg-base-100 text-xs tabular-nums"
              :value="currentInstrumentTrack.timeSignature.beatUnit"
              v-on:change="handleTimeSigDenominatorChange"
            >
              <option v-for="d in [2,4,8,16]" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
        </div>

        <!-- Lock -->
        <div class="flex items-center gap-2">
          <button
            :class="{
              'btn btn-xs btn-square': true,
              'btn-warning': currentInstrumentTrack.locked,
              'btn-ghost text-base-content/30': !currentInstrumentTrack.locked,
            }"
            :title="currentInstrumentTrack.locked ? 'Unlock track' : 'Lock track'"
            v-on:click="handleInstrToggleLock"
          >
            <i :class="currentInstrumentTrack.locked
              ? 'iconify mdi--lock size-3.5'
              : 'iconify mdi--lock-off size-3.5'" />
          </button>
          <span class="text-xs text-base-content/50">
            {{ currentInstrumentTrack.locked ? 'Locked' : 'Unlocked' }}
          </span>
        </div>

        <!-- Delete -->
        <div class="mt-auto pt-2 border-t border-base-300/40">
          <button
            class="btn btn-xs btn-ghost text-error w-full gap-1"
            title="Delete track"
            v-on:click="handleDeleteInstrumentTrack"
          >
            <i class="iconify mdi--trash size-3.5" />
            Delete
          </button>
        </div>
      </template>

    </div>
  </aside>
</template>
