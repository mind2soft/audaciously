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
 * currentTime Current playback position in seconds — drives the playhead overlay.
 *
 * Emits
 * ─────
 * update:notes   New notes array after add/remove.
 * scroll         New scrollLeft (px) whenever the scroll container scrolls.
 */

import { computed, onUnmounted, ref } from "vue";
import { nanoid } from "nanoid";
import { DRUMS_INSTRUMENT } from "../../lib/music/instruments";
import {
  getSecondsPerBeat,
  getNoteDurationBeats,
} from "../../lib/audio/track/instrument/utils";
import { baseSecondWidthInPixels } from "../../lib/util/formatTime";
import type { InstrumentNode, PlacedNote } from "../../features/nodes";

const ROW_HEIGHT_PX = DRUMS_INSTRUMENT.rowHeight;
const LABEL_WIDTH_PX = DRUM_ROLL_LABEL_WIDTH;
const GRID_WIDTH = 6000;

const props = defineProps<{
  node: InstrumentNode;
  zoomRatio: number;
  /** Current playback position in seconds — drives the playhead overlay. */
  currentTime?: number;
}>();

const emit = defineEmits<{
  "update:notes": [notes: PlacedNote[]];
  scroll: [scrollLeft: number];
}>();

// ── Derived pixel constants ───────────────────────────────────────────────────

const pxPerBeat = computed(
  () => getSecondsPerBeat(props.node.bpm) * props.zoomRatio * baseSecondWidthInPixels,
);
const pxPerMeasure = computed(
  () => pxPerBeat.value * props.node.timeSignature.beatsPerMeasure,
);

// ── Pitches ───────────────────────────────────────────────────────────────────

const pitches = DRUMS_INSTRUMENT.pitches;
const totalGridHeight = pitches.length * ROW_HEIGHT_PX;

// ── Grid background ───────────────────────────────────────────────────────────

const gridBackground = computed(() => {
  const mpx = pxPerMeasure.value;
  const bpx = pxPerBeat.value;

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
const scrollRef = ref<HTMLDivElement>();
/** Tracks scrollLeft reactively so the playhead overlay stays in sync. */
const scrollLeftPx = ref(0);

// ── Coordinate helpers ────────────────────────────────────────────────────────

function noteDurationBeats(): number {
  return getNoteDurationBeats(
    props.node.selectedNoteType,
    props.node.timeSignature.beatUnit,
  );
}

/**
 * Convert viewport clientX to a raw (unsnapped) beat.
 * getBoundingClientRect() already accounts for the container's scroll offset,
 * so we must NOT add scrollLeft.
 */
function clientXToRawBeat(clientX: number): number {
  if (!gridRef.value) return 0;
  const rect = gridRef.value.getBoundingClientRect();
  const px = clientX - rect.left; // correct: no + scrollLeft
  return px / pxPerBeat.value;
}

/**
 * Snap a raw beat to the nearest grid position at or before the cursor.
 * Uses floor (not round) so the cursor always lands inside the placed note,
 * matching the original InstrumentRollView behaviour.
 */
function rawBeatToStartBeat(rawBeat: number): number {
  const snap = noteDurationBeats();
  const snapped = Math.floor((rawBeat + Number.EPSILON) / snap) * snap;
  return Math.max(0, Number(snapped.toFixed(6)));
}

function clientYToPitchIdx(clientY: number): number {
  if (!gridRef.value) return 0;
  const rect = gridRef.value.getBoundingClientRect();
  const py = clientY - rect.top;
  return Math.max(0, Math.min(pitches.length - 1, Math.floor(py / ROW_HEIGHT_PX)));
}

function hitTestNote(rawBeat: number, pitchId: string): PlacedNote | null {
  for (const note of props.node.notes) {
    if (
      note.pitchId === pitchId &&
      rawBeat >= note.startBeat &&
      rawBeat < note.startBeat + note.durationBeats
    ) {
      return note;
    }
  }
  return null;
}

// ── Hover preview ─────────────────────────────────────────────────────────────

const hoverStartBeat = ref<number | null>(null);
const hoverPitchId = ref<string | null>(null);

const onMousemove = (evt: MouseEvent) => {
  hoverStartBeat.value = rawBeatToStartBeat(clientXToRawBeat(evt.clientX));
  hoverPitchId.value = pitches[clientYToPitchIdx(evt.clientY)]?.id ?? null;
};

const onMouseleave = () => {
  hoverStartBeat.value = null;
  hoverPitchId.value = null;
};

// ── Interaction ───────────────────────────────────────────────────────────────

const onMousedown = (evt: MouseEvent) => {
  if (evt.button !== 0) return;
  evt.preventDefault();

  const rawBeat = clientXToRawBeat(evt.clientX);
  const pitchId = pitches[clientYToPitchIdx(evt.clientY)]?.id;
  if (!pitchId) return;

  // Hit-test uses raw beat (not centered start beat)
  const existing = hitTestNote(rawBeat, pitchId);
  if (existing) {
    emit("update:notes", props.node.notes.filter((n) => n.id !== existing.id));
  } else {
    const startBeat = rawBeatToStartBeat(rawBeat);
    const newNote: PlacedNote = {
      id: nanoid(),
      startBeat,
      durationBeats: noteDurationBeats(),
      pitchId,
    };
    emit("update:notes", [...props.node.notes, newNote]);
  }

  document.addEventListener("mouseup", onDocMouseup, { once: true });
};

const onDocMouseup = () => {};

onUnmounted(() => {
  document.removeEventListener("mouseup", onDocMouseup);
});

// ── Scroll ────────────────────────────────────────────────────────────────────

const onScrollBody = () => {
  const sl = scrollRef.value?.scrollLeft ?? 0;
  scrollLeftPx.value = sl;
  emit("scroll", sl);
};

// ── Playhead overlay ──────────────────────────────────────────────────────────

/**
 * Pixel offset from the left edge of the outer container to the playhead.
 * = label column width + (currentTime in px) - scroll offset
 */
const playheadLeft = computed(() =>
  LABEL_WIDTH_PX +
  (props.currentTime ?? 0) * props.zoomRatio * baseSecondWidthInPixels -
  scrollLeftPx.value,
);

// ── Note positioning ──────────────────────────────────────────────────────────

const noteLeft = (note: PlacedNote) => note.startBeat * pxPerBeat.value;
const noteWidth = (note: PlacedNote) => Math.max(4, note.durationBeats * pxPerBeat.value);
const noteTop = (note: PlacedNote) => {
  const idx = pitches.findIndex((p) => p.id === note.pitchId);
  return idx >= 0 ? idx * ROW_HEIGHT_PX : 0;
};
</script>

<template>
  <div class="relative flex flex-col h-full w-full overflow-hidden bg-base-100 select-none">
    <!-- Roll body -->
    <div ref="scrollRef" class="flex-1 flex overflow-auto" @scroll="onScrollBody">
      <!-- Row labels — sticky so they don't scroll horizontally -->
      <div
        class="sticky left-0 z-10 shrink-0 self-start overflow-hidden flex flex-col border-r border-base-300/60 bg-base-200"
        :style="{ width: `${LABEL_WIDTH_PX}px` }"
      >
        <div
          v-for="pitch in pitches"
          :key="pitch.id"
          class="shrink-0 flex items-center px-2 text-xs leading-none text-base-content/70"
          :style="{ height: `${ROW_HEIGHT_PX}px` }"
        >
          {{ pitch.label }}
        </div>
      </div>

      <!-- Grid -->
      <div
        ref="gridRef"
        class="relative cursor-crosshair flex-shrink-0"
        :style="{
          width: `${GRID_WIDTH}px`,
          height: `${totalGridHeight}px`,
          background: gridBackground,
        }"
        @mousemove="onMousemove"
        @mouseleave="onMouseleave"
        @mousedown="onMousedown"
        @contextmenu.prevent
      >
        <!-- Notes -->
        <div
          v-for="note in node.notes"
          :key="note.id"
          class="absolute rounded-sm pointer-events-none"
          :style="{
            left: `${noteLeft(note)}px`,
            width: `${noteWidth(note)}px`,
            top: `${noteTop(note)}px`,
            height: `${ROW_HEIGHT_PX - 2}px`,
            backgroundColor: 'var(--color-secondary)',
          }"
        />

        <!-- Hover preview -->
        <div
          v-if="hoverStartBeat !== null && hoverPitchId !== null"
          class="absolute rounded-sm pointer-events-none border border-dashed"
          :style="{
            left: `${hoverStartBeat * pxPerBeat}px`,
            width: `${noteWidth({ id: '', startBeat: 0, durationBeats: noteDurationBeats(), pitchId: '' })}px`,
            top: `${(pitches.findIndex(p => p.id === hoverPitchId)) * ROW_HEIGHT_PX}px`,
            height: `${ROW_HEIGHT_PX - 2}px`,
            borderColor: 'var(--color-secondary)',
            opacity: 0.5,
          }"
        />
      </div>
    </div>

    <!-- Playhead overlay — spans full roll height, stays in viewport-space -->
    <div
      v-if="currentTime !== undefined"
      class="absolute top-0 bottom-0 w-px bg-accent opacity-75 pointer-events-none z-[5]"
      :style="{ left: `${playheadLeft}px` }"
      aria-hidden="true"
    />
  </div>
</template>
