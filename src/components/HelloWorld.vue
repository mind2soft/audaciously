<script setup lang="ts">
import { inject, ref } from "vue";
import { playerKey, recorderKey } from "../lib/provider-keys";

import AudioPlayerView from "./AudioPlayer.vue";
import AudioTracks from "./AudioTracks.vue";

import type { Recorder } from "../lib/audio/recorder";
import type { AudioPlayer } from "../lib/audio/player";
import { createAudioTrack } from "../lib/audio/track";
import { createAudioSequence } from "../lib/audio/sequence";

defineProps<{ msg: string }>();

const recorder = inject<Recorder>(recorderKey);
const player = inject<AudioPlayer>(playerKey);

if (!recorder) {
  throw new Error("missing recorder");
}
if (!player) {
  throw new Error("missing player");
}

const recorderState = ref(recorder.state);

recorder.addEventListener("ready", () => {
  recorderState.value = recorder.state;
});
recorder.addEventListener("error", () => {
  recorderState.value = recorder.state;
});
recorder.addEventListener("data", () => {
  recorder.getAudioBuffer().then(
    (buffer) => {
      const track = createAudioTrack("test");

      track.addSequence(createAudioSequence(buffer, 0));

      player.addTrack(track);
    },
    (err) => {
      console.error(err);
    }
  );
});

const handleRecordToggle = () => {
  if (recorder.state === "ready") {
    recorder.record(2000);
  } else if (recorder.state === "recording") {
    recorder.stop();
  }
};
</script>

<template>
  <h1 class="text-center">{{ msg }}</h1>

  <div class="card">
    <p class="flex items-center card-body">
      Recorder state :
      <code>{{ recorderState }}</code>
    </p>
  </div>

  <div class="card">
    <div class="card-body">
      <button
        class="btn"
        v-on:click="handleRecordToggle"
        :disabled="recorderState === 'error'"
      >
        REC
      </button>
      <AudioPlayerView />
      <AudioTracks />
    </div>
  </div>
</template>
