<script setup lang="ts">
import { sideMenuId } from "../lib/provider-keys";

// TODO
</script>

<template>
  <div class="drawer">
    <input :id="sideMenuId" type="checkbox" class="drawer-toggle" />
    <div class="flex flex-col w-screen h-screen drawer-content">
      <slot />
    </div>
    <div class="z-20 drawer-side">
      <label
        :for="sideMenuId"
        aria-label="close sidebar"
        class="drawer-overlay"
      ></label>
      <ul class="p-4 w-80 min-h-full menu bg-base-200 text-base-content">
        <!-- Sidebar content here -->
        <li><a>Sidebar Item 1</a></li>
        <li><a>Sidebar Item 2</a></li>
      </ul>
    </div>
  </div>
</template>
