<script setup lang="ts">
import { computed } from "vue";

/**
 * Self-contained, reusable zoom-level control.
 *
 * Renders:  [−]  ══════●══════  [+]  label
 *
 * The slider uses a **logarithmic scale** so ranges that span several orders of
 * magnitude (e.g. 0.01 → 5000) feel linear and intuitive to the user — equal
 * slider travel always represents equal perceived zoom steps.
 *
 * Props
 * ─────
 * modelValue  Current zoom ratio (v-model).
 * min         Minimum ratio.  Default 0.01.
 * max         Maximum ratio.  Default 5000.
 * step        Multiplicative step used by the ± buttons.  Default 4/3 ≈ 1.33,
 *             which matches the step defined in timeline.ts (scale_a / scale_b).
 *
 * Emits
 * ─────
 * update:modelValue  New ratio after any user interaction.
 *
 * @example
 * <ZoomControl v-model="myZoom" />
 * <ZoomControl v-model="myZoom" :min="0.5" :max="8" :step="1.5" />
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

const clamp = (v: number): number =>
  Math.min(Math.max(v, props.min), props.max);

// ---------------------------------------------------------------------------
// Human-readable zoom label
// ---------------------------------------------------------------------------

/**
 * Returns a compact zoom label:
 *   ratio < 1   → percentage of 1×, e.g. "50%"
 *   ratio ≥ 1   → multiplier,        e.g. "2.5×" / "100×"
 *   ratio ≥ 1k  → kilo-multiplier,   e.g. "1.5k×"
 */
const zoomLabel = computed((): string => {
  const r = props.modelValue;
  if (r < 0.1) return `${(r * 100).toFixed(1)}%`;
  if (r < 1) return `${Math.round(r * 100)}%`;
  if (r < 10) return `${r.toFixed(1)}×`;
  if (r < 1000) return `${Math.round(r)}×`;
  return `${(r / 1000).toFixed(1)}k×`;
});

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
      ></i>
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
      ></i>
    </button>

    <!-- ── Zoom label ───────────────────────────────────────────────────── -->
    <span
      class="text-xs font-mono tabular-nums w-10 text-right opacity-60 shrink-0"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ zoomLabel }}
    </span>
  </div>
</template>
