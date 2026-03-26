<script setup lang="ts">
/**
 * SequenceEffectsPanel — post-mix timeline effects (right column of Row 3).
 *
 * Wraps controls/EffectsPipeline and wires it to useSequenceStore.timelineEffects.
 */

import { computed } from "vue";
import type { AudioEffect } from "../../features/effects/types";
import { usePlayerStore } from "../../stores/player";
import { useSequenceStore } from "../../stores/sequence";
import EffectsPipeline from "../controls/EffectsPipeline.vue";

const sequence = useSequenceStore();
const player = usePlayerStore();

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
      :currentTime="player.currentTime"
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
