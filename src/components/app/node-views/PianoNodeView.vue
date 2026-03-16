<script setup lang="ts">
/**
 * PianoNodeView — complete view for an InstrumentNode with instrumentId "piano".
 *
 * Layout (top-to-bottom):
 *   Row 1  Header: [PIANO_ROLL_LABEL_WIDTH spacer | TimelineRuler flex-1]
 *   Row 2  PianoRoll (flex-1, owns scroll)
 *   Row 3  Player controls: [play] [separator] [note buttons + BPM] [flex-1] [tools] [divider] [ZoomToolbar]
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
} from "../../controls/PianoRollCanvas.vue";
import ScrollableTimeline from "../../controls/ScrollableTimeline.vue";
import ZoomToolbar from "../../controls/ZoomToolbar.vue";
import ButtonGroup, {
  type ButtonGroupItem,
} from "../../controls/ButtonGroup.vue";
import {
  ZOOM_MIN_INSTRUMENT_DURATION,
  ZOOM_MAX_INSTRUMENT_RATIO,
} from "../../../lib/zoom-constants";

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

const scaleFactor = ref(4);

// Container width (minus label column) drives minScaleFactor and totalDuration.
const viewRef = ref<HTMLElement | null>(null);
const rollContainerWidth = ref(0);

const totalDuration = computed(() =>
  rollContainerWidth.value > 0
    ? rollContainerWidth.value / baseSecondWidthInPixels
    : 1,
);

const minScaleFactor = computed(() => {
  const w = rollContainerWidth.value;
  if (!w) return 1;
  return w / (ZOOM_MIN_INSTRUMENT_DURATION * baseSecondWidthInPixels);
});

const maxScaleFactor = ZOOM_MAX_INSTRUMENT_RATIO;

let _viewObserver: ResizeObserver | null = null;

const zoomSelectActive = ref(false);

function zoomOut(): void {
  scaleFactor.value = Math.max(minScaleFactor.value, scaleFactor.value / 2);
}

function zoomIn(): void {
  scaleFactor.value = Math.min(maxScaleFactor, scaleFactor.value * 2);
}

function onZoomSelect(startTime: number, endTime: number): void {
  const duration = endTime - startTime;
  if (duration <= 0) return;
  const w = rollContainerWidth.value;
  const newSF = Math.min(
    Math.max(w / (duration * baseSecondWidthInPixels), minScaleFactor.value),
    maxScaleFactor,
  );
  // Set currentTime to midpoint FIRST, then scaleFactor so watcher reads updated time.
  previewSeek((startTime + endTime) / 2);
  scaleFactor.value = newSF;
  activeTool.value = "place";
  zoomSelectActive.value = false;
}

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
const ROW3_COMPACT_THRESHOLD = 600;

const row3Ref = ref<HTMLElement | null>(null);
const row3Compact = ref(false);

let _row3Observer: ResizeObserver | null = null;

onMounted(() => {
  // ResizeObserver for roll container width (drives minRatio).
  if (viewRef.value) {
    _viewObserver = new ResizeObserver(([entry]) => {
      rollContainerWidth.value = Math.max(
        0,
        (entry?.contentRect.width ?? 0) - PIANO_ROLL_LABEL_WIDTH,
      );
    });
    _viewObserver.observe(viewRef.value);
  }

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
  _viewObserver?.disconnect();
  _viewObserver = null;
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
    ref="viewRef"
    class="flex flex-col h-full w-full overflow-hidden bg-base-100 select-none"
  >
    <!-- ── Row 1+2: ScrollableTimeline wraps ruler + piano roll ────────────── -->
    <ScrollableTimeline
      class="flex-1 min-h-0"
      :gutter-width="PIANO_ROLL_LABEL_WIDTH"
      :total-duration="totalDuration"
      :min-scale-factor="minScaleFactor"
      :max-scale-factor="maxScaleFactor"
      :current-time="previewCurrentTime"
      :scale-factor="scaleFactor"
      :playing="previewState === 'playing'"
      @update:current-time="previewSeek"
      @update:scale-factor="scaleFactor = $event"
    >
      <PianoRoll
        :node="node"
        :active-tool="activeTool"
        :current-time="previewCurrentTime"
        :readonly="previewState === 'playing'"
        class="w-full h-full"
        @update:notes="onUpdateNotes"
        @copied="onCopied"
        @cut="onCut"
        @zoom-select="onZoomSelect"
      />
    </ScrollableTimeline>

    <!-- ── Row 3: Player controls ─────────────────────────────────────────── -->
    <div
      ref="row3Ref"
      class="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-base-200 border-t border-base-300/60 min-h-10"
    >
      <!-- Play/Pause -->
      <button
        class="btn btn-sm btn-ghost btn-square"
        :title="
          !node.targetBuffer && node.notes.length > 0
            ? 'Preparing audio…'
            : previewState === 'playing'
              ? 'Pause'
              : 'Play'
        "
        :disabled="!node.targetBuffer && node.notes.length > 0"
        @click="previewState === 'playing' ? previewPause() : previewPlay()"
      >
        <i
          class="iconify size-4"
          :class="
            !node.targetBuffer && node.notes.length > 0
              ? 'mdi--loading animate-spin'
              : previewState === 'playing'
                ? 'mdi--pause'
                : 'mdi--play'
          "
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

      <div class="w-px h-5 bg-base-300/60 mx-1" aria-hidden="true" />

      <!-- Zoom toolbar -->
      <ZoomToolbar
        :zoom-ratio="scaleFactor"
        :min-ratio="minScaleFactor"
        :max-ratio="maxScaleFactor"
        :zoom-select-active="zoomSelectActive"
        :disabled="previewState === 'playing'"
        @zoom-out="zoomOut"
        @zoom-in="zoomIn"
        @update:zoom-select-active="
          zoomSelectActive = $event;
          if ($event) activeTool = 'zoom-select';
          else activeTool = 'place';
        "
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
