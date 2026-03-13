<script setup lang="ts">
/**
 * SideDrawer — collapsible slide-in drawer triggered by a toggle.
 * Replaces SideMenu.vue. Uses DaisyUI drawer component.
 *
 * The trigger button is in the named slot `trigger` (placed in the header).
 * The drawer sidebar content is in the named slot `default`.
 * The main page content is in the named slot `content` (wraps everything).
 *
 * No business logic — pure layout.
 */

import { ref, useId } from "vue";

const drawerId = useId();
const drawerRef = ref<HTMLInputElement>();

const open = () => {
  if (drawerRef.value) drawerRef.value.checked = true;
};
const close = () => {
  if (drawerRef.value) drawerRef.value.checked = false;
};

defineExpose({ open, close });
</script>

<template>
  <div class="drawer">
    <input ref="drawerRef" :id="drawerId" type="checkbox" class="drawer-toggle" />

    <!-- Main content area -->
    <div class="flex flex-col drawer-content">
      <slot name="content" :openDrawer="open" />
    </div>

    <!-- Drawer sidebar -->
    <div class="z-20 drawer-side">
      <label :for="drawerId" aria-label="Close menu" class="drawer-overlay" />
      <div class="flex flex-col w-72 min-h-full bg-base-200 text-base-content">
        <slot :closeDrawer="close" />
      </div>
    </div>
  </div>
</template>
