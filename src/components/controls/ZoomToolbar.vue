<script setup lang="ts">
/**
 * ZoomToolbar — three-button zoom control for timeline-based node views.
 *
 * Replaces the old ZoomControl slider widget in all three node views.
 *
 * Props
 * ─────
 * zoomRatio        Current zoom ratio (used to enable/disable ±2x buttons).
 * minRatio         Minimum allowed zoom ratio.
 * maxRatio         Maximum allowed zoom ratio.
 * zoomSelectActive Whether the zoom-select drag tool is currently active.
 * disabled         When true, all buttons are disabled (e.g. during playback).
 *
 * Emits
 * ─────
 * zoom-out                    User pressed Zoom Out (÷2).
 * zoom-in                     User pressed Zoom In (×2).
 * update:zoom-select-active   User toggled the zoom-select drag tool.
 */

defineProps<{
  zoomRatio: number;
  minRatio: number;
  maxRatio: number;
  zoomSelectActive?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "zoom-out": [];
  "zoom-in": [];
  "update:zoom-select-active": [active: boolean];
}>();
</script>

<template>
  <div class="flex items-center gap-0.5">
    <!-- Zoom Out ÷2 -->
    <button
      class="btn btn-xs btn-ghost btn-square"
      title="Zoom out (÷2)"
      :disabled="disabled || zoomRatio <= minRatio"
      @click="emit('zoom-out')"
    >
      <i class="iconify mdi--magnify-minus-outline size-3.5" aria-hidden="true" />
    </button>

    <!-- Zoom Select (rubber-band drag to zoom into region) -->
    <button
      class="btn btn-xs btn-square"
      :class="zoomSelectActive ? 'btn-primary' : 'btn-ghost'"
      title="Zoom select — drag to zoom into a region"
      :disabled="disabled"
      @click="emit('update:zoom-select-active', !zoomSelectActive)"
    >
      <i class="iconify mdi--selection size-3.5" aria-hidden="true" />
    </button>

    <!-- Zoom In ×2 -->
    <button
      class="btn btn-xs btn-ghost btn-square"
      title="Zoom in (×2)"
      :disabled="disabled || zoomRatio >= maxRatio"
      @click="emit('zoom-in')"
    >
      <i class="iconify mdi--magnify-plus-outline size-3.5" aria-hidden="true" />
    </button>
  </div>
</template>
