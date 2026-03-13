<script setup lang="ts">
/**
 * SaveIndicator — displays the current save state of the project.
 *
 * Migrated from src/components/SaveIndicator.vue (already store-free, pure props).
 *
 * Props
 * ─────
 * saving   True while an async save is in progress.
 * dirty    True when there are unsaved changes.
 * error    Error message string if the last save failed.
 */
defineProps<{
  saving: boolean;
  dirty: boolean;
  error?: string | null;
}>();
</script>

<template>
  <div class="flex items-center gap-1 text-xs px-3 py-1">
    <template v-if="error">
      <span class="text-error flex items-center gap-1">
        <i class="iconify mdi--alert-circle size-3" aria-hidden="true" />
        {{ error }}
      </span>
    </template>
    <template v-else-if="saving">
      <span class="text-info flex items-center gap-1">
        <i class="iconify mdi--loading animate-spin size-3" aria-hidden="true" />
        Saving&hellip;
      </span>
    </template>
    <template v-else-if="dirty">
      <span class="text-warning/60 flex items-center gap-1">
        <i class="iconify mdi--circle-medium size-3" aria-hidden="true" />
        Unsaved
      </span>
    </template>
    <template v-else>
      <span class="text-success/60 flex items-center gap-1">
        <i class="iconify mdi--check-circle-outline size-3" aria-hidden="true" />
        Saved
      </span>
    </template>
  </div>
</template>
