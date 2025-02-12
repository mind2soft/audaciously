<script setup lang="ts">
import { inject, ref } from "vue";
import { playerKey, recorderKey } from "../lib/provider-keys";

import { createAudioTrack } from "../lib/audio/track";
import { createBufferAudioSequence } from "../lib/audio/sequence";

import type { Recorder } from "../lib/audio/recorder";
import type { AudioPlayer } from "../lib/audio/player";
import type { AudioTrack } from "../lib/audio/track";

const recorder = inject<Recorder>(recorderKey);
const player = inject<AudioPlayer>(playerKey);

if (!recorder) {
  throw new Error("missing recorder");
} else if (!player) {
  throw new Error("missing player");
}

const recorderState = ref(recorder.state);
const dummyTrack = ref<AudioTrack>();
const recordingStart = ref<number>(0);

const handleUpdateRecorderState = () => {
  recorderState.value = recorder.state;
};

recorder.addEventListener("ready", handleUpdateRecorderState);
recorder.addEventListener("record", () => {
  //dummyTrack.value = createDummyTrack("Recording");
  recordingStart.value = player.currentTime;

  //player.addTrack(dummyTrack.value);
  //player.play();

  handleUpdateRecorderState();
});
recorder.addEventListener("pause", handleUpdateRecorderState);
recorder.addEventListener("resume", handleUpdateRecorderState);
recorder.addEventListener("stop", () => {
  player.stop();
  if (dummyTrack.value) {
    player.removeTrack(dummyTrack.value);
  }

  handleUpdateRecorderState();
});
recorder.addEventListener("error", handleUpdateRecorderState);
recorder.addEventListener("data", () => {
  recorder.getAudioBuffer().then(
    (buffer) => {
      const track = createAudioTrack("test");

      track.addSequence(
        createBufferAudioSequence(buffer, recordingStart.value)
      );

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
  <button
    :class="{
      'btn btn-square size-16': true,
      'text-red-500': recorderState === 'recording',
    }"
    title="Record new sequence"
    v-on:click="handleRecordToggle"
  >
    <i class="iconify mdi--record size-10" />
  </button>
</template>
