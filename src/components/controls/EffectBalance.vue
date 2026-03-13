<script setup lang="ts">
/**
 * EffectBalance — panel for a single BalanceEffect.
 *
 * Props: effect: BalanceEffect
 * Emits: update:effect(BalanceEffect), remove()
 */
import type { BalanceEffect } from "../../features/effects/types";

const props = defineProps<{
  effect: BalanceEffect;
}>();

const emit = defineEmits<{
  "update:effect": [effect: BalanceEffect];
  remove: [];
}>();

const onToggleEnabled = () => {
  emit("update:effect", { ...props.effect, enabled: !props.effect.enabled });
};

const onValueInput = (evt: Event) => {
  const raw = (evt.target as HTMLInputElement).valueAsNumber;
  const value = Math.min(1, Math.max(-1, isNaN(raw) ? 0 : raw));
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
    <span class="font-medium w-16 shrink-0">Balance</span>

    <!-- Value slider (-1 to 1) -->
    <input
      type="range"
      min="-1"
      max="1"
      step="0.01"
      :value="effect.value"
      class="range range-xs flex-1 min-w-0"
      :disabled="!effect.enabled"
      aria-label="Balance value"
      @input="onValueInput"
    />

    <!-- Numeric display: show L / C / R label -->
    <span class="font-mono tabular-nums w-14 text-right shrink-0">
      <template v-if="Math.abs(effect.value) < 0.01">C</template>
      <template v-else-if="effect.value < 0">L {{ Math.abs(effect.value * 100).toFixed(0) }}%</template>
      <template v-else>R {{ (effect.value * 100).toFixed(0) }}%</template>
    </span>

    <!-- Remove button -->
    <button
      class="btn btn-xs btn-ghost min-h-0 h-5 w-5 p-0 shrink-0 text-base-content/40 hover:text-error"
      title="Remove effect"
      aria-label="Remove balance effect"
      @click="emit('remove')"
    >
      <i class="iconify mdi--close size-4" aria-hidden="true" />
    </button>
  </div>
</template>
