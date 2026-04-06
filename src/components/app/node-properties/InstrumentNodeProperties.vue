<script setup lang="ts">
import { useInstrumentAudioNode } from "../../../composables/useInstrumentAudioNode";

const props = defineProps<{ nodeId: string }>();
const instrumentNode = useInstrumentAudioNode(props.nodeId);

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
  if (!Number.isNaN(v)) instrumentNode.setBpm(Math.max(20, Math.min(300, v)));
}

function onBeatsPerMeasureChange(event: Event): void {
  const v = parseInt((event.target as HTMLSelectElement).value, 10);
  if (!Number.isNaN(v)) {
    instrumentNode.setTimeSignature({
      ...instrumentNode.timeSignature.value,
      beatsPerMeasure: v,
    });
  }
}

function onBeatUnitChange(event: Event): void {
  const v = parseInt((event.target as HTMLSelectElement).value, 10);
  if (!Number.isNaN(v)) {
    instrumentNode.setTimeSignature({
      ...instrumentNode.timeSignature.value,
      beatUnit: v,
    });
  }
}
</script>

<template>
  <!-- Tempo & Meter — common section, shrink-0 so it never eats scroll space -->
  <div class="shrink-0 px-3 py-2 flex flex-col gap-2">
    <p
      class="text-[10px] uppercase tracking-wider text-base-content/35 font-medium"
    >
      Tempo &amp; Meter
    </p>

    <div class="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2">
      <!-- BPM label -->
      <span class="text-xs text-base-content/60">BPM</span>
      <!-- BPM control -->
      <div class="flex items-center gap-2">
        <input
          type="range"
          class="range range-xs range-primary flex-1"
          min="20"
          max="300"
          :value="instrumentNode.bpm.value"
          @input="onBpmInput"
        />
        <span
          class="text-xs tabular-nums text-base-content/70 w-8 text-right"
          >{{ instrumentNode.bpm.value }}</span
        >
      </div>

      <!-- Meter label -->
      <span class="text-xs text-base-content/60">Meter</span>
      <!-- Meter control -->
      <div class="flex items-center gap-1.5 text-xs text-base-content/60">
        <select
          class="select select-xs max-w-20 tabular-nums"
          :value="instrumentNode.timeSignature.value.beatsPerMeasure"
          @change="onBeatsPerMeasureChange"
        >
          <option v-for="n in [2, 3, 4, 5, 6, 7, 8, 9, 12]" :key="n" :value="n">
            {{ n }}
          </option>
        </select>
        <span class="px-0.5">/</span>
        <select
          class="select select-xs max-w-20"
          :value="instrumentNode.timeSignature.value.beatUnit"
          @change="onBeatUnitChange"
        >
          <option
            v-for="d in [2, 4, 8, 16]"
            :key="d"
            :value="d"
            :title="beatUnitLabel(d)"
          >
            {{ d }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>
