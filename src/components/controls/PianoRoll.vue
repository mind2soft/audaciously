<script lang="ts">
/**
 * Module-level export so parent components (PianoNodeView) can read the label
 * width and align their own header columns accordingly.
 */
export const PIANO_ROLL_LABEL_WIDTH = 44;
</script>

<script setup lang="ts">
/**
 * PianoRoll — interactive piano note editor for an InstrumentNode.
 *
 * Props
 * ─────
 * node          InstrumentNode (piano kind).
 * zoomRatio     Zoom multiplier (owned by PianoNodeView).
 * activeTool    Which editing tool is currently active.
 * currentTime   Playback position in seconds — drives the playhead overlay.
 *
 * Emits
 * ─────
 * update:notes   New notes array after any edit.
 * scroll         New scrollLeft (px) whenever the scroll container scrolls.
 * copied         Number of notes copied to the clipboard (> 0 guaranteed).
 */

import { computed, ref, onUnmounted, inject } from "vue";
import {
  PIANO_INSTRUMENT,
  filterPitchesByOctaveRange,
} from "../../lib/music/instruments";
import {
  getSecondsPerBeat,
  getNoteDurationBeats,
} from "../../lib/audio/track/instrument/utils";
import { baseSecondWidthInPixels } from "../../lib/util/formatTime";
import type { InstrumentNode, PlacedNote } from "../../features/nodes";
import type { PianoRollToolId } from "../../lib/piano-roll/tool-types";
import { scrollableTimelineKey } from "../../lib/scrollable-timeline";

import { usePlaceTool } from "../../composables/usePlaceTool";
import { usePanTool } from "../../composables/usePanTool";
import { useCopyTool } from "../../composables/useCopyTool";
import { useCutTool } from "../../composables/useCutTool";
import { usePasteTool } from "../../composables/usePasteTool";
import { computeSnapBeats } from "../../lib/piano-roll/note-utils";
import { useNotePreview } from "../../composables/useNotePreview";
import PianoRollKeys from "./PianoRollKeys.vue";

const NOTE_HEIGHT_PX = PIANO_INSTRUMENT.rowHeight;
const LABEL_WIDTH_PX = PIANO_ROLL_LABEL_WIDTH;

// ── Props / emits ─────────────────────────────────────────────────────────────

const props = defineProps<{
  node: InstrumentNode;
  zoomRatio?: number;
  activeTool: PianoRollToolId;
  currentTime?: number;
  /** When true, all editing interactions are suppressed (e.g. during playback). */
  readonly?: boolean;
}>();

const emit = defineEmits<{
  "update:notes": [notes: PlacedNote[]];
  copied: [noteCount: number];
  cut: [noteCount: number];
  "zoom-select": [startTime: number, endTime: number];
}>(); 

// ── Refs ──────────────────────────────────────────────────────────────────────

const gridRef = ref<HTMLDivElement>();

// ── Context from ScrollableTimeline ──────────────────────────────────────────

const timelineCtx = inject(scrollableTimelineKey, null);

// ── Derived pixel / beat constants ────────────────────────────────────────────

const pxPerSec = computed(() =>
  timelineCtx
    ? timelineCtx.pixelsPerSecond.value
    : (props.zoomRatio ?? 1) * baseSecondWidthInPixels,
);

const pxPerBeat = computed(
  () => getSecondsPerBeat(props.node.bpm) * pxPerSec.value,
);
const pxPerMeasure = computed(
  () => pxPerBeat.value * props.node.timeSignature.beatsPerMeasure,
);

// ── Render-only integer-snapped values ────────────────────────────────────────
// Used for CSS gradients and note pixel positions so gradient tile boundaries
// and note edges always land on whole CSS pixels, eliminating sub-pixel aliasing.
// Hit-testing (clientXToGridBeat) keeps using raw pxPerBeat for accuracy.
const pxPerBeatRender = computed(() => Math.round(pxPerBeat.value));
const pxPerMeasureRender = computed(() => Math.round(pxPerMeasure.value));

const GRID_WIDTH = computed(() => {
  const cw = timelineCtx?.contentWidth.value ?? 0;
  const sf = timelineCtx?.scaleFactor.value ?? 1;
  return Math.max(6000, cw * sf);
});

// ── Offset time (from context or zero) ───────────────────────────────────────

const offsetTimePx = computed(() =>
  (timelineCtx?.offsetTime.value ?? 0) * pxPerSec.value,
);

// ── Pitches ───────────────────────────────────────────────────────────────────

const pitches = computed(() =>
  filterPitchesByOctaveRange(PIANO_INSTRUMENT.pitches, props.node.octaveRange),
);

const totalGridHeight = computed(() => pitches.value.length * NOTE_HEIGHT_PX);

const visibleNotes = computed(() => {
  const ids = new Set(pitches.value.map((p) => p.key));
  return props.node.notes.filter((n) => ids.has(n.pitchKey));
});

// ── Snap (current note type in beats) ─────────────────────────────────────────

const noteDurationBeats = computed(() =>
  getNoteDurationBeats(
    props.node.selectedNoteType,
    props.node.timeSignature.beatUnit,
  ),
);

const beatsPerMeasure = computed(
  () => props.node.timeSignature.beatsPerMeasure,
);

const snapBeats = computed(() =>
  computeSnapBeats(noteDurationBeats.value, beatsPerMeasure.value),
);

// ── Grid background ───────────────────────────────────────────────────────────

const gridBackground = computed(() => {
  const mpx = pxPerMeasureRender.value;
  const bpx = pxPerBeatRender.value;
  const rh = NOTE_HEIGHT_PX;

  const measureLine = "rgba(255,255,255,0.12)";
  const beatLine = "rgba(255,255,255,0.05)";
  const rowLine = "rgba(255,255,255,0.04)";

  const hGrad = `repeating-linear-gradient(
    to bottom,
    transparent 0px, transparent ${rh - 1}px,
    ${rowLine} ${rh - 1}px, ${rowLine} ${rh}px
  )`;

  const vGrad =
    bpx > 4
      ? `repeating-linear-gradient(
          to right,
          ${beatLine} 0px, ${beatLine} 1px,
          transparent 1px, transparent ${bpx}px
        )`
      : null;

  const mGrad = `repeating-linear-gradient(
    to right,
    ${measureLine} 0px, ${measureLine} 1px,
    transparent 1px, transparent ${mpx}px
  )`;

  return [hGrad, vGrad, mGrad].filter(Boolean).join(", ");
});

// ── Note preview ──────────────────────────────────────────────────────────────

const notePreview = useNotePreview();

// ── Shared tool context ───────────────────────────────────────────────────────

const allNotes = computed(() => props.node.notes);

/** Converts viewport clientX → raw (unsnapped) beat, accounting for translateX scroll. */
function clientXToBeat(clientX: number): number {
  const rect = gridRef.value?.getBoundingClientRect();
  if (!rect) return 0;
  // gridRef has translateX applied, so getBoundingClientRect().left already accounts for scroll
  return Math.max(0, clientX - rect.left) / pxPerBeat.value;
}

/** Converts viewport clientY → pitch row index (clamped). */
function clientYToPitchIdx(clientY: number): number {
  const rect = gridRef.value?.getBoundingClientRect();
  if (!rect) return 0;
  const py = clientY - rect.top;
  return Math.max(
    0,
    Math.min(pitches.value.length - 1, Math.floor(py / NOTE_HEIGHT_PX)),
  );
}

const toolCtxBase = {
  notes: allNotes,
  pitches,
  pxPerBeat,
  snapBeats,
  noteDurationBeats,
  beatsPerMeasure,
  rowHeightPx: NOTE_HEIGHT_PX,
  clientXToBeat,
  clientYToPitchIdx,
  scrollRef: timelineCtx?.scrollEl ?? ref<HTMLDivElement | undefined>(undefined),
  emitNotes: (notes: PlacedNote[]) => emit("update:notes", notes),
  onPlace: (pitchId: string) => notePreview.playNote(pitchId),
};

// ── Tool composables ──────────────────────────────────────────────────────────

const placeTool = usePlaceTool(toolCtxBase);
const panTool = usePanTool(toolCtxBase);
const copyTool = useCopyTool({
  ...toolCtxBase,
  onCopied: (count) => emit("copied", count),
});
const cutTool = useCutTool({
  ...toolCtxBase,
  onCopied: (count) => emit("cut", count),
});
const pasteTool = usePasteTool(toolCtxBase);

// ── Mouse event dispatch ──────────────────────────────────────────────────────

function dispatch<K extends "onMousedown" | "onMousemove" | "onMouseleave">(
  method: K,
  ...args: Parameters<ReturnType<typeof usePlaceTool>[K]>
): void {
  const tool =
    props.activeTool === "place"
      ? placeTool
      : props.activeTool === "pan"
        ? panTool
        : props.activeTool === "copy"
          ? copyTool
          : props.activeTool === "cut"
            ? cutTool
            : pasteTool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tool[method] as (...a: any[]) => void)(...args);
}

function onMousedown(evt: MouseEvent): void {
  if (props.readonly) return;
  if (props.activeTool === "zoom-select") {
    onZoomMousedown(evt);
    return;
  }
  dispatch("onMousedown", evt);
}
function onMousemove(evt: MouseEvent): void {
  if (props.readonly) return;
  if (props.activeTool === "zoom-select") return;
  dispatch("onMousemove", evt);
}
function onMouseleave(): void {
  if (props.activeTool === "zoom-select") return;
  dispatch("onMouseleave");
}

// ── Active cursor ──────────────────────────────────────────────────────────────

const activeCursor = computed(() => {
  if (props.readonly) return "not-allowed";
  if (props.activeTool === "zoom-select") return "crosshair";
  if (props.activeTool === "place") return placeTool.cursor;
  if (props.activeTool === "pan") return panTool.cursor;
  if (props.activeTool === "copy") return copyTool.cursor;
  if (props.activeTool === "cut") return cutTool.cursor;
  return pasteTool.cursor;
});

// ── Display notes ─────────────────────────────────────────────────────────────

/**
 * During a pan drag, replace the displayed positions with the real-time
 * preview. Outside of a pan drag this is identical to visibleNotes.
 */
const displayNotes = computed(() => {
  if (props.activeTool === "pan" && panTool.previewNotes.value) {
    const ids = new Set(pitches.value.map((p) => p.key));
    return panTool.previewNotes.value.filter((n) => ids.has(n.pitchKey));
  }
  return visibleNotes.value;
});

// ── Note style helpers ────────────────────────────────────────────────────────

function noteLeft(note: PlacedNote): number {
  return Math.round(note.startBeat * pxPerBeatRender.value);
}
function noteWidth(note: PlacedNote): number {
  return Math.max(2, Math.round(note.durationBeats * pxPerBeatRender.value));
}
function noteTop(note: PlacedNote): number {
  const idx = pitches.value.findIndex((p) => p.key === note.pitchKey);
  return idx >= 0 ? idx * NOTE_HEIGHT_PX : 0;
}

/** Background colour for a placed note — dimmed when being dragged away. */
function noteColor(note: PlacedNote): string {
  if (
    props.activeTool === "copy" &&
    copyTool.selectedNoteIds.value.has(note.id)
  ) {
    return "var(--color-secondary)";
  }
  if (
    props.activeTool === "cut" &&
    cutTool.selectedNoteIds.value.has(note.id)
  ) {
    return "var(--color-warning)";
  }
  if (
    props.activeTool === "pan" &&
    panTool.isDragging.value &&
    panTool.draggedIds.value.has(note.id)
  ) {
    return "color-mix(in oklab, var(--color-primary) 60%, transparent)";
  }
  return "var(--color-primary)";
}

// ── Beat-line pixel position ──────────────────────────────────────────────────

/** Left offset (px) for the pan / paste beat-line indicator. */
const beatLinePx = computed<number | null>(() => {
  let beat: number | null = null;
  if (props.activeTool === "pan") {
    beat = panTool.beatLine.value;
  } else if (props.activeTool === "copy" && !copyTool.isSelecting.value) {
    beat = copyTool.beatLine.value;
  } else if (props.activeTool === "cut" && !cutTool.isSelecting.value) {
    beat = cutTool.beatLine.value;
  } else if (props.activeTool === "paste") {
    beat = pasteTool.beatLine.value;
  }
  return beat !== null ? Math.round(beat * pxPerBeatRender.value) : null;
});

// ── Copy / Cut selection overlay ──────────────────────────────────────────────

const selectionOverlay = computed(() => {
  const range =
    props.activeTool === "copy"
      ? copyTool.selectionRange.value
      : props.activeTool === "cut"
        ? cutTool.selectionRange.value
        : null;
  if (!range) return null;
  return {
    left: Math.round(range.start * pxPerBeatRender.value),
    width: Math.round((range.end - range.start) * pxPerBeatRender.value),
    color:
      props.activeTool === "cut" ? "var(--color-warning)" : "var(--color-info)",
  };
});

// ── Zoom-select tool ──────────────────────────────────────────────────────────

const isZoomSelecting = ref(false);
const zoomDragStartBeat = ref(0);
const zoomDragEndBeat = ref(0);

/** Convert viewport clientX to a beat in full-grid space (accounts for scroll). */
function clientXToGridBeat(clientX: number): number {
  if (!gridRef.value) return 0;
  const rect = gridRef.value.getBoundingClientRect();
  return Math.max(0, clientX - rect.left) / pxPerBeat.value;
}

const onZoomDocMousemove = (evt: MouseEvent) => {
  zoomDragEndBeat.value = clientXToGridBeat(evt.clientX);
};

const onZoomDocMouseup = () => {
  document.removeEventListener("mousemove", onZoomDocMousemove);
  isZoomSelecting.value = false;

  const start = Math.min(zoomDragStartBeat.value, zoomDragEndBeat.value);
  const end = Math.max(zoomDragStartBeat.value, zoomDragEndBeat.value);
  const secPerBeat = getSecondsPerBeat(props.node.bpm);
  // Ignore tiny drags (< 10ms)
  if ((end - start) * secPerBeat < 0.01) {
    zoomDragStartBeat.value = 0;
    zoomDragEndBeat.value = 0;
    return;
  }

  emit("zoom-select", start * secPerBeat, end * secPerBeat);
  zoomDragStartBeat.value = 0;
  zoomDragEndBeat.value = 0;
};

function onZoomMousedown(evt: MouseEvent): void {
  if (evt.button !== 0) return;
  evt.preventDefault();
  const beat = clientXToGridBeat(evt.clientX);
  zoomDragStartBeat.value = beat;
  zoomDragEndBeat.value = beat;
  isZoomSelecting.value = true;
  document.addEventListener("mousemove", onZoomDocMousemove);
  document.addEventListener("mouseup", onZoomDocMouseup, { once: true });
}

onUnmounted(() => {
  document.removeEventListener("mousemove", onZoomDocMousemove);
  document.removeEventListener("mouseup", onZoomDocMouseup);
});

// ── Playhead ──────────────────────────────────────────────────────────────────

const playheadLeft = computed(
  () =>
    LABEL_WIDTH_PX +
    ((props.currentTime ?? 0) - (timelineCtx?.offsetTime.value ?? 0)) * pxPerSec.value,
);

// ── Programmatic scroll (for zoom-in / zoom-select from parent) ────────────────
</script>

<template>
  <div
    class="relative flex flex-col h-full w-full overflow-hidden bg-base-100 select-none"
  >
    <!-- ── Roll body ──────────────────────────────────────────────────────── -->
    <div
      class="flex-1 flex overflow-y-auto overflow-x-hidden"
    >
      <!-- Left pitch labels — sticky so they don't scroll horizontally -->
      <PianoRollKeys
        :pitches="pitches"
        :row-height-px="NOTE_HEIGHT_PX"
        :width-px="LABEL_WIDTH_PX"
        :disabled="readonly"
      />

      <!-- Note grid -->
      <div
        ref="gridRef"
        class="relative shrink-0"
        :style="{
          width: `${GRID_WIDTH}px`,
          height: `${totalGridHeight}px`,
          background: gridBackground,
          cursor: activeCursor,
          transform: `translateX(${-Math.round(offsetTimePx)}px)`,
        }"
        @mousemove="onMousemove"
        @mouseleave="onMouseleave"
        @mousedown="onMousedown"
        @contextmenu.prevent
      >
        <!-- Black-key row tints -->
        <div
          v-for="(pitch, idx) in pitches"
          :key="`bg-${pitch.key}`"
          class="absolute left-0 right-0 pointer-events-none"
          :class="pitch.key.includes('#') ? 'bg-base-300/20' : ''"
          :style="{
            top: `${idx * NOTE_HEIGHT_PX}px`,
            height: `${NOTE_HEIGHT_PX}px`,
          }"
        />

        <!-- ── Placed / preview notes ────────────────────────────────────── -->
        <div
          v-for="note in displayNotes"
          :key="note.id"
          class="absolute rounded-sm pointer-events-none transition-colors duration-75"
          :style="{
            left: `${noteLeft(note)}px`,
            width: `${noteWidth(note)}px`,
            top: `${noteTop(note)}px`,
            height: `${NOTE_HEIGHT_PX - 1}px`,
            backgroundColor: noteColor(note),
          }"
        />

        <!-- ── Place tool: hover preview ────────────────────────────────── -->
        <div
          v-if="activeTool === 'place' && placeTool.hoverPreviewNote.value"
          class="absolute rounded-sm pointer-events-none border border-dashed"
          :style="{
            left: `${noteLeft(placeTool.hoverPreviewNote.value)}px`,
            width: `${noteWidth(placeTool.hoverPreviewNote.value)}px`,
            top: `${noteTop(placeTool.hoverPreviewNote.value)}px`,
            height: `${NOTE_HEIGHT_PX - 1}px`,
            backgroundColor: placeTool.hoverHasOverlap.value
              ? 'color-mix(in oklab, var(--color-warning) 50%, transparent)'
              : 'color-mix(in oklab, var(--color-primary) 50%, transparent)',
            borderColor: placeTool.hoverHasOverlap.value
              ? 'var(--color-warning)'
              : 'var(--color-primary)',
            opacity: 0.7,
          }"
        />

        <!-- ── Pan / Paste tool: beat-line indicator ─────────────────────── -->
        <div
          v-if="beatLinePx !== null"
          class="absolute top-0 bottom-0 w-0.5 pointer-events-none z-10"
          :style="{
            left: `${beatLinePx}px`,
            backgroundColor:
              activeTool === 'paste'
                ? 'var(--color-secondary)'
                : activeTool === 'copy'
                  ? 'var(--color-info)'
                  : activeTool === 'cut'
                    ? 'var(--color-warning)'
                    : 'var(--color-accent)',
            opacity: 0.8,
          }"
        />

        <!-- ── Paste tool: ghost notes ───────────────────────────────────── -->
        <template v-if="activeTool === 'paste' && pasteTool.ghostNotes.value">
          <div
            v-for="ghost in pasteTool.ghostNotes.value"
            :key="ghost.id"
            class="absolute rounded-sm pointer-events-none border border-dashed"
            :style="{
              left: `${noteLeft(ghost)}px`,
              width: `${noteWidth(ghost)}px`,
              top: `${noteTop(ghost)}px`,
              height: `${NOTE_HEIGHT_PX - 1}px`,
              backgroundColor:
                'color-mix(in oklab, var(--color-secondary) 40%, transparent)',
              borderColor: 'var(--color-secondary)',
              opacity: 0.75,
            }"
          />
        </template>

        <!-- ── Copy / Cut tool: selection rectangle ───────────────────────── -->
        <div
          v-if="
            (activeTool === 'copy' || activeTool === 'cut') && selectionOverlay
          "
          class="absolute top-0 bottom-0 pointer-events-none z-10"
          :style="{
            left: `${selectionOverlay.left}px`,
            width: `${selectionOverlay.width}px`,
            backgroundColor: `color-mix(in oklab, ${selectionOverlay.color} 15%, transparent)`,
            borderLeft: `1px solid color-mix(in oklab, ${selectionOverlay.color} 60%, transparent)`,
            borderRight: `1px solid color-mix(in oklab, ${selectionOverlay.color} 60%, transparent)`,
          }"
        />

        <!-- ── Zoom-select: rubber-band overlay ───────────────────────────── -->
        <div
          v-if="activeTool === 'zoom-select' && isZoomSelecting"
          class="absolute top-0 bottom-0 pointer-events-none z-20"
          :style="{
            left: `${Math.min(zoomDragStartBeat, zoomDragEndBeat) * pxPerBeatRender}px`,
            width: `${Math.abs(zoomDragEndBeat - zoomDragStartBeat) * pxPerBeatRender}px`,
            backgroundColor: 'color-mix(in oklab, var(--color-primary) 15%, transparent)',
            borderLeft: '1px solid color-mix(in oklab, var(--color-primary) 60%, transparent)',
            borderRight: '1px solid color-mix(in oklab, var(--color-primary) 60%, transparent)',
          }"
        />
      </div>
    </div>

    <!-- Playhead overlay -->
    <div
      v-if="currentTime !== undefined"
      class="absolute top-0 bottom-0 w-px bg-accent opacity-75 pointer-events-none z-5"
      :style="{ left: `${playheadLeft}px` }"
      aria-hidden="true"
    />
  </div>
</template>
