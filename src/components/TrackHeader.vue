<script setup lang="ts">
import { ref } from "vue";
import type { AudioTrack } from "../lib/audio/track";

const props = defineProps<{
  track: AudioTrack;
}>();

const isMuted = ref(props.track.muted);
const isLocked = ref(props.track.locked);

const handleToggleMute = () => {
  props.track.muted = !props.track.muted;
  isMuted.value = props.track.muted;
};
const handleToggleLock = () => {
  props.track.locked = !props.track.locked;
  isLocked.value = props.track.locked;
};
</script>

<template>
  <div class="flex flex-col gap-4 p-1 h-48 border border-primary">
    <div class="flex gap-1">
      <button
        class="btn btn-xs btn-square btn-outline btn-error"
        title="Delete track"
      >
        <i class="iconify mdi--trash size-4" />
      </button>
      <div class="truncate" :title="`Track: ${track.name}`">
        {{ track.name }}
      </div>
    </div>
    <div class="grid grid-cols-2">
      <button
        :class="{
          'btn btn-sm btn-square btn-outline self-center': true,
          'btn-accent': !isMuted,
        }"
        :title="isMuted ? 'Muted' : 'Unmuted'"
        v-on:click="handleToggleMute"
      >
        <i v-if="!isMuted" class="iconify mdi--volume size-4" />
        <i v-else class="iconify mdi--volume-off size-4" />
      </button>
      <button
        :class="{
          'btn btn-sm btn-square btn-outline self-center': true,
          'btn-accent': isLocked,
        }"
        :title="isLocked ? 'Locked' : 'Unlocked'"
        v-on:click="handleToggleLock"
      >
        <i v-if="isLocked" class="iconify mdi--lock size-4" />
        <i v-else class="iconify mdi--lock-off size-4" />
      </button>
    </div>
  </div>
</template>
