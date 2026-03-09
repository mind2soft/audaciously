<script setup lang="ts">
import { inject, ref, computed, watch, onBeforeUnmount, onUpdated } from "vue";
import type { Ref } from "vue";
import { selectedTrackKey, playerKey } from "../lib/provider-keys";
import type { AudioTrack } from "../lib/audio/track";
import type { InstrumentAudioTrack } from "../lib/audio/track/instrument";
import type { RecordedAudioTrack } from "../lib/audio/track/recorded/recorded-track";
import type { AudioPlayer } from "../lib/audio/player";
import { MUSIC_INSTRUMENTS } from "../lib/music/instruments";
import RecordedTrackProperties from "./tracks/properties/RecordedTrackProperties.vue";
import InstrumentTrackProperties from "./tracks/properties/InstrumentTrackProperties.vue";

const selectedTrackRef = inject<Ref<AudioTrack<any> | null>>(selectedTrackKey);
const player = inject<AudioPlayer>(playerKey);
if (!player) throw new Error("missing player");

const isOpen = ref(true);

// ─── Current track ────────────────────────────────────────────────────────────

const currentTrack = computed(() => selectedTrackRef?.value ?? null);

const currentInstrumentTrack = computed(() =>
  currentTrack.value?.kind === "instrument"
    ? (currentTrack.value as InstrumentAudioTrack)
    : null,
);

const currentRecordedTrack = computed(() =>
  currentTrack.value?.kind === "recorded"
    ? (currentTrack.value as RecordedAudioTrack)
    : null,
);

// ─── Shared reactive state ────────────────────────────────────────────────────

const name = ref("");
const muted = ref(false);
const locked = ref(false);
const confirmingDelete = ref(false);

const syncFromTrack = (t: AudioTrack<any>) => {
  name.value = t.name;
  muted.value = t.muted;
  locked.value = t.locked;
};

let unsubscribeTrack: (() => void) | null = null;

watch(
  currentTrack,
  (track) => {
    confirmingDelete.value = false;
    unsubscribeTrack?.();
    unsubscribeTrack = null;
    if (track) {
      if (!isOpen.value) isOpen.value = true;
      syncFromTrack(track);
      const h = () => syncFromTrack(track);
      track.addEventListener("change", h);
      unsubscribeTrack = () => track.removeEventListener("change", h);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  unsubscribeTrack?.();
});

// ─── Track header (icon · badge) ─────────────────────────────────────────────

const instrInstrument = computed(() =>
  currentInstrumentTrack.value
    ? MUSIC_INSTRUMENTS[currentInstrumentTrack.value.instrumentId]
    : null,
);

const trackIcon = computed(() =>
  instrInstrument.value ? instrInstrument.value.icon : "mdi--microphone",
);

const trackBadge = computed(() =>
  instrInstrument.value ? instrInstrument.value.label : "Recorded Audio",
);

// ─── Name editing ─────────────────────────────────────────────────────────────

const editingName = ref(false);
const nameInputRef = ref<HTMLInputElement>();

const startEditName = () => {
  editingName.value = true;
};

const commitName = () => {
  editingName.value = false;
  if (!currentTrack.value) return;
  const trimmed = name.value.trim();
  if (trimmed) {
    currentTrack.value.name = trimmed;
  } else {
    name.value = currentTrack.value.name;
  }
};

onUpdated(() => {
  if (editingName.value && nameInputRef.value) {
    nameInputRef.value.focus();
    nameInputRef.value.select();
  }
});

// ─── Common handlers ──────────────────────────────────────────────────────────

const handleToggleMute = () => {
  if (!currentTrack.value) return;
  currentTrack.value.muted = !currentTrack.value.muted;
};

const handleToggleLock = () => {
  if (!currentTrack.value) return;
  currentTrack.value.locked = !currentTrack.value.locked;
};

const handleDeleteTrack = () => {
  if (!currentTrack.value || !selectedTrackRef) return;
  currentInstrumentTrack.value?.destroy();
  player.removeTrack(currentTrack.value);
  selectedTrackRef.value = null;
};
</script>

<template>
  <aside
    class="relative flex flex-col shrink-0 bg-base-200 transition-[width] duration-200 ease-in-out overflow-visible"
    :class="{ 'border-l border-base-300/60': isOpen }"
    :style="{ width: isOpen ? '18rem' : '0rem' }"
  >
    <!-- Floating handle — always visible, vertically centered -->
    <button
      class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full z-20 flex items-center justify-center w-5 h-12 bg-base-200 border border-base-300/60 border-r-0 rounded-l-lg shadow-md hover:bg-base-300 transition-colors"
      :title="isOpen ? 'Collapse track properties' : 'Expand track properties'"
      v-on:click="isOpen = !isOpen"
    >
      <i
        :class="
          isOpen
            ? 'iconify mdi--chevron-right size-4'
            : 'iconify mdi--chevron-left size-4'
        "
      />
    </button>

    <!-- Content (only meaningful when open) -->
    <div
      class="flex flex-col flex-1 overflow-y-auto overflow-x-hidden min-w-0 p-2 gap-3 w-72"
      :style="{
        opacity: isOpen ? '1' : '0',
        pointerEvents: isOpen ? 'auto' : 'none',
      }"
    >
      <!-- ── Nothing selected ────────────────────────────────────── -->
      <template v-if="!currentTrack">
        <p class="text-xs text-base-content/30 italic leading-snug m-auto">
          Click a track to select it
        </p>
      </template>

      <!-- ── Track selected ─────────────────────────────────────── -->
      <template v-else>
        <!-- Name row + badge -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-1">
            <span class="text-[10px] text-base-content/35">{{
              trackBadge
            }}</span>
          </div>

          <div class="flex items-center gap-1 min-w-0">
            <i :class="`iconify ${trackIcon} size-3.5 text-accent shrink-0`" />
            <template v-if="editingName">
              <input
                ref="nameInputRef"
                type="text"
                class="input input-xs input-ghost text-xs font-semibold flex-1 min-w-0 px-1"
                maxlength="40"
                v-model="name"
                v-on:blur="commitName"
                v-on:keydown.enter="commitName"
                v-on:keydown.escape="commitName"
              />
            </template>
            <button
              v-else
              class="btn btn-ghost btn-xs text-xs font-semibold truncate min-w-0 flex-1 justify-start px-1"
              :title="`${name} — click to rename`"
              v-on:click="startEditName"
            >
              {{ name }}
            </button>
          </div>
        </div>

        <!-- Mute + Lock row -->
        <div class="flex items-center gap-2">
          <button
            :class="{
              'btn btn-xs btn-square': true,
              'btn-accent': !muted,
              'btn-ghost text-base-content/30': muted,
            }"
            :title="muted ? 'Unmute' : 'Mute'"
            v-on:click="handleToggleMute"
          >
            <i
              :class="
                muted
                  ? 'iconify mdi--volume-off size-3.5'
                  : 'iconify mdi--volume size-3.5'
              "
            />
          </button>
          <button
            :class="{
              'btn btn-xs btn-square': true,
              'btn-warning': locked,
              'btn-ghost text-base-content/30': !locked,
            }"
            :title="locked ? 'Unlock track' : 'Lock track'"
            v-on:click="handleToggleLock"
          >
            <i
              :class="
                locked
                  ? 'iconify mdi--lock size-3.5'
                  : 'iconify mdi--lock-off size-3.5'
              "
            />
          </button>
          <span class="text-xs text-base-content/50">
            <template v-if="muted">Muted</template>
            <template v-else-if="locked">Locked</template>
            <template v-else>Active</template>
          </span>
        </div>

        <!-- Type-specific properties -->
        <RecordedTrackProperties
          v-if="currentRecordedTrack"
          :track="currentRecordedTrack"
        />
        <InstrumentTrackProperties
          v-else-if="currentInstrumentTrack"
          :track="currentInstrumentTrack"
        />

        <!-- Delete -->
        <div class="mt-auto pt-2 border-t border-base-300/40">
          <template v-if="confirmingDelete">
            <div class="flex items-center gap-2">
              <span class="text-xs text-error/80 flex-1">Delete track?</span>
              <button
                class="btn btn-xs btn-ghost"
                v-on:click="confirmingDelete = false"
              >
                Cancel
              </button>
              <button
                class="btn btn-xs btn-error"
                v-on:click="handleDeleteTrack"
              >
                Delete
              </button>
            </div>
          </template>
          <template v-else>
            <button
              class="btn btn-xs btn-ghost text-error w-full gap-1"
              title="Delete track"
              v-on:click="confirmingDelete = true"
            >
              <i class="iconify mdi--trash size-3.5" />
              Delete
            </button>
          </template>
        </div>
      </template>
    </div>
  </aside>
</template>
