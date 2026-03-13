<script setup lang="ts">
/**
 * EffectGain — panel for a single GainEffect.
 *
 * Props: effect: GainEffect
 * Emits: update:effect(GainEffect), remove()
 */
import type { GainEffect } from "../../features/effects/types";

const props = defineProps<{
  effect: GainEffect;
}>();

const emit = defineEmits<{
  "update:effect": [effect: GainEffect];
  remove: [];
}>();

const onToggleEnabled = () => {
  emit("update:effect", { ...props.effect, enabled: !props.effect.enabled });
};

const onValueInput = (evt: Event) => {
  const raw = (evt.target as HTMLInputElement).valueAsNumber;
  const value = Math.max(0, isNaN(raw) ? 0 : raw);
  emit("update:effect", { ...props.effect, value });
};
</script>

<template>
  <div
    class="flex items-center gap-2 px-2 py-1.5 text-xs"
    :class="effect.enabled ? '' : 'opacity-50'"
  >
    <!-- Enable toggle -->
    <button
      class="btn btn-xs btn-ghost min-h-0 h-5 w-5 p-0 shrink-0"
      :title="effect.enabled ? 'Disable effect' : 'Enable effect'"
      :aria-pressed="effect.enabled"
      @click="onToggleEnabled"
    >
      <i
        :class="effect.enabled ? 'iconify mdi--toggle-switch text-success' : 'iconify mdi--toggle-switch-off text-base-content/40'"
        class="size-4"
        aria-hidden="true"
      />
    </button>

    <!-- Label -->
    <span class="font-medium w-16 shrink-0">Gain</span>

    <!-- Value slider -->
    <input
      type="range"
      min="0"
      max="3"
      step="0.01"
      :value="effect.value"
      class="range range-xs flex-1 min-w-0"
      :disabled="!effect.enabled"
      aria-label="Gain value"
      @input="onValueInput"
    />

    <!-- Numeric display / input -->
    <input
      type="number"
      min="0"
      step="0.01"
      :value="effect.value.toFixed(2)"
      class="input input-xs w-14 font-mono tabular-nums text-right"
      :disabled="!effect.enabled"
      aria-label="Gain value (numeric)"
      @change="onValueInput"
    />

    <!-- Remove button -->
    <button
      class="btn btn-xs btn-ghost min-h-0 h-5 w-5 p-0 shrink-0 text-base-content/40 hover:text-error"
      title="Remove effect"
      aria-label="Remove gain effect"
      @click="emit('remove')"
    >
      <i class="iconify mdi--close size-4" aria-hidden="true" />
    </button>
  </div>
</template>
