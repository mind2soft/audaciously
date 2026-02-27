<script setup lang="ts">
import { inject, onBeforeUnmount, ref } from "vue";
import { playerKey, recorderKey } from "../lib/provider-keys";

import { createAudioTrack } from "../lib/audio/track";
import { createAudioBufferSequence } from "../lib/audio/sequence/AudioBufferSequence";

import {
  createRecordingSequence,
  type RecordingSequence,
} from "../lib/audio/sequence/RecordingSequence";
import type { Recorder, RecorderBufferUpdateEvent } from "../lib/audio/recorder";
import type { AudioPlayer } from "../lib/audio/player";
import type { AudioTrack } from "../lib/audio/track";

const props = defineProps<{
  isPlayerPlaying?: boolean;
}>();

const recorder = inject<Recorder>(recorderKey);
const player = inject<AudioPlayer>(playerKey);

if (!recorder) {
  throw new Error("missing recorder");
} else if (!player) {
  throw new Error("missing player");
}

const recorderState = ref(recorder.state);
const recordingTrack = ref<AudioTrack>();
const recordingSequence = ref<RecordingSequence>();
const recordingStart = ref<number>(0);

const handleUpdateRecorderState = () => {
  recorderState.value = recorder.state;
};

const handleRecord = async () => {
  recordingStart.value = player.currentTime;

  recordingSequence.value = createRecordingSequence(recordingStart.value);

  recordingTrack.value = createAudioTrack("test");
  recordingTrack.value.addSequence(recordingSequence.value);

  player.addTrack(recordingTrack.value);
  // Await playback start so the recording timestamp and playback are
  // synchronised (player.play() returns a Promise that resolves once the
  // AudioContext has been resumed and playback has begun).
  await player.play();

  handleUpdateRecorderState();
};

const handleRecorderStop = () => {
  player.pause();

  if (recordingTrack.value && recordingSequence.value) {
    recordingTrack.value.removeSequence(recordingSequence.value);
    recordingSequence.value = undefined;
  }

  handleUpdateRecorderState();
};

const handleRecorderData = () => {
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
};

const handleBufferUpdate = (event: RecorderBufferUpdateEvent) => {
  recordingSequence.value?.updateBuffer(event.buffer);
};

recorder.addEventListener("ready", handleUpdateRecorderState);
recorder.addEventListener("record", handleRecord);
recorder.addEventListener("pause", handleUpdateRecorderState);
recorder.addEventListener("resume", handleUpdateRecorderState);
recorder.addEventListener("stop", handleRecorderStop);
recorder.addEventListener("error", handleUpdateRecorderState);
recorder.addEventListener("data", handleRecorderData);
recorder.addEventListener("bufferupdate", handleBufferUpdate);

onBeforeUnmount(() => {
  recorder.removeEventListener("ready", handleUpdateRecorderState);
  recorder.removeEventListener("record", handleRecord);
  recorder.removeEventListener("pause", handleUpdateRecorderState);
  recorder.removeEventListener("resume", handleUpdateRecorderState);
  recorder.removeEventListener("stop", handleRecorderStop);
  recorder.removeEventListener("error", handleUpdateRecorderState);
  recorder.removeEventListener("data", handleRecorderData);
  recorder.removeEventListener("bufferupdate", handleBufferUpdate);
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
      'btn btn-circle': true,
      'btn-error btn-outline': recorderState !== 'recording',
      'btn-error': recorderState === 'recording',
    }"
    :disabled="props.isPlayerPlaying && recorderState !== 'recording'"
    title="Record new sequence"
    v-on:click="handleRecordToggle"
  >
    <i
      :class="{
        'iconify mdi--record size-5': true,
        'animate-pulse': recorderState === 'recording',
      }"
    />
  </button>
</template>
