<script setup lang="ts">
import { ref, provide } from "vue";
import AudioPlayer from "./components/AudioPlayer.vue";
import ProjectHeader from "./components/ProjectHeader.vue";
import AudioTracks from "./components/AudioTracks.vue";
import BottomPanel from "./components/BottomPanel.vue";
import TrackSidebar from "./components/TrackSidebar.vue";
import SideMenu from "./components/SideMenu.vue";
import { selectedTrackKey } from "./lib/provider-keys";
import type { AudioTrack } from "./lib/audio/track";

const selectedTrack = ref<AudioTrack | null>(null);
provide(selectedTrackKey, selectedTrack);
</script>

<template>
  <SideMenu>
    <header class="flex flex-col">
      <ProjectHeader />
      <AudioPlayer />
    </header>

    <main>
      <div class="flex flex-row flex-1 min-h-0">
        <AudioTracks />
        <TrackSidebar />
      </div>
    </main>

    <footer><BottomPanel /></footer>
  </SideMenu>
</template>
