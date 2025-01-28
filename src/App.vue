<script setup lang="ts">
import AudioPlayer from "./components/AudioPlayer.vue";
import AudioRecorder from "./components/AudioRecorder.vue";
import AudioTracks from "./components/AudioTracks.vue";
import Toolbar from "./components/Toolbar.vue";
</script>

<template>
  <header>
    <AudioRecorder />
  </header>

  <main>
    <AudioPlayer />
    <AudioTracks />
  </main>

  <footer><Toolbar /></footer>
</template>
