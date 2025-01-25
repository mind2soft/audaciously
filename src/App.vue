<script setup lang="ts">
import AudioPlayer from "./components/AudioPlayer.vue";
import AudioRecorder from "./components/AudioRecorder.vue";
import AudioTracks from "./components/AudioTracks.vue";
</script>

<template>
  <header>
    <AudioRecorder />
  </header>

  <main>
    <AudioPlayer />
    <AudioTracks />
  </main>
</template>
