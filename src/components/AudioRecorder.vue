<script setup lang="ts">
import { inject, ref } from "vue";
import { playerKey, recorderKey } from "../lib/provider-keys";

import { createAudioTrack } from "../lib/audio/track";
import { createAudioBufferSequence } from "../lib/audio/sequence/AudioBufferSequence";

import {
  createDummySequence,
  type DummySequence,
} from "../lib/audio/sequence/DummySequence";
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
const recordingTrack = ref<AudioTrack>();
const recordingSequence = ref<DummySequence>();
const recordingStart = ref<number>(0);

const handleUpdateRecorderState = () => {
  recorderState.value = recorder.state;
};

recorder.addEventListener("ready", handleUpdateRecorderState);
recorder.addEventListener("record", () => {
  recordingStart.value = player.currentTime;

  recordingSequence.value = createDummySequence(recordingStart.value);

  recordingTrack.value = createAudioTrack("test");
  recordingTrack.value.addSequence(recordingSequence.value);

  player.addTrack(recordingTrack.value);
  player.play();

  handleUpdateRecorderState();
});
recorder.addEventListener("pause", handleUpdateRecorderState);
recorder.addEventListener("resume", handleUpdateRecorderState);
recorder.addEventListener("stop", () => {
  player.pause();

  if (recordingTrack.value && recordingSequence.value) {
    recordingTrack.value.removeSequence(recordingSequence.value);
    recordingSequence.value = undefined;
  }

  handleUpdateRecorderState();
});
recorder.addEventListener("error", handleUpdateRecorderState);
recorder.addEventListener("data", () => {
  recorder.getAudioBuffer().then(
    (buffer) => {
      if (recordingTrack.value) {
        recordingTrack.value.addSequence(
          createAudioBufferSequence(buffer, recordingStart.value)
        );

        recordingTrack.value = undefined;
      }
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
      'btn btn-circle size-16': true,
      'border-white': recorderState !== 'recording',
      'btn-soft text-red-500 border-red-500': recorderState === 'recording',
    }"
    title="Record new sequence"
    v-on:click="handleRecordToggle"
  >
    <i class="iconify mdi--record size-10" />
  </button>
</template>
