<script setup lang="ts">
import AudioRecorder from "./AudioRecorder.vue";
</script>

<template>
  <div class="flex gap-1 p-2 bg-base-200">
    <AudioRecorder />
    <div class="divider divider-horizontal"></div>
    <button class="btn btn-square btn-primary size-16" title="Select sequences">
      <i class="iconify mdi--cursor-pointer size-10" />
    </button>
    <button class="btn btn-square size-16" title="Split sequence">
      <i class="iconify mdi--paper-cut-vertical size-10" />
    </button>
    <button class="btn btn-square size-16" title="Move sequences">
      <i class="iconify mdi--pan-horizontal size-10" />
    </button>
  </div>
</template>
