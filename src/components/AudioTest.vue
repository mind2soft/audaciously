<script setup lang="ts">
/**
 *
 * THIS SHOULD BE REMOVED WHEN STABLE
 *
 */
import { inject } from "vue";
import { playerKey } from "../lib/provider-keys";
import { createAudioBufferSequence } from "../lib/audio/sequence/AudioBufferSequence";
import { createAudioTrack } from "../lib/audio/track";
import type { AudioPlayer } from "../lib/audio/player";

const baseUrl = import.meta.env.BASE_URL;

const player = inject<AudioPlayer>(playerKey);

if (!player) {
  throw new Error("missing player");
}

const loadMp3 = async (name: string, ...sources: string[]) => {
  const bufferData = await Promise.all(
    sources.map((source) =>
      fetch(`${baseUrl}/${source}`).then((res) => res.arrayBuffer())
    )
  );

  const ctx = new AudioContext();
  const track = createAudioTrack(name);
  let time = Math.random() * 2;

  for (const data of bufferData) {
    const buffer = await ctx.decodeAudioData(data);

    track.addSequence(createAudioBufferSequence(buffer, time));

    time = time + buffer.duration + 1 + Math.random() * 1;
  }

  player.addTrack(track);
};

const handleInit = async () => {
  const assets = [
    "/assets/audio/sample-3s.mp3",
    "/assets/audio/sample-4s.mp3",
    "/assets/audio/sample-9s.mp3",
    "/assets/audio/sample-19s.mp3",
  ];
  const sequenceCount = (1 + Math.random() * (assets.length - 1)) | 0;
  const sequences = Array.from({ length: sequenceCount }).map(
    () => assets[(Math.random() * assets.length) | 0]
  );

  await loadMp3("Test " + (player.trackCount + 1), ...sequences);
};
</script>

<template>
  <button
    class="h-16 btn"
    title="Add a new track with random sequences"
    v-on:click="handleInit"
  >
    TEST
  </button>
</template>
