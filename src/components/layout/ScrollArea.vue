<script setup lang="ts">
/**
 * ScrollArea — a div with styled scrollbars and overflow-auto.
 * Used for the node tree and track area scrolling.
 *
 * No business logic — pure layout.
 */

withDefaults(
  defineProps<{
    /** Scroll direction. Default: 'both'. */
    direction?: "x" | "y" | "both";
  }>(),
  {
    direction: "both",
  },
);
</script>

<template>
  <div
    class="w-full h-full"
    :class="{
      'overflow-auto': direction === 'both',
      'overflow-x-auto overflow-y-hidden': direction === 'x',
      'overflow-y-auto overflow-x-hidden': direction === 'y',
    }"
  >
    <slot />
  </div>
</template>
