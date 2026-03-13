<script setup lang="ts">
/**
 * EffectFadeOut — panel for a single FadeOutEffect.
 *
 * Props: effect: FadeOutEffect, maxDuration: number (seconds)
 * Emits: update:effect(FadeOutEffect), remove()
 */
import type { FadeOutEffect } from "../../features/effects/types";

const props = defineProps<{
  effect: FadeOutEffect;
  maxDuration: number;
}>();

const emit = defineEmits<{
  "update:effect": [effect: FadeOutEffect];
  remove: [];
}>();

const onToggleEnabled = () => {
  emit("update:effect", { ...props.effect, enabled: !props.effect.enabled });
};

const onDurationInput = (evt: Event) => {
  const raw = (evt.target as HTMLInputElement).valueAsNumber;
  const max = props.maxDuration > 0 ? props.maxDuration : 999;
  const duration = Math.min(max, Math.max(0, isNaN(raw) ? 0 : raw));
  emit("update:effect", { ...props.effect, duration });
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
    <span class="font-medium w-16 shrink-0">Fade Out</span>

    <!-- Duration slider -->
    <input
      type="range"
      min="0"
      :max="maxDuration > 0 ? maxDuration : 10"
      step="0.01"
      :value="effect.duration"
      class="range range-xs flex-1 min-w-0"
      :disabled="!effect.enabled"
      aria-label="Fade out duration"
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
      aria-label="Fade out duration (seconds)"
      @change="onDurationInput"
    />
    <span class="shrink-0 text-base-content/50">s</span>

    <!-- Remove button -->
    <button
      class="btn btn-xs btn-ghost min-h-0 h-5 w-5 p-0 shrink-0 text-base-content/40 hover:text-error"
      title="Remove effect"
      aria-label="Remove fade out effect"
      @click="emit('remove')"
    >
      <i class="iconify mdi--close size-4" aria-hidden="true" />
    </button>
  </div>
</template>
