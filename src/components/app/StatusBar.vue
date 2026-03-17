<script setup lang="ts">
/**
 * StatusBar — bottom status row of the application.
 *
 * Displays:
 *   - Save state (via controls/SaveIndicator)
 *   - Estimated project size
 *   - Playback time (mm:ss / total)
 *
 * Store connections
 * ─────────────────
 * useProjectStore  — saving, dirty, saveError, estimatedSize
 * usePlayerStore   — currentTime, totalDuration (from sequence via player)
 * useSequenceStore — totalDuration (for display)
 */

import { computed } from "vue";
import { usePlayerStore } from "../../stores/player";
import { useProjectStore } from "../../stores/project";
import { useSequenceStore } from "../../stores/sequence";
import SaveIndicator from "../controls/SaveIndicator.vue";

const project = useProjectStore();
const player = usePlayerStore();
const sequence = useSequenceStore();

/** Format seconds to mm:ss */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const currentTimeLabel = computed(() => formatTime(player.currentTime));
const totalTimeLabel = computed(() => formatTime(sequence.totalDuration));
</script>

<template>
  <div
    class="flex items-center w-full h-full px-2 gap-2 text-xs text-base-content/60"
  >
    <!-- ── Save indicator ──────────────────────────────────────────────── -->
    <SaveIndicator
      :saving="project.saving"
      :dirty="project.dirty"
      :error="project.saveError"
    />

    <!-- ── Separator ──────────────────────────────────────────────────── -->
    <div class="w-px h-4 bg-base-300/60 shrink-0" aria-hidden="true" />

    <!-- ── Project size ───────────────────────────────────────────────── -->
    <span class="tabular-nums">{{ project.estimatedSize }}</span>

    <!-- ── Spacer ─────────────────────────────────────────────────────── -->
    <div class="flex-1" />

    <!-- ── Playback position ──────────────────────────────────────────── -->
    <span class="tabular-nums font-mono">
      {{ currentTimeLabel }} / {{ totalTimeLabel }}
    </span>
  </div>
</template>
