<script setup lang="ts">
/**
 * PianoNodeView — complete view for an InstrumentNode with instrumentId "piano".
 *
 * Layout (top-to-bottom):
 *   Row 1  Header: [44px label | TimelineRuler flex-1 | ZoomControl w-40]
 *   Row 2  PianoRoll (flex-1, owns scroll)
 *   Row 3  Player controls: [play] [separator] [note buttons + BPM] [flex-1] [tools]
 */

import { ref, computed, onMounted, onUnmounted } from "vue";
import { useNodesStore } from "../../../stores/nodes";
import { useNodePlayback } from "../../../composables/useNodePlayback";
import { usePianoClipboard } from "../../../composables/usePianoClipboard";
import { NOTE_TYPE_LIST } from "../../../lib/music/instruments";
import { baseSecondWidthInPixels } from "../../../lib/util/formatTime";
import type { InstrumentNode } from "../../../features/nodes";
import type { NoteDuration } from "../../../lib/music/instruments";
import type { PianoRollToolId } from "../../../lib/piano-roll/tool-types";
import PianoRoll, {
  PIANO_ROLL_LABEL_WIDTH,
} from "../../controls/PianoRoll.vue";
import TimelineRuler from "../../controls/TimelineRuler.vue";
import ZoomControl from "../../controls/ZoomControl.vue";
import ButtonGroup, {
  type ButtonGroupItem,
} from "../../controls/ButtonGroup.vue";

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{ node: InstrumentNode }>();

// ── Stores / composables ──────────────────────────────────────────────────────

const nodes = useNodesStore();
const nodeRef = computed(() => props.node);
// targetBuffer recompute is handled app-wide by useAllNodes() in App.vue.

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
const offsetTime = computed(
  () => scrollLeft.value / (zoomRatio.value * baseSecondWidthInPixels),
);
const totalDurationSeconds = computed(
  () => GRID_WIDTH / (zoomRatio.value * baseSecondWidthInPixels),
);

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

// ── Button-group items ────────────────────────────────────────────────────────

/** Static — NOTE_TYPE_LIST never changes at runtime. */
const noteTypeItems: ButtonGroupItem[] = NOTE_TYPE_LIST.map((nt) => ({
  id: nt.id,
  label: nt.label,
  title: `${nt.label} (${nt.fraction})`,
  glyph: nt.glyph,
}));

/** Reactive — paste is disabled when the clipboard is empty. */
const toolItems = computed<ButtonGroupItem[]>(() => [
  { id: "place", label: "Place", title: "Place notes", icon: "pencil-outline" },
  {
    id: "pan",
    label: "Pan",
    title: "Pan — drag notes in time",
    icon: "hand-front-left-outline",
  },
  { id: "copy", label: "Copy", title: "Copy notes", icon: "content-copy" },
  {
    id: "cut",
    label: "Cut",
    title: "Cut — remove notes and close gap",
    icon: "content-cut",
    activeClass: "btn-warning",
  },
  {
    id: "paste",
    label: "Paste",
    title: "Paste notes",
    icon: "content-paste",
    disabled: !hasPianoNotes.value,
  },
]);

/** Wrappers absorb the string → specific-type casts from ButtonGroup's generic emit. */
function onNoteTypeSelected(id: string): void {
  selectNoteType(id as NoteDuration);
}

function onToolSelected(id: string): void {
  activeTool.value = id as PianoRollToolId;
}

// ── Row 3 compact mode (overflow detection) ───────────────────────────────────

/**
 * Minimum container width (px) at which all buttons fit comfortably inline.
 * Below this threshold both button groups switch to compact/dropdown mode.
 */
const ROW3_COMPACT_THRESHOLD = 520;

const row3Ref = ref<HTMLElement | null>(null);
const row3Compact = ref(false);

let _row3Observer: ResizeObserver | null = null;

onMounted(() => {
  if (!row3Ref.value) return;
  _row3Observer = new ResizeObserver(([entry]) => {
    row3Compact.value =
      (entry?.contentRect.width ?? 0) < ROW3_COMPACT_THRESHOLD;
  });
  _row3Observer.observe(row3Ref.value);
});

onUnmounted(() => {
  _row3Observer?.disconnect();
  _row3Observer = null;
});

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
  <div
    class="flex flex-col h-full w-full overflow-hidden bg-base-100 select-none"
  >
    <!-- ── Row 1: Header (label | ruler | zoom) ──────────────────────────── -->
    <div
      class="shrink-0 flex items-stretch h-10 border-b border-base-300/60 bg-base-200"
    >
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
      :readonly="previewState === 'playing'"
      class="flex-1 min-h-0"
      @update:notes="onUpdateNotes"
      @scroll="scrollLeft = $event"
      @copied="onCopied"
      @cut="onCut"
    />

    <!-- ── Row 3: Player controls ─────────────────────────────────────────── -->
    <div
      ref="row3Ref"
      class="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-base-200 border-t border-base-300/60 min-h-10"
    >
      <!-- Play/Pause -->
      <button
        class="btn btn-sm btn-ghost btn-square"
        :title="!node.targetBuffer && node.notes.length > 0 ? 'Preparing audio…' : previewState === 'playing' ? 'Pause' : 'Play'"
        :disabled="!node.targetBuffer && node.notes.length > 0"
        @click="previewState === 'playing' ? previewPause() : previewPlay()"
      >
        <i
          class="iconify size-4"
          :class="!node.targetBuffer && node.notes.length > 0 ? 'mdi--loading animate-spin' : previewState === 'playing' ? 'mdi--pause' : 'mdi--play'"
          aria-hidden="true"
        />
      </button>

      <!-- Separator -->
      <div class="w-px h-5 bg-base-300/60 mx-1" aria-hidden="true" />

      <!-- Note-type selector -->
      <ButtonGroup
        :items="noteTypeItems"
        :model-value="node.selectedNoteType"
        :compact="row3Compact"
        @update:model-value="onNoteTypeSelected"
      />

      <div class="flex-1" />

      <!-- Tool selector -->
      <ButtonGroup
        :items="toolItems"
        :model-value="activeTool"
        :compact="row3Compact"
        dropdown-align="end"
        @update:model-value="onToolSelected"
      />
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
