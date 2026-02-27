<script setup lang="ts">
import { ref } from "vue";
import AboutModal from "./modals/About.vue";
import SettingsModal from "./modals/Settings.vue";
import { sideMenuId } from "../lib/provider-keys";
import { appName, appVersion } from "../lib/constants";

const sideMenuRef = ref<HTMLInputElement>();
const aboutModalOpen = ref<boolean>(false);
const settingsModalOpen = ref<boolean>(false);

const handleAboutOpen = () => {
  aboutModalOpen.value = true;
  if (sideMenuRef.value) sideMenuRef.value.click();
};
const handleAboutClose = () => {
  aboutModalOpen.value = false;
};

const handleSettingsOpen = () => {
  settingsModalOpen.value = true;
  if (sideMenuRef.value) sideMenuRef.value.click();
};
const handleSettingsClose = () => {
  settingsModalOpen.value = false;
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
      <SettingsModal :open="settingsModalOpen" v-on:close="handleSettingsClose" />
    </div>
    <div class="z-20 drawer-side">
      <label
        :for="sideMenuId"
        aria-label="close sidebar"
        class="drawer-overlay"
      ></label>
      <div class="flex flex-col w-80 min-h-full bg-base-200 text-base-content">
        <!-- Sidebar header -->
        <div class="flex flex-col px-4 pt-5 pb-3 border-b border-base-300/60">
          <span class="text-xl font-semibold tracking-tight">{{ appName }}</span>
          <span class="text-xs text-base-content/40 mt-0.5">v{{ appVersion }}</span>
        </div>
        <!-- Menu items -->
        <ul class="w-full menu flex-1 py-2">
          <li>
            <a class="flex gap-3 items-center py-2.5 text-base" v-on:click="handleSettingsOpen">
              <i class="iconify mdi--cog-outline size-5"></i>
              Settings
            </a>
          </li>
          <li>
            <a class="flex gap-3 items-center py-2.5 text-base" v-on:click="handleAboutOpen">
              <i class="iconify mdi--info-circle-outline size-5"></i>
              About
            </a>
          </li>
        </ul>
        <!-- Footer version strip -->
        <div class="px-4 py-3 border-t border-base-300/60 text-xs text-base-content/30">
          {{ appName }} {{ appVersion }}
        </div>
      </div>
    </div>
  </div>
</template>
