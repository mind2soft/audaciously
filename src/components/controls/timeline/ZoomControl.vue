<script setup lang="ts">
import { computed } from "vue";

/**
 * ZoomControl — zoom in/out buttons + logarithmic slider + label.
 *
 * Copied from src/components/ZoomControl.vue (already store-free, pure v-model).
 *
 * Props
 * ─────
 * modelValue  Current zoom ratio (v-model).
 * min         Minimum ratio.  Default 0.01.
 * max         Maximum ratio.  Default 5000.
 * step        Multiplicative step used by the ± buttons.  Default 4/3 ≈ 1.33.
 *
 * Emits
 * ─────
 * update:modelValue  New ratio after any user interaction.
 *
 * @example
 * <ZoomControl v-model="myZoom" />
 */
const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    /** Multiplicative step used by the ± buttons. */
    step?: number;
  }>(),
  {
    min: 0.01,
    max: 5000,
    step: 4 / 3,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

// ---------------------------------------------------------------------------
// Logarithmic slider mapping
// ---------------------------------------------------------------------------

const logMin = computed(() => Math.log(props.min));
const logRange = computed(() => Math.log(props.max) - logMin.value);

/** ratio → slider position in [0, 100] */
const sliderValue = computed(
  () => ((Math.log(props.modelValue) - logMin.value) / logRange.value) * 100,
);

/** slider position [0, 100] → ratio */
const sliderToRatio = (pos: number): number =>
  Math.exp(logMin.value + (pos / 100) * logRange.value);

const clamp = (v: number): number => Math.min(Math.max(v, props.min), props.max);

// ---------------------------------------------------------------------------
// Interaction handlers
// ---------------------------------------------------------------------------

const onSliderInput = (evt: Event): void => {
  const pos = (evt.target as HTMLInputElement).valueAsNumber;
  emit("update:modelValue", clamp(sliderToRatio(pos)));
};

const zoomIn = (): void => {
  emit("update:modelValue", clamp(props.modelValue * props.step));
};

const zoomOut = (): void => {
  emit("update:modelValue", clamp(props.modelValue / props.step));
};
</script>

<template>
  <div
    class="flex items-center gap-1 px-2 h-full select-none"
    role="group"
    aria-label="Zoom control"
  >
    <!-- ── Zoom-out button ──────────────────────────────────────────────── -->
    <button
      class="btn btn-xs btn-ghost min-h-0 h-7 w-7 p-0 shrink-0"
      aria-label="Zoom out"
      @click="zoomOut"
    >
      <i
        class="iconify mdi--magnify-minus-outline text-base"
        aria-hidden="true"
      />
    </button>

    <!-- ── Logarithmic range slider ─────────────────────────────────────── -->
    <input
      type="range"
      class="range range-xs flex-1 min-w-0"
      min="0"
      max="100"
      step="0.01"
      :value="sliderValue"
      aria-label="Zoom level"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="modelValue"
      @input="onSliderInput"
    />

    <!-- ── Zoom-in button ───────────────────────────────────────────────── -->
    <button
      class="btn btn-xs btn-ghost min-h-0 h-7 w-7 p-0 shrink-0"
      aria-label="Zoom in"
      @click="zoomIn"
    >
      <i
        class="iconify mdi--magnify-plus-outline text-base"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
