<script setup lang="ts">
/**
 * AppHeader — the top header row of the application.
 *
 * Layout (left → right):
 *   [≡ Menu dropdown]  |  ProjectName (editable)  |  [⏸/▶ Play/Pause]  |  🔊 Volume  |  [GitHub]
 *
 * This component CAN import Pinia stores (it lives in app/).
 *
 * Store connections
 * ─────────────────
 * usePlayerStore   — play/pause, playback state
 * useProjectStore  — project name, menu actions (open/save/new/export), modal flags
 */

import { computed, ref } from "vue";
import { usePlayerStore } from "../../stores/player";
import { useProjectStore } from "../../stores/project";
import ProjectName from "../controls/ProjectName.vue";
import VolumeSlider from "../controls/VolumeSlider.vue";

const player = usePlayerStore();
const project = useProjectStore();

const isPlaying = computed(() => player.state === "playing");

// Writable computed so ProjectName can use v-model cleanly.
const projectName = computed({
  get: () => project.metadata.name,
  set: (value: string) => {
    project.metadata.name = value;
    project.notifyDirty();
  },
});

function togglePlay(): void {
  if (isPlaying.value) {
    player.pause();
  } else {
    void player.play();
  }
}

// ── File menu dropdown ────────────────────────────────────────────────────────
const menuOpen = ref(false);

function closeMenu(): void {
  menuOpen.value = false;
}
</script>

<template>
  <div class="flex items-center gap-2 w-full h-full px-2">

    <!-- ── [≡] File menu dropdown ──────────────────────────────────────── -->
    <div class="relative">
      <button
        class="btn btn-sm btn-ghost btn-square"
        title="File menu"
        aria-label="File menu"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <i class="iconify mdi--menu size-5" aria-hidden="true" />
      </button>

      <!-- Menu items -->
      <ul
        v-if="menuOpen"
        role="menu"
        aria-label="File menu"
        class="absolute left-0 top-full mt-1 z-50 menu menu-sm bg-base-300 border border-base-300/60 rounded-md shadow-lg min-w-48"
      >
        <li role="none">
          <button role="menuitem" @click="project.doNew(); closeMenu()">
            <i class="iconify mdi--file-outline size-4" />
            New Project
          </button>
        </li>
        <li role="none">
          <button role="menuitem" @click="project.browserOpen = true; closeMenu()">
            <i class="iconify mdi--folder-open-outline size-4" />
            Open Project
          </button>
        </li>
        <li role="separator" aria-hidden="true" class="pointer-events-none"><div class="border-t border-base-content/10 my-0.5 -mx-1" /></li>
        <li role="none">
          <button
            role="menuitem"
            :disabled="!project.hasProject"
            @click="project.doSave(); closeMenu()"
          >
            <i class="iconify mdi--content-save-outline size-4" />
            Save
            <kbd class="kbd kbd-xs ml-auto">Ctrl+S</kbd>
          </button>
        </li>
        <li role="none">
          <button role="menuitem" @click="project.metadataMode = 'save-as'; project.metadataOpen = true; closeMenu()">
            <i class="iconify mdi--content-save-edit-outline size-4" />
            Save As
          </button>
        </li>
        <li role="separator" aria-hidden="true" class="pointer-events-none"><div class="border-t border-base-content/10 my-0.5 -mx-1" /></li>
        <li role="none">
          <button role="menuitem" @click="project.metadataMode = 'edit'; project.metadataOpen = true; closeMenu()">
            <i class="iconify mdi--tag-outline size-4" />
            Project Info
          </button>
        </li>
        <li role="none">
          <button
            role="menuitem"
            :disabled="!project.hasProject"
            @click="project.exportOpen = true; closeMenu()"
          >
            <i class="iconify mdi--music-note-eighth size-4" />
            Export Audio
          </button>
        </li>
      </ul>

      <!-- Click-away overlay -->
      <div
        v-if="menuOpen"
        class="fixed inset-0 z-40"
        aria-hidden="true"
        @click="closeMenu"
      />
    </div>

    <!-- ── Separator ───────────────────────────────────────────────────── -->
    <div class="w-px h-6 bg-base-300/60 shrink-0" aria-hidden="true" />

    <!-- ── Project Name (editable) ──────────────────────────────────────── -->
    <ProjectName
      v-model="projectName"
      class="min-w-0"
    />

    <!-- ── Spacer ──────────────────────────────────────────────────────── -->
    <div class="flex-1" />

    <!-- ── [⏸/▶] Play / Pause ────────────────────────────────────────── -->
    <button
      class="btn btn-sm btn-ghost btn-square"
      :title="isPlaying ? 'Pause timeline' : 'Play timeline'"
      :aria-label="isPlaying ? 'Pause timeline' : 'Play timeline'"
      :aria-pressed="isPlaying"
      @click="togglePlay"
    >
      <i
        class="iconify size-5"
        :class="isPlaying ? 'mdi--pause' : 'mdi--play'"
        aria-hidden="true"
      />
    </button>

    <!-- ── Volume slider ─────────────────────────────────────────────── -->
    <VolumeSlider
      :volume="player.volume"
      @update:volume="player.setVolume($event)"
    />

    <!-- ── Separator ──────────────────────────────────────────────────── -->
    <div class="w-px h-6 bg-base-300/60 shrink-0 ml-1" aria-hidden="true" />

    <!-- ── GitHub link ────────────────────────────────────────────────── -->
    <a
      href="https://github.com/m2s/audaciously"
      target="_blank"
      rel="noopener noreferrer"
      class="btn btn-sm btn-ghost btn-square"
      title="View on GitHub"
    >
      <i class="iconify mdi--github size-5" aria-hidden="true" />
    </a>

  </div>
</template>
