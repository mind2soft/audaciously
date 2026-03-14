<script setup lang="ts">
import { useNodesStore } from "../../../stores/nodes";
import type { InstrumentNode } from "../../../features/nodes";

const props = defineProps<{ node: InstrumentNode }>();
const nodes = useNodesStore();

function beatUnitLabel(unit: number): string {
  const map: Record<number, string> = {
    2: "Half note",
    4: "Quarter note",
    8: "Eighth note",
    16: "Sixteenth note",
  };
  return map[unit] ?? String(unit);
}

function onBpmInput(event: Event): void {
  const v = parseFloat((event.target as HTMLInputElement).value);
  if (!isNaN(v)) nodes.setInstrumentBpm(props.node.id, Math.max(20, Math.min(300, v)));
}

function onBeatsPerMeasureChange(event: Event): void {
  const v = parseInt((event.target as HTMLSelectElement).value, 10);
  if (!isNaN(v)) {
    nodes.setInstrumentTimeSignature(props.node.id, {
      ...props.node.timeSignature,
      beatsPerMeasure: v,
    });
  }
}

function onBeatUnitChange(event: Event): void {
  const v = parseInt((event.target as HTMLSelectElement).value, 10);
  if (!isNaN(v)) {
    nodes.setInstrumentTimeSignature(props.node.id, {
      ...props.node.timeSignature,
      beatUnit: v,
    });
  }
}
</script>

<template>
  <!-- Tempo & Meter — common section, shrink-0 so it never eats scroll space -->
  <div class="shrink-0 px-3 py-2 flex flex-col gap-2">
    <p class="text-[10px] uppercase tracking-wider text-base-content/35 font-medium">Tempo &amp; Meter</p>

    <!-- BPM slider row -->
    <div class="flex items-center gap-2">
      <span class="text-xs text-base-content/60 shrink-0 w-8">BPM</span>
      <input
        type="range"
        class="range range-xs range-primary flex-1"
        min="20"
        max="300"
        :value="node.bpm"
        @input="onBpmInput"
      />
      <span class="text-xs tabular-nums text-base-content/70 w-8 text-right">{{ node.bpm }}</span>
    </div>

    <!-- Time signature row -->
    <div class="flex items-center gap-1.5 text-xs text-base-content/60">
      <span class="shrink-0 w-8">Meter</span>
      <select
        class="select select-xs w-14 tabular-nums"
        :value="node.timeSignature.beatsPerMeasure"
        @change="onBeatsPerMeasureChange"
      >
        <option v-for="n in [2,3,4,5,6,7,8,9,12]" :key="n" :value="n">{{ n }}</option>
      </select>
      <span class="px-0.5">/</span>
      <select
        class="select select-xs"
        :value="node.timeSignature.beatUnit"
        @change="onBeatUnitChange"
      >
        <option v-for="d in [2,4,8,16]" :key="d" :value="d" :title="beatUnitLabel(d)">{{ d }}</option>
      </select>
    </div>
  </div>
</template>
