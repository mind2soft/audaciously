<script setup lang="ts">
import AudioPlayer from "./components/AudioPlayer.vue";
import ProjectHeader from "./components/ProjectHeader.vue";
import AudioTracks from "./components/AudioTracks.vue";
import Toolbar from "./components/Toolbar.vue";
import SideMenu from "./components/SideMenu.vue";
</script>

<template>
  <SideMenu>
    <header>
      <ProjectHeader />
    </header>

    <main>
      <AudioPlayer />
      <AudioTracks />
    </main>

    <footer><Toolbar /></footer>
  </SideMenu>
</template>
