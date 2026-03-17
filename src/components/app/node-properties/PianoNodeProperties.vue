<script setup lang="ts">
import { computed } from "vue";
import type { InstrumentNode } from "../../../features/nodes";
import type { OctaveRange } from "../../../lib/music/instruments";
import {
  PIANO_OCTAVE_MAX,
  PIANO_OCTAVE_MIN,
  PIANO_OCTAVE_PRESETS,
} from "../../../lib/music/instruments";
import { useNodesStore } from "../../../stores/nodes";
import DualRangeSlider from "../../controls/DualRangeSlider.vue";

const props = defineProps<{ node: InstrumentNode }>();
const nodes = useNodesStore();

// ── Octave range ──────────────────────────────────────────────────────────────

const octaveRangeModel = computed({
  get: () => props.node.octaveRange,
  set: (range: OctaveRange) => nodes.setInstrumentOctaveRange(props.node.id, range),
});

const rangeLabel = computed(() => {
  const { low, high } = props.node.octaveRange;
  const octaves = high - low + 1;
  return `C${low} – B${high} · ${octaves} oct`;
});

function applyPreset(range: OctaveRange): void {
  nodes.setInstrumentOctaveRange(props.node.id, { ...range });
}

function isActivePreset(range: OctaveRange): boolean {
  return props.node.octaveRange.low === range.low && props.node.octaveRange.high === range.high;
}
</script>

<template>
  <div class="flex flex-col gap-0 overflow-hidden">
    <!-- ── Octave Range section ───────────────────────────────────────────── -->
    <div class="px-3 py-2 flex flex-col gap-2 shrink-0">
      <!-- Header row: label + presets dropdown -->
      <div class="flex items-center justify-between">
        <p
          class="text-[10px] uppercase tracking-wider text-base-content/35 font-medium"
        >
          Octave Range
        </p>
        <!-- Presets dropdown -->
        <div class="dropdown dropdown-end">
          <button tabindex="0" class="btn btn-xs btn-ghost gap-1 text-xs">
            Presets
            <i class="iconify mdi--chevron-down size-3" aria-hidden="true" />
          </button>
          <ul
            tabindex="0"
            class="dropdown-content menu menu-xs bg-base-300 rounded-md shadow-lg z-50 min-w-max"
          >
            <li v-for="preset in PIANO_OCTAVE_PRESETS" :key="preset.label">
              <button
                :class="
                  isActivePreset(preset.range) ? 'text-primary font-medium' : ''
                "
                :title="preset.title"
                @click="applyPreset(preset.range)"
              >
                {{ preset.label }}
                <span class="text-base-content/40 text-[10px] ml-1">{{
                  preset.title
                }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Dual range slider -->
      <DualRangeSlider
        v-model="octaveRangeModel"
        :min="PIANO_OCTAVE_MIN"
        :max="PIANO_OCTAVE_MAX"
        :step="1"
      />

      <!-- Range label + min/max endpoints -->
      <div class="flex justify-between text-[10px] text-base-content/40 -mt-1">
        <span>C{{ PIANO_OCTAVE_MIN }}</span>
        <span class="tabular-nums text-base-content/55">{{ rangeLabel }}</span>
        <span>C{{ PIANO_OCTAVE_MAX }}</span>
      </div>
    </div>
  </div>
</template>
