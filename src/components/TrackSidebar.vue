<script setup lang="ts">
import { inject, ref, computed, watch, onBeforeUnmount } from "vue";
import type { Ref } from "vue";
import { selectedTrackKey, playerKey } from "../lib/provider-keys";
import type { AudioTrack } from "../lib/audio/track";
import type { AudioPlayer } from "../lib/audio/player";

const selectedTrackRef = inject<Ref<AudioTrack | null>>(selectedTrackKey);
const player = inject<AudioPlayer>(playerKey);
if (!player) throw new Error("missing player");

const isOpen = ref(true);

const currentTrack = computed(() => selectedTrackRef?.value ?? null);

// Local reactive copies kept in sync with track "change" events
const trackName = ref("");
const trackVolume = ref(100);   // 0–100
const trackBalance = ref(0);    // -100–100
const trackMuted = ref(false);

const syncFromTrack = (t: AudioTrack) => {
  trackName.value = t.name;
  trackVolume.value = Math.round(t.volume * 100);
  trackBalance.value = Math.round(t.balance * 100);
  trackMuted.value = t.muted;
};

let unsubscribeTrack: (() => void) | null = null;

watch(currentTrack, (track) => {
  unsubscribeTrack?.();
  unsubscribeTrack = null;
  if (track) {
    syncFromTrack(track);
    const h = () => syncFromTrack(track);
    track.addEventListener("change", h);
    unsubscribeTrack = () => track.removeEventListener("change", h);
  }
}, { immediate: true });

onBeforeUnmount(() => unsubscribeTrack?.());

// --- Handlers ---
const handleToggleMute = () => {
  if (!currentTrack.value) return;
  currentTrack.value.muted = !currentTrack.value.muted;
};

const handleVolumeInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  trackVolume.value = val;
  if (currentTrack.value) currentTrack.value.volume = val / 100;
};

const handleBalanceInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  trackBalance.value = val;
  if (currentTrack.value) currentTrack.value.balance = val / 100;
};

const handleDeleteTrack = () => {
  if (!currentTrack.value || !selectedTrackRef) return;
  player.removeTrack(currentTrack.value);
  selectedTrackRef.value = null;
};

const balanceLabel = computed(() => {
  if (trackBalance.value < -10) return "L";
  if (trackBalance.value > 10) return "R";
  return "C";
});
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
      <!-- No track selected -->
      <template v-if="!currentTrack">
        <p class="text-xs text-base-content/30 italic leading-snug">
          Click a track to select it
        </p>
      </template>

      <!-- Track selected -->
      <template v-else>
        <!-- Track name -->
        <div class="flex items-center gap-1 min-w-0">
          <i class="iconify mdi--waveform size-3.5 text-accent shrink-0" />
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
            v-on:click="handleDeleteTrack"
          >
            <i class="iconify mdi--trash size-3.5" />
            Delete
          </button>
        </div>
      </template>
    </div>
  </aside>
</template>
