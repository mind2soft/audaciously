<script setup lang="ts">
/**
 * SequenceEffectsPanel — post-mix timeline effects (right column of Row 3).
 *
 * Wraps controls/EffectsPipeline and wires it to useSequenceStore.timelineEffects.
 */

import { storeToRefs } from "pinia";
import { computed, provide } from "vue";
import { PlaybackContextKey } from "../../composables/usePlaybackContext";
import type { AudioEffect } from "../../features/effects/types";
import { usePlayerStore } from "../../stores/player";
import { useSequenceStore } from "../../stores/sequence";
import EffectsPipeline from "../controls/effects/EffectsPipeline.vue";

const sequence = useSequenceStore();

// Provide playback context so EffectVolume in the subtree reads from the
// global timeline player when editing sequence-level effects.
const player = usePlayerStore();
const { currentTime: playerTime } = storeToRefs(player);
provide(PlaybackContextKey, {
  currentTime: playerTime,
  seek: (t: number) => player.seek(t),
});

const effects = computed(() => sequence.timelineEffects);
const maxDuration = computed(() => sequence.totalDuration || undefined);

function onUpdateEffects(next: AudioEffect[]): void {
  sequence.setTimelineEffects(next);
}
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden">
    <EffectsPipeline
      :effects="effects"
      :maxDuration="maxDuration"
      sourceLabel="Mix"
      sourceIcon="mdi--mixer"
      @update:effects="onUpdateEffects"
    >
      <template #source-properties>
        <div class="px-3 py-3 text-xs text-base-content/60 italic">
          Timeline mix — no editable properties
        </div>
      </template>
    </EffectsPipeline>
  </div>
</template>
