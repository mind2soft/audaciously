<script setup lang="ts">
/**
 * EffectFadeIn — panel for a single FadeInEffect.
 *
 * Props: effect: FadeInEffect, maxDuration: number (seconds)
 * Emits: update:effect(FadeInEffect), remove()
 */
import type { FadeCurve, FadeInEffect } from "../../../features/effects/types";

const props = defineProps<{
  effect: FadeInEffect;
  maxDuration: number;
}>();

const emit = defineEmits<{
  "update:effect": [effect: FadeInEffect];
  remove: [];
}>();

const onDurationInput = (evt: Event) => {
  const raw = (evt.target as HTMLInputElement).valueAsNumber;
  const max = props.maxDuration > 0 ? props.maxDuration : 999;
  const duration = Math.min(max, Math.max(0, Number.isNaN(raw) ? 0 : raw));
  emit("update:effect", { ...props.effect, duration });
};

const onCurveChange = (evt: Event) => {
  const curve = (evt.target as HTMLSelectElement).value as FadeCurve;
  emit("update:effect", { ...props.effect, curve });
};
</script>

<template>
  <div
    class="flex items-center gap-2 px-2 py-1.5 text-xs"
    :class="effect.enabled ? '' : 'opacity-50'"
  >
    <!-- Label -->
    <span class="font-medium w-16 shrink-0">Fade In</span>

    <!-- Duration slider -->
    <input
      type="range"
      min="0"
      :max="maxDuration > 0 ? maxDuration : 10"
      step="0.01"
      :value="effect.duration"
      class="range range-xs flex-1 min-w-0"
      :disabled="!effect.enabled"
      aria-label="Fade in duration"
      @input="onDurationInput"
    />

    <!-- Numeric display -->
    <input
      type="number"
      min="0"
      :max="maxDuration > 0 ? maxDuration : undefined"
      step="0.01"
      :value="effect.duration.toFixed(2)"
      class="input input-xs w-14 font-mono tabular-nums text-right"
      :disabled="!effect.enabled"
      aria-label="Fade in duration (seconds)"
      @change="onDurationInput"
    />
    <span class="shrink-0 text-base-content/50">s</span>

    <!-- Curve select -->
    <select
      class="select select-xs shrink-0"
      :disabled="!effect.enabled"
      :value="effect.curve"
      aria-label="Fade in curve"
      @change="onCurveChange"
    >
      <option value="linear">Linear</option>
      <option value="logarithmic">Log</option>
      <option value="exponential">Exp</option>
      <option value="sine">Sine</option>
    </select>
  </div>
</template>
