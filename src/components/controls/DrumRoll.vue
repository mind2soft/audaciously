<script lang="ts">
/**
 * Module-level export so parent components (DrumNodeView) can read the label
 * width and align their own header columns accordingly.
 */
export const DRUM_ROLL_LABEL_WIDTH = 80;
</script>

<script setup lang="ts">
/**
 * DrumRoll — interactive drum note editor for an InstrumentNode.
 *
 * The toolbar (BPM, zoom) has been removed — those live in DrumNodeView.
 * This component is a pure grid editor.
 *
 * Props
 * ─────
 * node        InstrumentNode (drums kind).
 * zoomRatio   Zoom multiplier (required; owned by parent DrumNodeView).
 * activeTool  Which editing tool is currently active.
 * currentTime Current playback position in seconds — drives the playhead overlay.
 *
 * Emits
 * ─────
 * update:notes   New notes array after add/remove.
 * scroll         New scrollLeft (px) whenever the scroll container scrolls.
 * copied         Number of notes copied to the clipboard (> 0 guaranteed).
 * cut            Number of notes cut from the roll (> 0 guaranteed).
 */

import { computed, onUnmounted, ref, inject } from "vue";
import { nanoid } from "nanoid";
import { DRUMS_INSTRUMENT } from "../../lib/music/instruments";
import {
  getSecondsPerBeat,
  getNoteDurationBeats,
} from "../../lib/audio/track/instrument/utils";
import { baseSecondWidthInPixels } from "../../lib/util/formatTime";
import type { InstrumentNode, PlacedNote } from "../../features/nodes";
import type { PianoRollToolId } from "../../lib/piano-roll/tool-types";
import { computeSnapBeats } from "../../lib/piano-roll/note-utils";
import { useDrumPreview } from "../../composables/useDrumPreview";
import { usePanTool } from "../../composables/usePanTool";
import { useCopyTool } from "../../composables/useCopyTool";
import { useCutTool } from "../../composables/useCutTool";
import { usePasteTool } from "../../composables/usePasteTool";
import DrumRollKeys from "./DrumRollKeys.vue";
import { scrollableTimelineKey } from "../../lib/scrollable-timeline";

const ROW_HEIGHT_PX = DRUMS_INSTRUMENT.rowHeight;
const LABEL_WIDTH_PX = DRUM_ROLL_LABEL_WIDTH;

const props = defineProps<{
  node: InstrumentNode;
  zoomRatio?: number;
  /** Which editing tool is currently active. */
  activeTool?: PianoRollToolId;
  /** Current playback position in seconds — drives the playhead overlay. */
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

// ── Derived pixel constants ───────────────────────────────────────────────────

const timelineCtx = inject(scrollableTimelineKey, null);

const GRID_WIDTH = computed(() => {
  const cw = timelineCtx?.contentWidth.value ?? 0;
  const sf = timelineCtx?.scaleFactor.value ?? 1;
  return Math.max(6000, cw * sf);
});

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
// Hit-testing (clientXToRawBeat) keeps using raw pxPerBeat for accuracy.
const pxPerBeatRender = computed(() => Math.round(pxPerBeat.value));
const pxPerMeasureRender = computed(() => Math.round(pxPerMeasure.value));

// ── Pitches ───────────────────────────────────────────────────────────────────

const pitches = DRUMS_INSTRUMENT.pitches;
const pitchesRef = computed(() => pitches);
const totalGridHeight = pitches.length * ROW_HEIGHT_PX;

// ── Grid background ───────────────────────────────────────────────────────────

const gridBackground = computed(() => {
  const mpx = pxPerMeasureRender.value;
  const bpx = pxPerBeatRender.value;

  const measureLine = "rgba(255,255,255,0.12)";
  const beatLine = "rgba(255,255,255,0.05)";
  const rowLine = "rgba(255,255,255,0.06)";

  const hGrad = `repeating-linear-gradient(
    to bottom,
    transparent 0px, transparent ${ROW_HEIGHT_PX - 1}px,
    ${rowLine} ${ROW_HEIGHT_PX - 1}px, ${rowLine} ${ROW_HEIGHT_PX}px
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

// ── Refs ──────────────────────────────────────────────────────────────────────

const gridRef = ref<HTMLDivElement>();

// ── Offset time (from context or zero) ───────────────────────────────────────

const offsetTimePx = computed(
  () => (timelineCtx?.offsetTime.value ?? 0) * pxPerSec.value,
);

// ── Snap ──────────────────────────────────────────────────────────────────────

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

// ── Drum preview ──────────────────────────────────────────────────────────────

const { playHit } = useDrumPreview();

// ── Shared tool context ───────────────────────────────────────────────────────

const allNotes = computed(() => props.node.notes);

/** Converts viewport clientX → raw (unsnapped) beat, accounting for translateX scroll. */
function clientXToBeat(clientX: number): number {
  const rect = gridRef.value?.getBoundingClientRect();
  if (!rect) return 0;
  return clientX - rect.left < 0 ? 0 : (clientX - rect.left) / pxPerBeat.value;
}

const toolCtxBase = {
  notes: allNotes,
  pitches: pitchesRef,
  pxPerBeat,
  snapBeats,
  noteDurationBeats,
  beatsPerMeasure,
  rowHeightPx: ROW_HEIGHT_PX,
  clientXToBeat,
  scrollRef:
    timelineCtx?.scrollEl ?? ref<HTMLDivElement | undefined>(undefined),
  emitNotes: (notes: PlacedNote[]) => emit("update:notes", notes),
};

// ── Tool composables ──────────────────────────────────────────────────────────

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

// ── Coordinate helpers ────────────────────────────────────────────────────────

/**
 * Convert viewport clientX to a raw (unsnapped) beat.
 * Uses the clientXToBeat callback (shared with tool composables).
 */
function clientXToRawBeat(clientX: number): number {
  return clientXToBeat(clientX);
}

/**
 * Snap a raw beat to the nearest grid position at or before the cursor.
 * Uses floor (not round) so the cursor always lands inside the placed note,
 * matching the original InstrumentRollView behaviour.
 */
function rawBeatToStartBeat(rawBeat: number): number {
  const snap = snapBeats.value;
  const snapped = Math.floor((rawBeat + Number.EPSILON) / snap) * snap;
  return Math.max(0, Number(snapped.toFixed(6)));
}

function clientYToPitchIdx(clientY: number): number {
  if (!gridRef.value) return 0;
  const rect = gridRef.value.getBoundingClientRect();
  const py = clientY - rect.top;
  return Math.max(
    0,
    Math.min(pitches.length - 1, Math.floor(py / ROW_HEIGHT_PX)),
  );
}

function hitTestNote(rawBeat: number, pitchKey: string): PlacedNote | null {
  for (const note of props.node.notes) {
    if (
      note.pitchKey === pitchKey &&
      rawBeat >= note.startBeat &&
      rawBeat < note.startBeat + note.durationBeats
    ) {
      return note;
    }
  }
  return null;
}

// ── Hover preview (place tool only) ──────────────────────────────────────────

const hoverStartBeat = ref<number | null>(null);
const hoverPitchId = ref<string | null>(null);

// ── Zoom-select tool ──────────────────────────────────────────────────────────

const isZoomSelecting = ref(false);
const zoomDragStartBeat = ref(0);
const zoomDragEndBeat = ref(0);

const onZoomDocMousemove = (evt: MouseEvent) => {
  zoomDragEndBeat.value = clientXToRawBeat(evt.clientX);
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
  const beat = clientXToRawBeat(evt.clientX);
  zoomDragStartBeat.value = beat;
  zoomDragEndBeat.value = beat;
  isZoomSelecting.value = true;
  document.addEventListener("mousemove", onZoomDocMousemove);
  document.addEventListener("mouseup", onZoomDocMouseup, { once: true });
}

// ── Mouse event dispatch ──────────────────────────────────────────────────────

function dispatchTool<K extends "onMousedown" | "onMousemove" | "onMouseleave">(
  method: K,
  ...args: Parameters<ReturnType<typeof usePanTool>[K]>
): void {
  const tool =
    props.activeTool === "pan"
      ? panTool
      : props.activeTool === "copy"
        ? copyTool
        : props.activeTool === "cut"
          ? cutTool
          : pasteTool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tool[method] as (...a: any[]) => void)(...args);
}

const onMousedown = (evt: MouseEvent) => {
  if (evt.button !== 0) return;
  if (props.readonly) return;
  evt.preventDefault();

  const activeTool = props.activeTool ?? "place";

  if (activeTool === "zoom-select") {
    onZoomMousedown(evt);
    return;
  }

  if (activeTool === "place") {
    const rawBeat = clientXToRawBeat(evt.clientX);
    const pitchId = pitches[clientYToPitchIdx(evt.clientY)]?.key;
    if (!pitchId) return;

    // Hit-test uses raw beat (not centered start beat)
    const existing = hitTestNote(rawBeat, pitchId);
    if (existing) {
      emit(
        "update:notes",
        props.node.notes.filter((n) => n.id !== existing.id),
      );
    } else {
      const startBeat = rawBeatToStartBeat(rawBeat);
      const newNote: PlacedNote = {
        id: nanoid(),
        startBeat,
        durationBeats: noteDurationBeats.value,
        pitchKey: pitchId,
      };
      emit("update:notes", [...props.node.notes, newNote]);
      playHit(pitchId);
    }

    document.addEventListener("mouseup", onDocMouseup, { once: true });
  } else {
    dispatchTool("onMousedown", evt);
  }
};

const onMousemove = (evt: MouseEvent) => {
  if (props.readonly) return;

  const activeTool = props.activeTool ?? "place";

  if (activeTool === "zoom-select") return; // handled via document listener

  if (activeTool === "place") {
    hoverStartBeat.value = rawBeatToStartBeat(clientXToRawBeat(evt.clientX));
    hoverPitchId.value = pitches[clientYToPitchIdx(evt.clientY)]?.key ?? null;
  } else {
    hoverStartBeat.value = null;
    hoverPitchId.value = null;
    dispatchTool("onMousemove", evt);
  }
};

const onMouseleave = () => {
  hoverStartBeat.value = null;
  hoverPitchId.value = null;

  const activeTool = props.activeTool ?? "place";
  if (activeTool === "zoom-select") return;
  if (activeTool !== "place") {
    dispatchTool("onMouseleave");
  }
};

const onDocMouseup = () => {};

onUnmounted(() => {
  document.removeEventListener("mouseup", onDocMouseup);
  document.removeEventListener("mousemove", onZoomDocMousemove);
  document.removeEventListener("mouseup", onZoomDocMouseup);
});

// ── Scroll ────────────────────────────────────────────────────────────────────

// ── Playhead overlay ──────────────────────────────────────────────────────────

/**
 * Pixel offset from the left edge of the outer container to the playhead.
 * = label column width + (currentTime in px) - scroll offset
 */
const playheadLeft = computed(
  () =>
    LABEL_WIDTH_PX +
    ((props.currentTime ?? 0) - (timelineCtx?.offsetTime.value ?? 0)) *
      pxPerSec.value,
);

// ── Programmatic scroll (for zoom-in / zoom-select from parent) ────────────────

// ── Active cursor ─────────────────────────────────────────────────────────────

const activeCursor = computed(() => {
  if (props.readonly) return "not-allowed";
  const tool = props.activeTool ?? "place";
  if (tool === "zoom-select") return "crosshair";
  if (tool === "place") return "crosshair";
  if (tool === "pan") return panTool.cursor;
  if (tool === "copy") return copyTool.cursor;
  if (tool === "cut") return cutTool.cursor;
  return pasteTool.cursor;
});

// ── Display notes (pan preview) ───────────────────────────────────────────────

const displayNotes = computed(() => {
  if (props.activeTool === "pan" && panTool.previewNotes.value) {
    return panTool.previewNotes.value;
  }
  return props.node.notes;
});

// ── Note style helpers ────────────────────────────────────────────────────────

const noteLeft = (note: PlacedNote) =>
  Math.round(note.startBeat * pxPerBeatRender.value);
const noteWidth = (note: PlacedNote) =>
  Math.max(4, Math.round(note.durationBeats * pxPerBeatRender.value));
const noteTop = (note: PlacedNote) => {
  const idx = pitches.findIndex((p) => p.key === note.pitchKey);
  return idx >= 0 ? idx * ROW_HEIGHT_PX : 0;
};

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
    return "color-mix(in oklab, var(--color-secondary) 60%, transparent)";
  }
  return "var(--color-secondary)";
}

// ── Beat-line pixel position ──────────────────────────────────────────────────

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
</script>

<template>
  <div
    class="relative flex flex-col h-full w-full overflow-hidden bg-base-100 select-none"
  >
    <!-- Roll body -->
    <div class="flex-1 flex overflow-y-auto overflow-x-hidden">
      <!-- Row labels — sticky so they don't scroll horizontally -->
      <DrumRollKeys
        :pitches="pitches"
        :row-height-px="ROW_HEIGHT_PX"
        :width-px="LABEL_WIDTH_PX"
        :disabled="readonly"
      />

      <!-- Grid -->
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
        <!-- Notes -->
        <div
          v-for="note in displayNotes"
          :key="note.id"
          class="absolute rounded-sm pointer-events-none"
          :style="{
            left: `${noteLeft(note)}px`,
            width: `${noteWidth(note)}px`,
            top: `${noteTop(note)}px`,
            height: `${ROW_HEIGHT_PX - 2}px`,
            backgroundColor: noteColor(note),
          }"
        />

        <!-- Place tool: hover preview -->
        <div
          v-if="
            (activeTool === 'place' || !activeTool) &&
            hoverStartBeat !== null &&
            hoverPitchId !== null
          "
          class="absolute rounded-sm pointer-events-none border border-dashed"
          :style="{
            left: `${Math.round(hoverStartBeat * pxPerBeatRender)}px`,
            width: `${noteWidth({ id: '', startBeat: 0, durationBeats: noteDurationBeats, pitchKey: '' })}px`,
            top: `${pitches.findIndex((p) => p.key === hoverPitchId) * ROW_HEIGHT_PX}px`,
            height: `${ROW_HEIGHT_PX - 2}px`,
            borderColor: 'var(--color-secondary)',
            opacity: 0.5,
          }"
        />

        <!-- Pan / Paste tool: beat-line indicator -->
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

        <!-- Paste tool: ghost notes -->
        <template v-if="activeTool === 'paste' && pasteTool.ghostNotes.value">
          <div
            v-for="ghost in pasteTool.ghostNotes.value"
            :key="ghost.id"
            class="absolute rounded-sm pointer-events-none border border-dashed"
            :style="{
              left: `${noteLeft(ghost)}px`,
              width: `${noteWidth(ghost)}px`,
              top: `${noteTop(ghost)}px`,
              height: `${ROW_HEIGHT_PX - 2}px`,
              backgroundColor:
                'color-mix(in oklab, var(--color-secondary) 40%, transparent)',
              borderColor: 'var(--color-secondary)',
              opacity: 0.75,
            }"
          />
        </template>

        <!-- Copy / Cut tool: selection rectangle -->
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

        <!-- Zoom-select: rubber-band overlay -->
        <div
          v-if="activeTool === 'zoom-select' && isZoomSelecting"
          class="absolute top-0 bottom-0 pointer-events-none z-20"
          :style="{
            left: `${Math.min(zoomDragStartBeat, zoomDragEndBeat) * pxPerBeatRender}px`,
            width: `${Math.abs(zoomDragEndBeat - zoomDragStartBeat) * pxPerBeatRender}px`,
            backgroundColor:
              'color-mix(in oklab, var(--color-primary) 15%, transparent)',
            borderLeft:
              '1px solid color-mix(in oklab, var(--color-primary) 60%, transparent)',
            borderRight:
              '1px solid color-mix(in oklab, var(--color-primary) 60%, transparent)',
          }"
        />
      </div>
    </div>

    <!-- Playhead overlay — spans full roll height, stays in viewport-space -->
    <div
      v-if="currentTime !== undefined"
      class="absolute top-0 bottom-0 w-px bg-accent opacity-75 pointer-events-none z-5"
      :style="{ left: `${playheadLeft}px` }"
      aria-hidden="true"
    />
  </div>
</template>
