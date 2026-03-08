<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { nanoid } from "nanoid";
import type {
  InstrumentAudioTrack,
  PlacedNote,
} from "../lib/audio/track/instrument";
import type { InstrumentPitch } from "../lib/music/instruments";

/** Each pitch row is always this many pixels tall in the expanded roll. */
const NOTE_HEIGHT_PX = 16;

const props = defineProps<{
  /** Track whose `notes` array is directly mutated on click/drag. */
  track: InstrumentAudioTrack;
  /** Ordered pitch list (already filtered by octave range for piano). */
  pitches: InstrumentPitch[];
  /** Notes pre-filtered to the visible pitch set — avoids re-filtering here. */
  visibleNotes: PlacedNote[];
  isSelected: boolean;
  /** Pixel offset of the current timeline scroll position. */
  timelineOffsetPx: number;
  /** Pixels per beat at the current zoom ratio. */
  pxPerBeat: number;
  /** Pixels per measure at the current zoom ratio. */
  pxPerMeasure: number;
  /** Width of the inner canvas div; wide enough to cover off-screen content. */
  gridWidth: number;
  /** Height of the roll in expanded mode (matches parent EXPANDED_HEIGHT). */
  height: number;
  /** Duration in beats of the currently selected note type. */
  selectedNoteDurationBeats: number;
}>();

// ─── Grid background ──────────────────────────────────────────────────────────

const gridBackground = computed(() => {
  const mpx = props.pxPerMeasure;
  const bpx = props.pxPerBeat;
  const rh = NOTE_HEIGHT_PX;

  const measureLine = "rgba(255,255,255,0.12)";
  const beatLine = "rgba(255,255,255,0.05)";
  const rowLine = "rgba(255,255,255,0.04)";

  const hGrad = `repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent ${rh - 1}px,
    ${rowLine} ${rh - 1}px,
    ${rowLine} ${rh}px
  )`;

  const vGrad =
    bpx > 4
      ? `repeating-linear-gradient(
          to right,
          ${beatLine} 0px,
          ${beatLine} 1px,
          transparent 1px,
          transparent ${bpx}px
        )`
      : null;

  const mGrad = `repeating-linear-gradient(
    to right,
    ${measureLine} 0px,
    ${measureLine} 1px,
    transparent 1px,
    transparent ${mpx}px
  )`;

  return [hGrad, vGrad, mGrad].filter(Boolean).join(", ");
});

// ─── Note positioning ─────────────────────────────────────────────────────────

function noteLeft(note: PlacedNote): number {
  return note.startBeat * props.pxPerBeat;
}

function noteWidth(note: PlacedNote): number {
  return note.durationBeats * props.pxPerBeat;
}

function noteTop(note: PlacedNote): number {
  const pitchIdx = props.pitches.findIndex((p) => p.id === note.pitchId);
  return pitchIdx >= 0 ? pitchIdx * NOTE_HEIGHT_PX : 0;
}

// ─── Beat snapping ────────────────────────────────────────────────────────────

function snapBeatToNoteStart(rawBeat: number): number {
  const durationBeats = props.selectedNoteDurationBeats;
  const snappedBeat =
    Math.floor((rawBeat + Number.EPSILON) / durationBeats) * durationBeats;
  return Math.max(0, Number(snappedBeat.toFixed(6)));
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────

const gridRef = ref<HTMLDivElement>();

/**
 * Convert a clientX to a beat.
 *
 * The inner canvas is shifted by -timelineOffsetPx so note absolute positions
 * align with the viewport. A note at beat B has:
 *   viewport_x = rect.left + (B * pxPerBeat − timelineOffsetPx)
 * Solving for B:
 *   B = ((clientX − rect.left) + timelineOffsetPx) / pxPerBeat
 */
function clientXToBeat(clientX: number, containerEl: HTMLElement): number {
  const rect = containerEl.getBoundingClientRect();
  const absolutePx = clientX - rect.left + props.timelineOffsetPx;
  return snapBeatToNoteStart(absolutePx / props.pxPerBeat);
}

/** Convert a clientY to a pitch index (clamped to valid range). */
function clientYToPitchIdx(clientY: number, containerEl: HTMLElement): number {
  const rect = containerEl.getBoundingClientRect();
  const py = clientY - rect.top;
  return Math.max(
    0,
    Math.min(props.pitches.length - 1, Math.floor(py / NOTE_HEIGHT_PX)),
  );
}

// ─── Note overlap helpers ─────────────────────────────────────────────────────

function notesOverlap(a: PlacedNote, b: PlacedNote): boolean {
  if (a.pitchId !== b.pitchId) return false;
  const aEnd = a.startBeat + a.durationBeats;
  const bEnd = b.startBeat + b.durationBeats;
  return a.startBeat < bEnd && b.startBeat < aEnd;
}

function getOverlappingNoteIds(candidate: PlacedNote): string[] {
  return props.track.notes
    .filter((note) => notesOverlap(note, candidate))
    .map((note) => note.id);
}

function replaceOverlappingNotes(candidate: PlacedNote): void {
  const overlappingNoteIds = new Set(getOverlappingNoteIds(candidate));
  if (overlappingNoteIds.size > 0) {
    for (let index = props.track.notes.length - 1; index >= 0; index -= 1) {
      if (overlappingNoteIds.has(props.track.notes[index].id)) {
        props.track.notes.splice(index, 1);
      }
    }
  }
  props.track.notes.push(candidate);
}

// ─── Hover preview ────────────────────────────────────────────────────────────

const hoverPreviewCell = ref<{
  startBeat: number;
  pitchId: string;
} | null>(null);

const clearHoverPreview = () => {
  hoverPreviewCell.value = null;
};

const hoverPreviewNote = computed<PlacedNote | null>(() => {
  if (!props.isSelected || props.track.locked) return null;
  if (!hoverPreviewCell.value) return null;
  return {
    id: "hover-preview",
    startBeat: hoverPreviewCell.value.startBeat,
    durationBeats: props.selectedNoteDurationBeats,
    pitchId: hoverPreviewCell.value.pitchId,
  };
});

const hoverPreviewHasOverlap = computed(() => {
  if (!hoverPreviewNote.value) return false;
  return getOverlappingNoteIds(hoverPreviewNote.value).length > 0;
});

// ─── Interaction ──────────────────────────────────────────────────────────────

type ClickState =
  | { type: "none" }
  | { type: "on-note"; noteId: string; startX: number; startY: number }
  | { type: "on-empty"; startX: number; startY: number };

const clickState = ref<ClickState>({ type: "none" });

const handleMouseMove = (evt: MouseEvent) => {
  if (!props.isSelected || props.track.locked) {
    clearHoverPreview();
    return;
  }
  if (!gridRef.value) return;

  const beat = clientXToBeat(evt.clientX, gridRef.value);
  const pitchIdx = clientYToPitchIdx(evt.clientY, gridRef.value);
  const pitchId = props.pitches[pitchIdx]?.id;

  if (!pitchId) {
    clearHoverPreview();
    return;
  }

  hoverPreviewCell.value = { startBeat: beat, pitchId };
};

const handleMouseLeave = () => {
  clearHoverPreview();
};

const handleMouseDown = (evt: MouseEvent) => {
  if (!props.isSelected || props.track.locked) return;
  if (!gridRef.value) return;

  const target = evt.target as HTMLElement;
  const noteEl = target.closest<HTMLElement>("[data-note-id]");

  if (noteEl) {
    evt.preventDefault();
    evt.stopPropagation();
    clickState.value = {
      type: "on-note",
      noteId: noteEl.dataset.noteId!,
      startX: evt.clientX,
      startY: evt.clientY,
    };
  } else {
    evt.preventDefault();
    clickState.value = {
      type: "on-empty",
      startX: evt.clientX,
      startY: evt.clientY,
    };
  }
};

const handleMouseUp = (evt: MouseEvent) => {
  const state = clickState.value;
  clickState.value = { type: "none" };

  if (state.type === "none") return;
  if (!props.isSelected || props.track.locked || !gridRef.value) return;

  const dx = Math.abs(evt.clientX - state.startX);
  const dy = Math.abs(evt.clientY - state.startY);
  if (dx >= 8 || dy >= 8) return;

  if (state.type === "on-note") {
    const idx = props.track.notes.findIndex((n) => n.id === state.noteId);
    if (idx !== -1) props.track.notes.splice(idx, 1);
  } else {
    const beat = clientXToBeat(evt.clientX, gridRef.value);
    const pitchIdx = clientYToPitchIdx(evt.clientY, gridRef.value);
    const pitchId = props.pitches[pitchIdx].id;
    replaceOverlappingNotes({
      id: nanoid(),
      startBeat: beat,
      durationBeats: props.selectedNoteDurationBeats,
      pitchId,
    });
  }
};

watch(
  () => props.isSelected,
  (isSelected) => {
    if (!isSelected) clearHoverPreview();
  },
);

onMounted(() => {
  document.addEventListener("mouseup", handleMouseUp);
});
onUnmounted(() => {
  document.removeEventListener("mouseup", handleMouseUp);
});
</script>

<template>
  <div
    ref="gridRef"
    class="absolute inset-0 overflow-hidden cursor-crosshair"
    v-on:mousedown="handleMouseDown"
    v-on:mousemove="handleMouseMove"
    v-on:mouseleave="handleMouseLeave"
  >
    <!--
      Inner canvas: shifted by -timelineOffsetPx so note absolute positions
      (beat × pxPerBeat) align with what the user sees on screen.
      Height = parent's EXPANDED_HEIGHT so the grid exactly fills the track.
    -->
    <div
      class="absolute top-0 left-0 will-change-transform"
      :style="{
        transform: `translateX(${-timelineOffsetPx}px)`,
        width: `${gridWidth}px`,
        height: `${height}px`,
        background: gridBackground,
      }"
    >
      <!-- Alternate row tints (black key rows) -->
      <div
        v-for="(pitch, idx) in pitches"
        :key="pitch.id"
        class="absolute left-0 right-0"
        :style="{
          top: `${idx * NOTE_HEIGHT_PX}px`,
          height: `${NOTE_HEIGHT_PX}px`,
        }"
        :class="{
          'bg-base-300/30': pitch.id.includes('#'),
          'bg-transparent': !pitch.id.includes('#'),
        }"
      />

      <!-- Placed notes -->
      <div
        v-for="note in visibleNotes"
        :key="note.id"
        :data-note-id="note.id"
        class="absolute rounded-sm cursor-pointer transition-none"
        :style="{
          left: `${noteLeft(note)}px`,
          width: `${Math.max(2, noteWidth(note))}px`,
          top: `${noteTop(note)}px`,
          height: `${Math.max(1, NOTE_HEIGHT_PX - 1)}px`,
          backgroundColor: track.muted
            ? 'rgba(255,255,255,0.15)'
            : 'var(--color-primary)',
        }"
      />

      <!-- Hover preview note -->
      <div
        v-if="hoverPreviewNote"
        class="pointer-events-none absolute z-10 rounded-sm border border-dashed"
        :style="{
          left: `${noteLeft(hoverPreviewNote)}px`,
          width: `${Math.max(2, noteWidth(hoverPreviewNote))}px`,
          top: `${noteTop(hoverPreviewNote)}px`,
          height: `${Math.max(1, NOTE_HEIGHT_PX - 1)}px`,
          backgroundColor: track.muted
            ? hoverPreviewHasOverlap
              ? 'rgba(255, 200, 120, 0.16)'
              : 'rgba(255,255,255,0.12)'
            : hoverPreviewHasOverlap
              ? 'color-mix(in oklab, var(--color-warning) 78%, transparent)'
              : 'color-mix(in oklab, var(--color-primary) 68%, transparent)',
          borderColor: track.muted
            ? hoverPreviewHasOverlap
              ? 'rgba(255, 200, 120, 0.9)'
              : 'rgba(255,255,255,0.9)'
            : hoverPreviewHasOverlap
              ? 'var(--color-warning)'
              : 'rgba(255,255,255,0.95)',
          boxShadow: hoverPreviewHasOverlap
            ? '0 0 0 1px rgba(255,255,255,0.35) inset'
            : '0 0 0 1px rgba(255,255,255,0.25) inset',
          opacity: hoverPreviewHasOverlap ? 0.6 : 0.45,
        }"
      />
    </div>
  </div>
</template>
