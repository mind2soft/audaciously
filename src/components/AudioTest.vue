<script setup lang="ts">
const emit = defineEmits<{ addTrack: [] }>();
</script>

<template>
  <button
    class="btn btn-sm btn-ghost"
    title="Add instrument track"
    v-on:click="emit('addTrack')"
  >
    <i class="iconify mdi--plus size-4" />
    <span class="hidden sm:inline">Add Track</span>
  </button>
</template>
