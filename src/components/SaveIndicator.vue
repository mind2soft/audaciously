<script setup lang="ts">
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
        <i class="iconify mdi--alert-circle size-3" />
        {{ error }}
      </span>
    </template>
    <template v-else-if="saving">
      <span class="text-info flex items-center gap-1">
        <i class="iconify mdi--loading animate-spin size-3" />
        Saving&hellip;
      </span>
    </template>
    <template v-else-if="dirty">
      <span class="text-warning/60 flex items-center gap-1">
        <i class="iconify mdi--circle-medium size-3" />
        Unsaved
      </span>
    </template>
    <template v-else>
      <span class="text-success/60 flex items-center gap-1">
        <i class="iconify mdi--check-circle-outline size-3" />
        Saved
      </span>
    </template>
  </div>
</template>
