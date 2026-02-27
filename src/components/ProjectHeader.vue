<script setup lang="ts">
import { sideMenuId } from "../lib/provider-keys";
import ProjectName from "./ProjectName.vue";

// TODO
</script>

<template>
  <div class="shadow-sm navbar bg-base-200 border-b border-base-300/60 min-h-12">
    <div class="flex-none">
      <label :for="sideMenuId" class="btn btn-square btn-ghost drawer-button min-h-11 min-w-11"
        ><i class="iconify mdi--menu size-6"
      /></label>
    </div>
    <div class="flex-1">
      <ProjectName />
    </div>
    <div class="flex-none">
      <a
        class="btn btn-square btn-ghost min-h-11 min-w-11"
        target="_blank"
        href="https://github.com/mind2soft/audaciously"
        title="View on GitHub"
      >
        <i class="iconify mdi--github-circle size-6" />
      </a>
    </div>
  </div>
</template>
