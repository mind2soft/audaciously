<script setup lang="ts">
import { ref } from "vue";
import AboutModal from "./modals/About.vue";
import { sideMenuId } from "../lib/provider-keys";
import { appName, appVersion } from "../lib/constants";

const sideMenuRef = ref<HTMLInputElement>();
const aboutModalOpen = ref<boolean>(false);

const handleAboutOpen = () => {
  aboutModalOpen.value = true;
  if (sideMenuRef.value) sideMenuRef.value.click();
};
const handleAboutClose = () => {
  aboutModalOpen.value = false;
};
</script>

<template>
  <div class="drawer">
    <input
      ref="sideMenuRef"
      :id="sideMenuId"
      type="checkbox"
      class="drawer-toggle"
    />
    <div class="flex flex-col w-screen h-screen drawer-content">
      <!-- main content here -->
      <slot />
      <AboutModal :open="aboutModalOpen" v-on:close="handleAboutClose" />
    </div>
    <div class="z-20 drawer-side">
      <label
        :for="sideMenuId"
        aria-label="close sidebar"
        class="drawer-overlay"
      ></label>
      <div class="flex flex-col w-80 min-h-full bg-base-200 text-base-content">
        <!-- Sidebar content here -->
        <div class="flex gap-4 items-baseline p-4">
          <span class="text-2xl">{{ appName }}</span
          ><span class="text-sm">{{ appVersion }}</span>
        </div>
        <ul class="w-full menu">
          <li>
            <a class="flex gap-2 text-xl" v-on:click="handleAboutOpen"
              ><i class="iconify mdi--info-circle-outline"></i>About</a
            >
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
