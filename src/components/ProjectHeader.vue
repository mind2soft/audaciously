<script setup lang="ts">
import { sideMenuId } from "../lib/provider-keys";

// TODO
</script>

<template>
  <div class="shadow-sm navbar bg-base-200">
    <div class="flex-none">
      <label :for="sideMenuId" class="btn drawer-button"
        ><i class="iconify mdi--menu size-7"
      /></label>
    </div>
    <div class="flex-1">
      <button class="text-xl btn btn-ghost">Untitled project</button>
    </div>
    <div class="flex-none">
      <a
        class="btn btn-square btn-ghost"
        target="_blank"
        href="https://github.com/mind2soft/audaciously"
        title="View on GitHub"
      >
        <i class="iconify mdi--github-circle size-10" />
      </a>
    </div>
  </div>
</template>
