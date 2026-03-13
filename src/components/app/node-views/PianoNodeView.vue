<script setup lang="ts">
/**
 * PianoNodeView — complete view for an InstrumentNode with instrumentId "piano".
 *
 * Layout (top-to-bottom):
 *   Row 1  Header: [44px label | TimelineRuler flex-1 | ZoomControl w-40]
 *   Row 2  PianoRoll (flex-1, owns scroll)
 *   Row 3  Player controls: [play] [separator] [note buttons + BPM] [flex-1] [tools]
 */

import { ref, computed } from "vue";
import { useNodesStore } from "../../../stores/nodes";
import { useNodePlayback } from "../../../composables/useNodePlayback";
import { useInstrumentNode } from "../../../composables/useInstrumentNode";
import { usePianoClipboard } from "../../../composables/usePianoClipboard";
import { NOTE_TYPE_LIST } from "../../../lib/music/instruments";
import { baseSecondWidthInPixels } from "../../../lib/util/formatTime";
import type { InstrumentNode } from "../../../features/nodes";
import type { NoteDuration } from "../../../lib/music/instruments";
import type { PianoRollToolId } from "../../../lib/piano-roll/tool-types";
import PianoRoll, { PIANO_ROLL_LABEL_WIDTH } from "../../controls/PianoRoll.vue";
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

// TimelineRuler: offsetTime is scroll position in seconds
const GRID_WIDTH = 6000; // px — must match PianoRoll's constant
const offsetTime = computed(() => scrollLeft.value / (zoomRatio.value * baseSecondWidthInPixels));
const totalDurationSeconds = computed(() => GRID_WIDTH / (zoomRatio.value * baseSecondWidthInPixels));

// ── Note-type selection ───────────────────────────────────────────────────────

function selectNoteType(type: NoteDuration): void {
  nodes.setInstrumentSelectedNoteType(props.node.id, type);
}

// ── Note edits ────────────────────────────────────────────────────────────────

function onUpdateNotes(notes: InstrumentNode["notes"]): void {
  nodes.setInstrumentNotes(props.node.id, notes);
}

// ── Active tool ───────────────────────────────────────────────────────────────

const activeTool = ref<PianoRollToolId>("place");

// ── Clipboard ─────────────────────────────────────────────────────────────────

const { hasPianoNotes } = usePianoClipboard();

// ── Toast ─────────────────────────────────────────────────────────────────────

const toastMessage = ref<string | null>(null);
let _toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string): void {
  if (_toastTimer !== null) clearTimeout(_toastTimer);
  toastMessage.value = message;
  _toastTimer = setTimeout(() => {
    toastMessage.value = null;
    _toastTimer = null;
  }, 3000);
}

function onCopied(noteCount: number): void {
  showToast(`${noteCount} note${noteCount === 1 ? "" : "s"} copied`);
}

function onCut(noteCount: number): void {
  showToast(`${noteCount} note${noteCount === 1 ? "" : "s"} cut`);
}
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-base-100 select-none">
    <!-- ── Row 1: Header (label | ruler | zoom) ──────────────────────────── -->
    <div class="shrink-0 flex items-stretch h-10 border-b border-base-300/60 bg-base-200">
      <!-- Track label — same width as the pitch label column in PianoRoll -->
      <div
        class="shrink-0 flex items-center gap-1.5 px-2 border-r border-base-300/60 text-xs text-base-content/60"
        :style="{ width: `${PIANO_ROLL_LABEL_WIDTH}px` }"
      >
        <i class="iconify mdi--piano text-sm" aria-hidden="true" />
        <span class="truncate">Piano</span>
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

    <!-- ── Row 2: Piano roll (flex-1) ────────────────────────────────────── -->
    <PianoRoll
      :node="node"
      :zoom-ratio="zoomRatio"
      :active-tool="activeTool"
      :current-time="previewCurrentTime"
      class="flex-1 min-h-0"
      @update:notes="onUpdateNotes"
      @scroll="scrollLeft = $event"
      @copied="onCopied"
      @cut="onCut"
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

      <!-- Note type buttons -->
      <div class="flex gap-1">
        <button
          v-for="nt in NOTE_TYPE_LIST"
          :key="nt.id"
          class="btn btn-xs"
          :class="node.selectedNoteType === nt.id ? 'btn-primary' : 'btn-ghost'"
          :title="nt.label"
          @click="selectNoteType(nt.id)"
        >
          {{ nt.fraction }}
        </button>
      </div>
      <span class="text-xs text-base-content/40">{{ node.bpm }} BPM</span>

      <div class="flex-1" />

      <button
        class="btn btn-xs"
        :class="activeTool === 'place' ? 'btn-primary' : 'btn-ghost'"
        title="Place notes"
        @click="activeTool = 'place'"
      >
        <i class="iconify mdi--pencil-outline size-3.5" aria-hidden="true" />
      </button>
      <button
        class="btn btn-xs"
        :class="activeTool === 'pan' ? 'btn-primary' : 'btn-ghost'"
        title="Pan — drag notes in time"
        @click="activeTool = 'pan'"
      >
        <i class="iconify mdi--hand-front-left-outline size-3.5" aria-hidden="true" />
      </button>
      <button
        class="btn btn-xs"
        :class="activeTool === 'copy' ? 'btn-primary' : 'btn-ghost'"
        title="Copy notes"
        @click="activeTool = 'copy'"
      >
        <i class="iconify mdi--content-copy size-3.5" aria-hidden="true" />
      </button>
      <button
        class="btn btn-xs"
        :class="activeTool === 'cut' ? 'btn-warning' : 'btn-ghost'"
        title="Cut — remove notes and close gap"
        @click="activeTool = 'cut'"
      >
        <i class="iconify mdi--content-cut size-3.5" aria-hidden="true" />
      </button>
      <button
        class="btn btn-xs"
        :class="activeTool === 'paste' ? 'btn-primary' : 'btn-ghost'"
        :disabled="!hasPianoNotes"
        title="Paste notes"
        @click="activeTool = 'paste'"
      >
        <i class="iconify mdi--content-paste size-3.5" aria-hidden="true" />
      </button>
    </div>

    <!-- ── Toast notification ─────────────────────────────────────────────── -->
    <div
      v-if="toastMessage"
      class="toast toast-center z-50 pointer-events-none"
      aria-live="polite"
    >
      <div class="alert alert-info py-2 px-4 text-sm">
        <span>{{ toastMessage }}</span>
      </div>
    </div>
  </div>
</template>
