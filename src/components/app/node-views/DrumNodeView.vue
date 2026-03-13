<script setup lang="ts">
/**
 * DrumNodeView — complete view for an InstrumentNode with instrumentId "drums".
 *
 * Layout (top-to-bottom):
 *   Row 1  Header: [80px label | TimelineRuler flex-1 | ZoomControl w-40]
 *   Row 2  DrumRoll (flex-1, owns scroll)
 *   Row 3  Player controls
 *
 * No note-type toolbar (drums use a fixed note type).
 */

import { ref, computed } from "vue";
import { useNodesStore } from "../../../stores/nodes";
import { useNodePlayback } from "../../../composables/useNodePlayback";
import { useInstrumentNode } from "../../../composables/useInstrumentNode";
import { baseSecondWidthInPixels } from "../../../lib/util/formatTime";
import type { InstrumentNode } from "../../../features/nodes";
import DrumRoll, { DRUM_ROLL_LABEL_WIDTH } from "../../controls/DrumRoll.vue";
import TimelineRuler from "../../controls/TimelineRuler.vue";
import ZoomControl from "../../controls/ZoomControl.vue";

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{ node: InstrumentNode }>();

// ── Stores / composables ──────────────────────────────────────────────────────

const nodes = useNodesStore();
const nodeRef = computed(() => props.node);

useInstrumentNode(nodeRef);

const {
  state: previewState,
  currentTime: previewCurrentTime,
  play: previewPlay,
  pause: previewPause,
  seek: previewSeek,
} = useNodePlayback(nodeRef);

// ── Zoom & scroll ─────────────────────────────────────────────────────────────

const zoomRatio = ref(4);
const scrollLeft = ref(0);

const GRID_WIDTH = 6000; // px — must match DrumRoll's constant
const offsetTime = computed(() => scrollLeft.value / (zoomRatio.value * baseSecondWidthInPixels));
const totalDurationSeconds = computed(() => GRID_WIDTH / (zoomRatio.value * baseSecondWidthInPixels));

// ── Note edits ────────────────────────────────────────────────────────────────

function onUpdateNotes(notes: InstrumentNode["notes"]): void {
  nodes.setInstrumentNotes(props.node.id, notes);
}
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-base-100 select-none">
    <!-- ── Row 1: Header (label | ruler | zoom) ───────────────────────────── -->
    <div class="shrink-0 flex items-stretch h-10 border-b border-base-300/60 bg-base-200">
      <!-- Track label — same width as the drum row label column in DrumRoll -->
      <div
        class="shrink-0 flex items-center gap-1.5 px-2 border-r border-base-300/60 text-xs text-base-content/60"
        :style="{ width: `${DRUM_ROLL_LABEL_WIDTH}px` }"
      >
        <i class="iconify mdi--drum text-sm" aria-hidden="true" />
        <span class="truncate">Drums</span>
      </div>

      <!-- Timeline ruler (synced with roll scroll) -->
      <TimelineRuler
        class="flex-1 min-w-0"
        :durationSeconds="totalDurationSeconds"
        :offsetTime="offsetTime"
        :ratio="zoomRatio"
        :currentTime="previewCurrentTime"
        @seek="previewSeek"
      />

      <!-- Zoom control -->
      <ZoomControl
        v-model="zoomRatio"
        :min="1"
        :max="20"
        class="w-40 shrink-0 border-l border-base-300/60"
      />
    </div>

    <!-- ── Row 2: Drum roll (flex-1) ──────────────────────────────────────── -->
    <DrumRoll
      :node="node"
      :zoom-ratio="zoomRatio"
      :current-time="previewCurrentTime"
      class="flex-1 min-h-0"
      @update:notes="onUpdateNotes"
      @scroll="scrollLeft = $event"
    />

    <!-- ── Row 3: Player controls ─────────────────────────────────────────── -->
    <div class="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-base-200 border-t border-base-300/60 min-h-10">
      <!-- Play/Pause -->
      <button
        class="btn btn-sm btn-ghost btn-square"
        :title="previewState === 'playing' ? 'Pause' : 'Play'"
        @click="previewState === 'playing' ? previewPause() : previewPlay()"
      >
        <i
          class="iconify size-4"
          :class="previewState === 'playing' ? 'mdi--pause' : 'mdi--play'"
          aria-hidden="true"
        />
      </button>

      <!-- Separator -->
      <div class="w-px h-5 bg-base-300/60 mx-1" aria-hidden="true" />

      <!-- BPM label -->
      <span class="text-xs text-base-content/40">{{ node.bpm }} BPM</span>

      <div class="flex-1" />

      <button class="btn btn-xs btn-ghost" title="Pan — coming soon" disabled>
        <i class="iconify mdi--hand-front-left-outline size-3.5" aria-hidden="true" />
      </button>
      <button class="btn btn-xs btn-ghost" title="Cut — coming soon" disabled>
        <i class="iconify mdi--content-cut size-3.5" aria-hidden="true" />
      </button>
      <button class="btn btn-xs btn-ghost" title="Copy — coming soon" disabled>
        <i class="iconify mdi--content-copy size-3.5" aria-hidden="true" />
      </button>
      <button class="btn btn-xs btn-ghost" title="Paste — coming soon" disabled>
        <i class="iconify mdi--content-paste size-3.5" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
