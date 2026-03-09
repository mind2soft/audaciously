<script setup lang="ts">
import { inject, onBeforeUnmount, ref } from "vue";
import { playerKey, recorderKey } from "../lib/provider-keys";

import { createRecordedTrack } from "../lib/audio/track/recorded/recorded-track";
import { createRecordedSequence } from "../lib/audio/sequence/recorded/recorded-sequence";

import { createRecordingSequence } from "../lib/audio/sequence/recorded/recording-sequence";
import type { RecordingSequence } from "../lib/audio/sequence/recorded/index";
import type {
  Recorder,
  RecorderBufferUpdateEvent,
} from "../lib/audio/recorder";
import type { AudioPlayer } from "../lib/audio/player";
import type { RecordedAudioTrack } from "../lib/audio/track/recorded/recorded-track";

// W-11: Maximum recording duration (4 hours) to auto-stop runaway recordings.
const MAX_RECORDING_MS = 4 * 60 * 60 * 1000;

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
const recordingTrack = ref<RecordedAudioTrack>();
const recordingSequence = ref<RecordingSequence>();
const recordingStart = ref<number>(0);

// W-10: Re-entrancy guard — prevents concurrent handleRecord invocations.
let recordingInFlight = false;
// W-11: Timer ID for the maximum-duration auto-stop.
let maxDurationTimer: ReturnType<typeof setTimeout> | undefined;

const handleUpdateRecorderState = () => {
  recorderState.value = recorder.state;
};

const handleRecord = async () => {
  // W-10: Guard against re-entrant calls (double-click, keyboard shortcut).
  if (recordingInFlight) return;
  recordingInFlight = true;

  // Capture the track reference before async work so we can roll it back on error (W-12).
  let addedTrack: RecordedAudioTrack | undefined;

  try {
    recordingStart.value = player.currentTime;

    recordingSequence.value = createRecordingSequence(recordingStart.value);

    recordingTrack.value = createRecordedTrack(`Track ${player.trackCount + 1}`);
    recordingTrack.value.addSequence(recordingSequence.value);

    addedTrack = recordingTrack.value;
    player.addTrack(addedTrack);

    // W-11: Schedule auto-stop after maximum recording duration.
    maxDurationTimer = setTimeout(() => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, MAX_RECORDING_MS);

    // Await playback start so the recording timestamp and playback are
    // synchronised (player.play() returns a Promise that resolves once the
    // AudioContext has been resumed and playback has begun).
    await player.play();

    handleUpdateRecorderState();
  } catch (err) {
    // W-12: Roll back the orphaned track if it was added before the error.
    if (addedTrack) {
      try {
        player.removeTrack(addedTrack);
      } catch {
        // Best-effort removal; ignore secondary errors.
      }
      recordingTrack.value = undefined;
    }
    // W-11: Clear the timer if playback never started.
    if (maxDurationTimer !== undefined) {
      clearTimeout(maxDurationTimer);
      maxDurationTimer = undefined;
    }
    throw err;
  } finally {
    recordingInFlight = false;
  }
};

const handleRecorderStop = () => {
  player.pause();

  // W-11: Clear the auto-stop timer when recording ends normally.
  if (maxDurationTimer !== undefined) {
    clearTimeout(maxDurationTimer);
    maxDurationTimer = undefined;
  }

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
          createRecordedSequence(buffer, recordingStart.value),
        );

        recordingTrack.value = undefined;
      }
    },
    (err) => {
      console.error(err);
    },
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
  // W-11: Clean up any pending auto-stop timer.
  if (maxDurationTimer !== undefined) {
    clearTimeout(maxDurationTimer);
  }
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
