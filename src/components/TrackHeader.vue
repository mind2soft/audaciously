<script setup lang="ts">
import type { AudioTrack } from "../lib/audio/track";

defineProps<{
  track: AudioTrack;
}>();
</script>

<template>
  <div class="h-48 ring">
    {{ track.name }}
  </div>
</template>
