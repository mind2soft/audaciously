<script setup lang="ts">
import { computed } from "vue";
import type { InstrumentNode } from "../../../features/nodes";
import type { MusicInstrumentType, NoteDuration } from "../../../lib/music/instruments";
import { NOTE_TYPE_LIST } from "../../../lib/music/instruments";
import { useNodesStore } from "../../../stores/nodes";

const props = defineProps<{ node: InstrumentNode<MusicInstrumentType> }>();
const nodes = useNodesStore();

const DRUM_STEP_SIZES = new Set<NoteDuration>(["quarter", "eighth", "sixteenth", "thirty-second"]);

const drumStepItems = computed(() => NOTE_TYPE_LIST.filter((nt) => DRUM_STEP_SIZES.has(nt.id)));

function selectNoteType(type: NoteDuration): void {
  nodes.setInstrumentSelectedNoteType(props.node.id, type);
}
</script>

<template>
  <div class="px-3 py-2 flex flex-col gap-2 shrink-0">
    <p
      class="text-[10px] uppercase tracking-wider text-base-content/35 font-medium"
    >
      Step Size
    </p>
    <div class="flex flex-wrap gap-1">
      <button
        v-for="nt in drumStepItems"
        :key="nt.id"
        class="btn btn-xs"
        :class="node.selectedNoteType === nt.id ? 'btn-primary' : 'btn-ghost'"
        :title="nt.label"
        @click="selectNoteType(nt.id)"
      >
        {{ nt.fraction }}
      </button>
    </div>
  </div>
</template>
