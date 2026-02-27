<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import type { AudioTrack } from "../lib/audio/track";

export type DeleteTrackEvent = { track: AudioTrack };

const props = defineProps<{
  track: AudioTrack;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  trackDelete: [DeleteTrackEvent];
  select: [AudioTrack | null];
}>();

// Local reactive state — kept in sync via track's "change" event
const isMuted   = ref(props.track.muted);
const isLocked  = ref(props.track.locked);
const volume    = ref(props.track.volume);   // 0–1
const balance   = ref(props.track.balance);  // -1–1

const syncFromTrack = () => {
  isMuted.value  = props.track.muted;
  isLocked.value = props.track.locked;
  volume.value   = props.track.volume;
  balance.value  = props.track.balance;
};

onMounted(() => props.track.addEventListener("change", syncFromTrack));
onBeforeUnmount(() => props.track.removeEventListener("change", syncFromTrack));

const handleHeaderClick = () => {
  if (props.track.locked) return;
  emit("select", props.isSelected ? null : props.track);
};

const handleTrackDelete = () => emit("trackDelete", { track: props.track });

const handleToggleLock = () => {
  props.track.locked = !props.track.locked;
};
</script>

<template>
  <div
    data-track-header
    :class="{
      'relative flex h-48 border-b group transition-colors': true,
      'cursor-pointer': !isLocked,
      'cursor-default': isLocked,
      'bg-base-300 ring-1 ring-inset ring-accent/40 border-accent/30': isSelected,
      'bg-base-200 hover:bg-base-300/50 border-base-300/60': !isSelected && !isLocked,
      'bg-base-200 border-base-300/60': !isSelected && isLocked,
    }"
    v-on:click="handleHeaderClick"
  >
    <!-- Mobile strip (<640px) -->
    <div class="flex sm:hidden flex-col items-center justify-center w-full gap-2 py-1">
      <!-- Strip: primary when selected, red when muted, subtle otherwise -->
      <div
        :class="{
          'h-0.5 w-5 rounded-sm transition-colors': true,
          'bg-primary': isSelected,
          'bg-error': !isSelected && isMuted,
          'bg-base-content/15': !isSelected && !isMuted,
        }"
      />
      <button
        :class="{
          'btn btn-xs btn-square btn-ghost': true,
          'text-warning': isLocked,
          'text-base-content/25': !isLocked,
        }"
        :title="isLocked ? 'Unlock track' : 'Lock track'"
        v-on:click.stop="handleToggleLock"
      >
        <i v-if="isLocked" class="iconify mdi--lock size-3" />
        <i v-else class="iconify mdi--lock-off size-3" />
      </button>
    </div>

    <!-- Desktop layout (≥640px) -->
    <div class="hidden sm:flex flex-col w-full h-full px-2 py-2 gap-1 overflow-hidden">
      <!-- Row 1: type icon + name + delete -->
      <div class="flex items-center gap-1 min-w-0">
        <i class="iconify mdi--waveform size-3.5 text-base-content/40 shrink-0" />
        <span
          class="truncate text-xs font-medium text-base-content/80 flex-1 min-w-0"
          :title="track.name"
        >{{ track.name }}</span>
        <button
          class="btn btn-sm btn-square btn-ghost text-error opacity-0 group-hover:opacity-100 shrink-0"
          title="Delete track"
          v-on:click.stop="handleTrackDelete"
        >
          <i class="iconify mdi--trash size-4" />
        </button>
      </div>

      <!-- Middle: volume bar + balance indicator + muted icon -->
      <div class="flex flex-col flex-1 justify-center gap-2 py-1">

        <!-- Volume bar -->
        <div class="flex items-center gap-1.5">
          <i class="iconify mdi--volume size-3 text-base-content/30 shrink-0" />
          <div class="flex-1 h-1.5 bg-base-300 rounded-full overflow-hidden">
            <div
              class="h-full bg-primary/60 rounded-full transition-all"
              :style="{ width: `${volume * 100}%` }"
            />
          </div>
        </div>

        <!-- Balance indicator -->
        <div class="flex items-center gap-1.5">
          <i class="iconify mdi--pan-horizontal size-3 text-base-content/30 shrink-0" />
          <div class="flex-1 relative h-1.5">
            <!-- Track background -->
            <div class="absolute inset-0 bg-base-300 rounded-full" />
            <!-- Center tick -->
            <div class="absolute top-0 bottom-0 left-1/2 w-px bg-base-content/20 -translate-x-1/2" />
            <!-- Thumb -->
            <div
              class="absolute top-0 bottom-0 w-2 bg-secondary/70 rounded-full -translate-x-1/2 transition-all"
              :style="{ left: `${((balance + 1) / 2) * 100}%` }"
            />
          </div>
        </div>

        <!-- Muted watermark -->
        <div v-if="isMuted" class="flex items-center justify-center mt-1">
          <i class="iconify mdi--volume-off size-5 text-base-content/15" />
        </div>

      </div>

      <!-- Row 3: lock button + selected dot -->
      <div class="flex items-center mt-auto">
        <button
          :class="{
            'btn btn-xs btn-square btn-ghost': true,
            'text-warning': isLocked,
            'text-base-content/25': !isLocked,
          }"
          :title="isLocked ? 'Unlock track' : 'Lock track'"
          v-on:click.stop="handleToggleLock"
        >
          <i v-if="isLocked" class="iconify mdi--lock size-3" />
          <i v-else class="iconify mdi--lock-off size-3" />
        </button>
        <span v-if="isLocked" class="text-xs text-warning/60 ml-1 leading-none">Locked</span>
        <span v-if="isSelected" class="ml-auto text-accent text-xs leading-none">●</span>
      </div>
    </div>

    <!-- Left accent strip (desktop only) -->
    <div
      :class="{
        'hidden sm:block absolute left-0 top-0 bottom-0 w-1 transition-colors': true,
        'bg-primary': isSelected,
        'bg-error': !isSelected && isMuted,
        'bg-base-content/15': !isSelected && !isMuted,
      }"
    />
  </div>
</template>
