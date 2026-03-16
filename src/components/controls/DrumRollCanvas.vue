<script lang="ts">
/**
 * Module-level export so parent components (DrumNodeView) can read the label
 * width and align their own header columns accordingly.
 */
export const DRUM_ROLL_LABEL_WIDTH = 80;
</script>

<script setup lang="ts">
/**
 * DrumRollCanvas — canvas-based drum note editor for an InstrumentNode.
 *
 * Replaces the DOM-based DrumRoll.vue with a single <canvas> element per roll.
 * Place tool is handled inline (toggle hit on/off) — same pattern as DrumRoll.vue.
 */

import { computed, ref, onMounted, onBeforeUnmount, watch, inject } from "vue";
import { nanoid } from "nanoid";
import { DRUMS_INSTRUMENT } from "../../lib/music/instruments";
import {
  getSecondsPerBeat,
  getNoteDurationBeats,
} from "../../lib/audio/track/instrument/utils";
import { baseSecondWidthInPixels } from "../../lib/util/formatTime";
import type { InstrumentNode, PlacedNote } from "../../features/nodes";
import type { PianoRollToolId } from "../../lib/piano-roll/tool-types";
import { scrollableTimelineKey } from "../../lib/scrollable-timeline";
import { computeSnapBeats } from "../../lib/piano-roll/note-utils";
import { useDrumPreview } from "../../composables/useDrumPreview";
import { usePanTool } from "../../composables/usePanTool";
import { useCopyTool } from "../../composables/useCopyTool";
import { useCutTool } from "../../composables/useCutTool";
import { usePasteTool } from "../../composables/usePasteTool";
import { resolveColor } from "../../lib/util/resolveColor";
import {
  beatToX,
  drawGrid,
  drawNotes,
  drawNoteOutline,
  drawBeatLine,
  drawBand,
  drawPlayhead,
} from "../../composables/useRollCanvasRenderer";
import DrumRollKeys from "./DrumRollKeys.vue";

const ROW_HEIGHT_PX = DRUMS_INSTRUMENT.rowHeight;
const LABEL_WIDTH_PX = DRUM_ROLL_LABEL_WIDTH;

// ── Props / emits ─────────────────────────────────────────────────────────────

const props = defineProps<{
  node: InstrumentNode;
  zoomRatio?: number;
  activeTool?: PianoRollToolId;
  currentTime?: number;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  "update:notes": [notes: PlacedNote[]];
  copied: [noteCount: number];
  cut: [noteCount: number];
  "zoom-select": [startTime: number, endTime: number];
}>();

// ── Canvas ref ────────────────────────────────────────────────────────────────

const canvasRef = ref<HTMLCanvasElement>();

// ── Context from ScrollableTimeline ──────────────────────────────────────────

const timelineCtx = inject(scrollableTimelineKey, null);

// ── Derived beat / pixel constants ────────────────────────────────────────────

const beatsPerSecond = computed(() => props.node.bpm / 60);

const pxPerSec = computed(() =>
  timelineCtx
    ? timelineCtx.pixelsPerSecond.value
    : (props.zoomRatio ?? 1) * baseSecondWidthInPixels,
);

const pxPerBeat = computed(() => pxPerSec.value / beatsPerSecond.value);

const offsetBeat = computed(
  () => (timelineCtx?.offsetTime.value ?? 0) * beatsPerSecond.value,
);

const beatsPerMeasure = computed(
  () => props.node.timeSignature.beatsPerMeasure,
);

// ── Pitches ───────────────────────────────────────────────────────────────────

const pitches = DRUMS_INSTRUMENT.pitches;
const pitchesRef = computed(() => pitches);
const totalGridHeight = pitches.length * ROW_HEIGHT_PX;

/** O(1) pitch-key → row-index lookup */
const pitchIndexMap = computed(() => {
  const m = new Map<string, number>();
  pitches.forEach((p, i) => m.set(p.key, i));
  return m;
});

// ── Snap ──────────────────────────────────────────────────────────────────────

const noteDurationBeats = computed(() =>
  getNoteDurationBeats(
    props.node.selectedNoteType,
    props.node.timeSignature.beatUnit,
  ),
);

const snapBeats = computed(() =>
  computeSnapBeats(noteDurationBeats.value, beatsPerMeasure.value),
);

// ── Drum preview ──────────────────────────────────────────────────────────────

const { playHit } = useDrumPreview();

// ── Coordinate callbacks (passed to tool composables) ─────────────────────────

function clientXToBeat(clientX: number): number {
  const rect = canvasRef.value?.getBoundingClientRect();
  if (!rect) return 0;
  return offsetBeat.value + (clientX - rect.left) / pxPerBeat.value;
}

function clientYToPitchIdx(clientY: number): number {
  const rect = canvasRef.value?.getBoundingClientRect();
  if (!rect) return 0;
  const py = clientY - rect.top;
  return Math.max(0, Math.min(pitches.length - 1, Math.floor(py / ROW_HEIGHT_PX)));
}

// ── Tool context ──────────────────────────────────────────────────────────────

const allNotes = computed(() => props.node.notes);

const toolCtxBase = {
  notes: allNotes,
  pitches: pitchesRef,
  pxPerBeat,
  snapBeats,
  noteDurationBeats,
  beatsPerMeasure,
  rowHeightPx: ROW_HEIGHT_PX,
  clientXToBeat,
  scrollRef: timelineCtx?.scrollEl ?? ref<HTMLDivElement | undefined>(undefined),
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

// ── Inline place-tool state ───────────────────────────────────────────────────

const hoverStartBeat = ref<number | null>(null);
const hoverPitchId = ref<string | null>(null);

function rawBeatToStartBeat(rawBeat: number): number {
  const snap = snapBeats.value;
  const snapped = Math.floor((rawBeat + Number.EPSILON) / snap) * snap;
  return Math.max(0, Number(snapped.toFixed(6)));
}

function hitTestDrumNote(rawBeat: number, pitchKey: string): PlacedNote | null {
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

// ── Display notes (pan preview override) ─────────────────────────────────────

const displayNotes = computed(() => {
  if (props.activeTool === "pan" && panTool.previewNotes.value) {
    return panTool.previewNotes.value;
  }
  return props.node.notes;
});

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

// ── Zoom-select tool ──────────────────────────────────────────────────────────

const isZoomSelecting = ref(false);
const zoomDragStartBeat = ref(0);
const zoomDragEndBeat = ref(0);

const onZoomDocMousemove = (evt: MouseEvent) => {
  zoomDragEndBeat.value = clientXToBeat(evt.clientX);
};

const onZoomDocMouseup = () => {
  document.removeEventListener("mousemove", onZoomDocMousemove);
  isZoomSelecting.value = false;

  const start = Math.min(zoomDragStartBeat.value, zoomDragEndBeat.value);
  const end = Math.max(zoomDragStartBeat.value, zoomDragEndBeat.value);
  const secPerBeat = getSecondsPerBeat(props.node.bpm);
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
  const beat = clientXToBeat(evt.clientX);
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
    const rawBeat = clientXToBeat(evt.clientX);
    const pitchId = pitches[clientYToPitchIdx(evt.clientY)]?.key;
    if (!pitchId) return;

    const existing = hitTestDrumNote(rawBeat, pitchId);
    if (existing) {
      emit("update:notes", props.node.notes.filter((n) => n.id !== existing.id));
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
  } else {
    dispatchTool("onMousedown", evt);
  }
};

const onMousemove = (evt: MouseEvent) => {
  if (props.readonly) return;

  const activeTool = props.activeTool ?? "place";

  if (activeTool === "zoom-select") return;

  if (activeTool === "place") {
    hoverStartBeat.value = rawBeatToStartBeat(clientXToBeat(evt.clientX));
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

// ── rAF render scheduling ─────────────────────────────────────────────────────

let rafId: number | null = null;

function scheduleRender(): void {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    doRender();
  });
}

// ── Canvas render ─────────────────────────────────────────────────────────────

function doRender(): void {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  ctx2d.save();
  ctx2d.scale(dpr, dpr);
  ctx2d.clearRect(0, 0, w, h);

  const primaryColor   = resolveColor("--color-primary");
  const secondaryColor = resolveColor("--color-secondary");
  const accentColor    = resolveColor("--color-accent");
  const warningColor   = resolveColor("--color-warning");
  const infoColor      = resolveColor("--color-info");

  const ob = offsetBeat.value;
  const ppb = pxPerBeat.value;
  const bpm_ = beatsPerMeasure.value;

  // ── Pass 1: Grid ───────────────────────────────────────────────────────────
  drawGrid({
    ctx: ctx2d,
    width: w,
    height: h,
    offsetBeat: ob,
    pxPerBeat: ppb,
    beatsPerMeasure: bpm_,
    rowHeightPx: ROW_HEIGHT_PX,
    pitches,
    drawBlackKeyTints: false,
    blackKeyTintColor: "",
  });

  // ── Pass 2: Notes ──────────────────────────────────────────────────────────
  const colorOverrides = new Map<string, string>();

  if (props.activeTool === "copy") {
    copyTool.selectedNoteIds.value.forEach((id) =>
      colorOverrides.set(id, secondaryColor),
    );
  } else if (props.activeTool === "cut") {
    cutTool.selectedNoteIds.value.forEach((id) =>
      colorOverrides.set(id, warningColor),
    );
  } else if (props.activeTool === "pan" && panTool.isDragging.value) {
    panTool.draggedIds.value.forEach((id) =>
      colorOverrides.set(id, resolveColor("--color-secondary", { opacity: 0.6 })),
    );
  }

  drawNotes({
    ctx: ctx2d,
    width: w,
    notes: displayNotes.value,
    pitchIndexMap: pitchIndexMap.value,
    offsetBeat: ob,
    pxPerBeat: ppb,
    rowHeightPx: ROW_HEIGHT_PX,
    noteHeightPx: ROW_HEIGHT_PX - 2,
    defaultColor: secondaryColor,
    colorOverrides,
  });

  // ── Pass 3: Tool overlays ──────────────────────────────────────────────────

  // Place tool: hover preview
  if (
    (props.activeTool === "place" || !props.activeTool) &&
    hoverStartBeat.value !== null &&
    hoverPitchId.value !== null
  ) {
    const rowIdx = pitchIndexMap.value.get(hoverPitchId.value);
    if (rowIdx !== undefined) {
      const x = beatToX(hoverStartBeat.value, ob, ppb);
      const nw = Math.max(4, noteDurationBeats.value * ppb);
      const y = rowIdx * ROW_HEIGHT_PX + 1;
      drawNoteOutline({
        ctx: ctx2d,
        x,
        y,
        w: nw,
        h: ROW_HEIGHT_PX - 2,
        fillColor: resolveColor("--color-secondary", { opacity: 0.5 }),
        strokeColor: secondaryColor,
        opacity: 0.7,
      });
    }
  }

  // Paste tool: ghost notes
  if (props.activeTool === "paste" && pasteTool.ghostNotes.value) {
    for (const ghost of pasteTool.ghostNotes.value) {
      const rowIdx = pitchIndexMap.value.get(ghost.pitchKey);
      if (rowIdx === undefined) continue;
      const x = beatToX(ghost.startBeat, ob, ppb);
      const nw = Math.max(4, ghost.durationBeats * ppb);
      const y = rowIdx * ROW_HEIGHT_PX + 1;
      drawNoteOutline({
        ctx: ctx2d,
        x,
        y,
        w: nw,
        h: ROW_HEIGHT_PX - 2,
        fillColor: resolveColor("--color-secondary", { opacity: 0.4 }),
        strokeColor: secondaryColor,
        opacity: 0.75,
      });
    }
  }

  // Beat-line indicator
  {
    let beatLineVal: number | null = null;
    let beatLineColor = accentColor;
    if (props.activeTool === "pan") {
      beatLineVal = panTool.beatLine.value;
      beatLineColor = accentColor;
    } else if (props.activeTool === "copy" && !copyTool.isSelecting.value) {
      beatLineVal = copyTool.beatLine.value;
      beatLineColor = infoColor;
    } else if (props.activeTool === "cut" && !cutTool.isSelecting.value) {
      beatLineVal = cutTool.beatLine.value;
      beatLineColor = warningColor;
    } else if (props.activeTool === "paste") {
      beatLineVal = pasteTool.beatLine.value;
      beatLineColor = secondaryColor;
    }
    if (beatLineVal !== null) {
      drawBeatLine(ctx2d, beatLineVal, ob, ppb, h, beatLineColor);
    }
  }

  // Copy / cut selection band
  {
    const range =
      props.activeTool === "copy"
        ? copyTool.selectionRange.value
        : props.activeTool === "cut"
          ? cutTool.selectionRange.value
          : null;
    if (range) {
      const bandColor = props.activeTool === "cut" ? warningColor : infoColor;
      drawBand(ctx2d, range.start, range.end, ob, ppb, h, bandColor);
    }
  }

  // Zoom-select rubber band
  if (props.activeTool === "zoom-select" && isZoomSelecting.value) {
    drawBand(
      ctx2d,
      zoomDragStartBeat.value,
      zoomDragEndBeat.value,
      ob,
      ppb,
      h,
      primaryColor,
    );
  }

  // ── Pass 4: Playhead ───────────────────────────────────────────────────────
  if (props.currentTime !== undefined) {
    const playheadBeat = props.currentTime * beatsPerSecond.value;
    const px = beatToX(playheadBeat, ob, ppb);
    if (px >= 0 && px <= w) {
      drawPlayhead(ctx2d, px, h, accentColor);
    }
  }

  ctx2d.restore();
}

// ── ResizeObserver ────────────────────────────────────────────────────────────

const resizeObserver = new ResizeObserver(scheduleRender);

// ── Watch all reactive deps → schedule render ─────────────────────────────────

watch(
  () => [
    displayNotes.value,
    pxPerBeat.value,
    offsetBeat.value,
    beatsPerMeasure.value,
    props.currentTime,
    props.activeTool,
    hoverStartBeat.value,
    hoverPitchId.value,
    panTool.beatLine.value,
    panTool.isDragging.value,
    panTool.draggedIds.value,
    copyTool.selectionRange.value,
    copyTool.beatLine.value,
    copyTool.selectedNoteIds.value,
    cutTool.selectionRange.value,
    cutTool.beatLine.value,
    cutTool.selectedNoteIds.value,
    pasteTool.beatLine.value,
    pasteTool.ghostNotes.value,
    isZoomSelecting.value,
    zoomDragStartBeat.value,
    zoomDragEndBeat.value,
  ],
  scheduleRender,
);

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  if (canvasRef.value) {
    resizeObserver.observe(canvasRef.value);
    scheduleRender();
  }
});

onBeforeUnmount(() => {
  if (canvasRef.value) resizeObserver.unobserve(canvasRef.value);
  if (rafId !== null) cancelAnimationFrame(rafId);
  document.removeEventListener("mousemove", onZoomDocMousemove);
  document.removeEventListener("mouseup", onZoomDocMouseup);
});
</script>

<template>
  <div
    class="relative flex flex-col h-full w-full overflow-hidden bg-base-100 select-none"
  >
    <!-- ── Roll body ──────────────────────────────────────────────────────── -->
    <div class="flex-1 flex overflow-y-auto overflow-x-hidden">
      <!-- Row labels -->
      <DrumRollKeys
        :pitches="pitches"
        :row-height-px="ROW_HEIGHT_PX"
        :width-px="LABEL_WIDTH_PX"
        :disabled="readonly"
      />

      <!-- Canvas -->
      <div class="relative flex-1 min-w-0 overflow-hidden">
        <canvas
          ref="canvasRef"
          class="block w-full"
          :style="{
            height: `${totalGridHeight}px`,
            cursor: activeCursor,
          }"
          @mousemove="onMousemove"
          @mouseleave="onMouseleave"
          @mousedown="onMousedown"
          @contextmenu.prevent
        />
      </div>
    </div>
  </div>
</template>
