<script setup lang="ts">
/**
 * VolumeSlider — master volume slider (0–200%).
 *
 * Extracted from AudioPlayer.vue. Pure props/emits; no store access.
 *
 * Props
 * ─────
 * volume   Current volume as a multiplier (0.0–2.0 maps to 0–200%).
 *
 * Emits
 * ─────
 * update:volume   New volume multiplier after user interaction (0.0–2.0).
 *
 * @example
 * <VolumeSlider :volume="masterVolume" @update:volume="masterVolume = $event" />
 * <VolumeSlider v-model:volume="masterVolume" />
 */

defineProps<{
  volume: number;
}>();

const emit = defineEmits<{
  "update:volume": [value: number];
}>();

const onInput = (evt: Event): void => {
  const pct = (evt.target as HTMLInputElement).valueAsNumber;
  emit("update:volume", pct / 100);
};
</script>

<template>
  <div class="flex items-center gap-2 min-w-0" role="group" aria-label="Master volume">
    <i
      class="iconify mdi--volume-medium size-5 text-base-content/50 shrink-0"
      aria-hidden="true"
    />
    <input
      type="range"
      min="0"
      max="200"
      step="1"
      :value="Math.round(volume * 100)"
      class="range range-sm w-24"
      aria-label="Master volume"
      :aria-valuenow="Math.round(volume * 100)"
      aria-valuemin="0"
      aria-valuemax="200"
      @input="onInput"
    />
    <span class="text-xs font-mono tabular-nums w-8 text-right text-base-content/50 shrink-0">
      {{ Math.round(volume * 100) }}%
    </span>
  </div>
</template>
