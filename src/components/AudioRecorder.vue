<script setup lang="ts">
import { inject, ref } from "vue";
import { playerKey, recorderKey } from "../lib/provider-keys";

import { createAudioTrack } from "../lib/audio/track";
import { createAudioSequence } from "../lib/audio/sequence";

import type { Recorder } from "../lib/audio/recorder";
import type { AudioPlayer } from "../lib/audio/player";

const recorder = inject<Recorder>(recorderKey);
const player = inject<AudioPlayer>(playerKey);

if (!recorder) {
  throw new Error("missing recorder");
} else if (!player) {
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
  <p class="flex items-center card-body">
    Recorder state :
    <code>{{ recorderState }}</code>
  </p>
  <button
    class="btn"
    v-on:click="handleRecordToggle"
    :disabled="recorderState === 'error'"
  >
    REC
  </button>
</template>
