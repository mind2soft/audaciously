<script setup lang="ts">
import AudioPlayer from "./components/AudioPlayer.vue";
import ProjectHeader from "./components/ProjectHeader.vue";
import AudioTracks from "./components/AudioTracks.vue";
import Toolbar from "./components/Toolbar.vue";
</script>

<template>
  <header>
    <ProjectHeader />
  </header>

  <main>
    <AudioPlayer />
    <AudioTracks />
  </main>

  <footer><Toolbar /></footer>
</template>
