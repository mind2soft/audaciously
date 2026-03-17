<script setup lang="ts">
import { computed } from "vue";

// ── Props / emits ─────────────────────────────────────────────────────────────

const props = withDefaults(
  defineProps<{
    modelValue: { low: number; high: number };
    min: number;
    max: number;
    step?: number;
    minLabel?: string;
    maxLabel?: string;
  }>(),
  { step: 1 },
);

const emit = defineEmits<{
  "update:modelValue": [value: { low: number; high: number }];
}>();

// ── Fill bar geometry ─────────────────────────────────────────────────────────

const span = computed(() => props.max - props.min);

const fillStyle = computed(() => {
  const low = ((props.modelValue.low - props.min) / span.value) * 100;
  const high = ((props.modelValue.high - props.min) / span.value) * 100;
  return { left: `${low}%`, width: `${high - low}%` };
});

// ── z-index: low thumb goes on top when handles touch/cross ───────────────────

const lowZIndex = computed(() => (props.modelValue.low >= props.modelValue.high ? 5 : 3));

// ── Event handlers ────────────────────────────────────────────────────────────

function onLowInput(event: Event): void {
  const low = parseInt((event.target as HTMLInputElement).value, 10);
  const high = Math.max(low, props.modelValue.high);
  emit("update:modelValue", { low, high });
}

function onHighInput(event: Event): void {
  const high = parseInt((event.target as HTMLInputElement).value, 10);
  const low = Math.min(high, props.modelValue.low);
  emit("update:modelValue", { low, high });
}
</script>

<template>
  <!-- Slider track area -->
  <div class="relative h-5 flex items-center">
    <!-- Unfilled track -->
    <div class="absolute inset-x-0 h-2 rounded-full bg-primary/10" />
    <!-- Filled range between handles -->
    <div
      class="absolute top-0 h-4 rounded-full bg-primary"
      :style="fillStyle"
    />
    <!-- Low handle -->
    <input
      type="range"
      class="range range-primary range-xs dual-range-input"
      :style="{ zIndex: lowZIndex }"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue.low"
      @input="onLowInput"
    />
    <!-- High handle -->
    <input
      type="range"
      class="range range-primary range-xs dual-range-input"
      style="z-index: 4"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue.high"
      @input="onHighInput"
    />
  </div>

  <!-- Min / max labels row (optional) -->
  <div
    v-if="minLabel !== undefined || maxLabel !== undefined"
    class="flex justify-between text-[10px] text-base-content/40 -mt-1"
  >
    <span>{{ minLabel ?? min }}</span>
    <span>{{ maxLabel ?? max }}</span>
  </div>
</template>

<style scoped>
.dual-range-input {
  position: absolute;
  inset-inline: 0;
  top: 0;
  bottom: 0;
  width: 100%;
  --range-fill: 0;
  pointer-events: none;
}

.dual-range-input::-webkit-slider-runnable-track {
  background: transparent;
}

.dual-range-input::-moz-range-track {
  background: transparent;
}

.dual-range-input::-webkit-slider-thumb {
  pointer-events: all;
  cursor: pointer;
}

.dual-range-input::-moz-range-thumb {
  pointer-events: all;
  cursor: pointer;
}
</style>
