<script setup lang="ts">
import { ref, reactive, provide, inject } from "vue";
import AudioPlayer from "./components/AudioPlayer.vue";
import ProjectHeader from "./components/ProjectHeader.vue";
import AudioTracks from "./components/AudioTracks.vue";
import BottomPanel from "./components/BottomPanel.vue";
import TrackSidebar from "./components/TrackSidebar.vue";
import SideMenu from "./components/SideMenu.vue";
import {
  selectedTrackKey,
  instrumentTracksKey,
  selectedInstrumentTrackKey,
  instrumentAudioTracksKey,
  playerKey,
} from "./lib/provider-keys";
import type { AudioTrack } from "./lib/audio/track";
import type { InstrumentTrack } from "./lib/music/instrument-track";
import type { AudioPlayer as AudioPlayerType } from "./lib/audio/player";
import { useInstrumentPlayback } from "./lib/music/useInstrumentPlayback";

const selectedTrack = ref<AudioTrack | null>(null);
provide(selectedTrackKey, selectedTrack);

const instrumentTracks = reactive<InstrumentTrack[]>([]);
provide(instrumentTracksKey, instrumentTracks);

const selectedInstrumentTrack = ref<InstrumentTrack | null>(null);
provide(selectedInstrumentTrackKey, selectedInstrumentTrack);

// Wire instrument tracks into the player via offline rendering.
// The composable returns a reactive map of hidden AudioTracks so the waveform
// view in InstrumentTrackView can look them up by instrument track id.
const player = inject<AudioPlayerType>(playerKey);
if (player) {
  const instrumentAudioTracks = useInstrumentPlayback(player, instrumentTracks as InstrumentTrack[]);
  provide(instrumentAudioTracksKey, instrumentAudioTracks);
}
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
