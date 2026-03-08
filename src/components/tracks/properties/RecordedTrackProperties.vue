<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import type { RecordedAudioTrack } from "../../../lib/audio/track/recorded/recorded-track";

const props = defineProps<{ track: RecordedAudioTrack }>();

// ─── Reactive state ───────────────────────────────────────────────────────────

const volume = ref(Math.round(props.track.volume * 100));
const balance = ref(Math.round(props.track.balance * 100));

const syncFromTrack = () => {
  volume.value = Math.round(props.track.volume * 100);
  balance.value = Math.round(props.track.balance * 100);
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

const balanceLabel = computed(() => {
  if (balance.value < -10) return "L";
  if (balance.value > 10) return "R";
  return "C";
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

const handleVolumeInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  volume.value = val;
  props.track.volume = val / 100;
};

const handleBalanceInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  balance.value = val;
  props.track.balance = val / 100;
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

  <!-- Balance -->
  <div class="flex flex-col gap-1">
    <div class="flex items-center justify-between">
      <span class="text-xs text-base-content/50">Balance</span>
      <span class="text-xs tabular-nums text-base-content/70">{{ balanceLabel }}</span>
    </div>
    <input
      type="range"
      class="range range-xs w-full"
      min="-100"
      max="100"
      step="1"
      :value="balance"
      v-on:input="handleBalanceInput"
    />
  </div>
</template>
