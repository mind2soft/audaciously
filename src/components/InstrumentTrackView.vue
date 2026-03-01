<script setup lang="ts">
import { computed, inject, ref, watch, onMounted, onUnmounted } from "vue";
import { nanoid } from "nanoid";
import type { InstrumentTrack, PlacedNote } from "../lib/music/instrument-track";
import {
  beatToPixel,
  pixelToBeatSnapped,
  getNoteDurationBeats,
  getSecondsPerBeat,
} from "../lib/music/instrument-track";
import { MUSIC_INSTRUMENTS, NOTE_BEATS } from "../lib/music/instruments";
import { timelineKey, instrumentAudioTracksKey, playerKey } from "../lib/provider-keys";
import type { Timeline } from "../lib/timeline";
import { formatTimeToPixel, baseSecondWidthInPixels } from "../lib/util/formatTime";
import type { AudioTrack } from "../lib/audio/track";
import type { AudioSequence } from "../lib/audio/sequence";
import type { AudioPlayer } from "../lib/audio/player";
import AudioSequenceVue from "./AudioSequence.vue";
import type { Ref } from "vue";

const props = defineProps<{
  track: InstrumentTrack;
  isSelected: boolean;
}>();

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const timeline = inject<Timeline>(timelineKey)!;
if (!timeline) throw new Error("missing timeline");

const instrumentAudioTracks = inject<Ref<Map<string, AudioTrack>>>(instrumentAudioTracksKey);
const player = inject<AudioPlayer>(playerKey);

const instrument = computed(() => MUSIC_INSTRUMENTS[props.track.instrumentId]);
const pitches = computed(() => instrument.value.pitches);

/**
 * The hidden AudioTrack in the player that corresponds to this instrument track.
 * Only populated after at least one render completes.
 */
const hiddenAudioTrack = computed<AudioTrack | undefined>(
  () => instrumentAudioTracks?.value.get(props.track.id)
);

/**
 * Sequences of the hidden AudioTrack, kept reactive via a ref updated on
 * the track's "change" event.
 */
const audioSequences = ref<AudioSequence<any>[]>([]);

/** Cursor position in px — tracks playback for the waveform view. */
const cursorPosition = ref<number>(
  player ? formatTimeToPixel(timeline.ratio, player.currentTime) : 0
);

const handleUpdateCursor = () => {
  if (player) cursorPosition.value = formatTimeToPixel(timeline.ratio, player.currentTime);
};

const syncAudioSequences = () => {
  const at = hiddenAudioTrack.value;
  audioSequences.value = at ? Array.from(at.getSequences()) : [];
};

// Re-sync whenever the hidden audio track reference changes (new Map instance
// from useInstrumentPlayback means a new AudioTrack object each render).
let unsubscribePrev: (() => void) | undefined;
const watchHiddenTrack = () => {
  if (unsubscribePrev) {
    unsubscribePrev();
    unsubscribePrev = undefined;
  }
  const at = hiddenAudioTrack.value;
  if (at) {
    at.addEventListener("change", syncAudioSequences);
    unsubscribePrev = () => at.removeEventListener("change", syncAudioSequences);
  }
  // Only clear sequences when the track is truly gone (undefined).  When the
  // AudioTrack is merely replaced (old → new in one Map update), `at` is
  // already the new instance here, so we sync immediately without blanking.
  syncAudioSequences();
};

// Watch the computed so we re-subscribe whenever the AudioTrack instance is replaced.
watch(hiddenAudioTrack, watchHiddenTrack, { immediate: true });

/**
 * Mirror both timeline.ratio AND timeline.offsetTime into refs so that all
 * computed properties re-evaluate whenever the timeline zooms or scrolls.
 */
const timelineRatio = ref(timeline.ratio);
const timelineOffsetPx = ref(formatTimeToPixel(timeline.ratio, timeline.offsetTime));

const handleTimelineChange = () => {
  timelineRatio.value = timeline.ratio;
  timelineOffsetPx.value = formatTimeToPixel(timeline.ratio, timeline.offsetTime);
  handleUpdateCursor();
};

// ─── Heights ──────────────────────────────────────────────────────────────────

/** Each pitch row is always exactly this many pixels tall when expanded. */
const NOTE_HEIGHT_PX = 16;
const COLLAPSED_HEIGHT = 32; // px

/**
 * Fixed expanded height when in waveform view — matches AudioTrack.vue.
 * Must stay in sync with InstrumentTrackHeader.vue.
 */
const WAVEFORM_EXPANDED_HEIGHT = 192; // px

/**
 * Total expanded height: one 16 px row per pitch (piano roll mode).
 * Must stay in sync with InstrumentTrackHeader.vue.
 */
const PIANO_EXPANDED_HEIGHT = computed(() => pitches.value.length * NOTE_HEIGHT_PX);

/**
 * Effective expanded height: waveform mode uses a fixed 192 px (same as a
 * recorded AudioTrack), piano roll uses the pitch-count-based height.
 */
const EXPANDED_HEIGHT = computed(() =>
  props.track.showWaveform ? WAVEFORM_EXPANDED_HEIGHT : PIANO_EXPANDED_HEIGHT.value
);

/** Row height in expanded mode — always 16 px (plain number, not a ref). */
const dynamicRowHeight = NOTE_HEIGHT_PX;

/** Row height in collapsed mode — fits all pitches into COLLAPSED_HEIGHT. */
const collapsedRowHeight = computed(
  () => COLLAPSED_HEIGHT / pitches.value.length
);

// ─── Grid geometry helpers ────────────────────────────────────────────────────

/** Pixels per beat at current (reactive) ratio. */
const pxPerBeat = computed(
  () => getSecondsPerBeat(props.track.bpm) * timelineRatio.value * baseSecondWidthInPixels
);

/** Pixels per measure. */
const pxPerMeasure = computed(
  () => pxPerBeat.value * props.track.timeSignature.beatsPerMeasure
);

/**
 * Grid canvas width: always extends well past the current scroll offset so
 * the visible area is never empty on the right side.
 */
const gridWidth = computed(() => Math.max(8000, timelineOffsetPx.value + 8000));

/** px-per-second for the waveform view (matches AudioTrack.vue / AudioSequence.vue). */
const baseWidth = computed(() => formatTimeToPixel(timelineRatio.value, 1));

/** Background gradient that draws beat and measure grid lines. */
const gridBackground = computed(() => {
  const mpx = pxPerMeasure.value;
  const bpx = pxPerBeat.value;
  const rh = dynamicRowHeight;

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

// ─── Note rendering ───────────────────────────────────────────────────────────

function noteLeft(note: PlacedNote): number {
  return beatToPixel(note.startBeat, props.track.bpm, timelineRatio.value);
}

function noteWidth(note: PlacedNote): number {
  return beatToPixel(note.durationBeats, props.track.bpm, timelineRatio.value);
}

function noteTop(note: PlacedNote): number {
  const pitchIdx = pitches.value.findIndex((p) => p.id === note.pitchId);
  return pitchIdx >= 0 ? pitchIdx * dynamicRowHeight : 0;
}

/** Top position for a note in the collapsed (32 px) view. */
function noteTopCollapsed(note: PlacedNote): number {
  const pitchIdx = pitches.value.findIndex((p) => p.id === note.pitchId);
  return pitchIdx >= 0 ? pitchIdx * collapsedRowHeight.value : 0;
}

// ─── Interaction ──────────────────────────────────────────────────────────────

/**
 * Tracks the mousedown origin so we can distinguish a short click (toggle)
 * from a drag (timeline pan).
 */
type ClickState =
  | { type: "none" }
  | { type: "on-note"; noteId: string; startX: number; startY: number }
  | { type: "on-empty"; startX: number; startY: number };

const clickState = ref<ClickState>({ type: "none" });

/**
 * Convert a clientX to a beat.
 *
 * The outer wrapper is counter-translated by +timelineOffsetPx to cancel the
 * parent's -tracksPosition shift, so the grid appears fixed in the viewport.
 * A note at beat B has absolute pixel left = beatToPixel(B), but the inner div
 * is shifted by -timelineOffsetPx, so its viewport x is:
 *   viewport_x = rect.left + (beatToPixel(B) − timelineOffsetPx)
 * Solving for beat:
 *   absolutePx = (clientX − rect.left) + timelineOffsetPx
 */
function clientXToBeat(clientX: number, containerEl: HTMLElement): number {
  const rect = containerEl.getBoundingClientRect();
  const absolutePx = clientX - rect.left + timelineOffsetPx.value;
  const snapBeats = NOTE_BEATS[props.track.selectedNoteType];
  return pixelToBeatSnapped(absolutePx, props.track.bpm, timeline.ratio, snapBeats);
}

/** Convert a clientY to a pitch index (clamped). No scroll offset needed. */
function clientYToPitchIdx(clientY: number, containerEl: HTMLElement): number {
  const rect = containerEl.getBoundingClientRect();
  const py = clientY - rect.top;
  return Math.max(
    0,
    Math.min(pitches.value.length - 1, Math.floor(py / dynamicRowHeight))
  );
}

const gridRef = ref<HTMLDivElement>();

const handleMouseDown = (evt: MouseEvent) => {
  if (!props.isSelected) return;
  if (props.track.locked) return;
  if (props.track.showWaveform) return; // waveform view is read-only
  if (evt.button !== 0) return;
  if (!gridRef.value) return;

  const target = evt.target as HTMLElement;
  const noteEl = target.closest<HTMLElement>("[data-note-id]");

  if (noteEl) {
    // Mousedown on an existing note: stop propagation so AudioTracks doesn't
    // start a timeline drag. We'll remove the note on mouseup if it's a click.
    evt.preventDefault();
    evt.stopPropagation();
    clickState.value = {
      type: "on-note",
      noteId: noteEl.dataset.noteId!,
      startX: evt.clientX,
      startY: evt.clientY,
    };
  } else {
    // Mousedown on empty space: allow propagation so timeline panning still
    // works. We'll place a note on mouseup if the mouse barely moved.
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
  if (props.track.showWaveform) return;

  // Only act when the mouse barely moved (true click, not a drag/pan).
  const dx = Math.abs(evt.clientX - state.startX);
  const dy = Math.abs(evt.clientY - state.startY);
  if (dx >= 8 || dy >= 8) return;

  if (state.type === "on-note") {
    // Toggle off: remove the note.
    const idx = props.track.notes.findIndex((n) => n.id === state.noteId);
    if (idx !== -1) props.track.notes.splice(idx, 1);
  } else {
    // Toggle on: place a new note at the clicked cell.
    const beat = clientXToBeat(evt.clientX, gridRef.value);
    const pitchIdx = clientYToPitchIdx(evt.clientY, gridRef.value);
    const pitchId = pitches.value[pitchIdx].id;
    const durationBeats = getNoteDurationBeats(
      props.track.selectedNoteType,
      props.track.timeSignature.beatUnit
    );
    props.track.notes.push({ id: nanoid(), startBeat: beat, durationBeats, pitchId });
  }
};

/** Prevent the browser context menu from appearing over the piano roll. */
const handleContextMenu = (evt: MouseEvent) => evt.preventDefault();

onMounted(() => {
  document.addEventListener("mouseup", handleMouseUp);
  timeline.addEventListener("change", handleTimelineChange);
  if (player) {
    player.addEventListener("timeupdate", handleUpdateCursor);
    player.addEventListener("change", handleUpdateCursor);
    player.addEventListener("seek", handleUpdateCursor);
    player.addEventListener("stop", handleUpdateCursor);
  }
});
onUnmounted(() => {
  document.removeEventListener("mouseup", handleMouseUp);
  timeline.removeEventListener("change", handleTimelineChange);
  if (unsubscribePrev) unsubscribePrev();
  if (player) {
    player.removeEventListener("timeupdate", handleUpdateCursor);
    player.removeEventListener("change", handleUpdateCursor);
    player.removeEventListener("seek", handleUpdateCursor);
    player.removeEventListener("stop", handleUpdateCursor);
  }
});
</script>

<template>
  <!--
    Outer wrapper:
    • Height transitions between collapsed (32 px) and expanded.
    • Counter-translated by +timelineOffsetPx to cancel the parent's
      -tracksPosition shift, keeping the grid stationary in the viewport.
  -->
  <div
    class="relative overflow-hidden border-b border-base-300/60 select-none transition-[height] duration-200 ease-in-out"
    :style="{
      height: `${isSelected ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT}px`,
      transform: `translateX(${timelineOffsetPx}px)`,
    }"
    v-on:contextmenu="handleContextMenu"
  >

    <!-- ── COLLAPSED VIEW ── -->
    <template v-if="!isSelected">

      <!-- Collapsed waveform: sequences scaled into 32px -->
      <template v-if="track.showWaveform">
        <div class="flex relative flex-nowrap h-full"
          :style="{ transform: `translateX(${-timelineOffsetPx}px)` }">
          <AudioSequenceVue
            v-for="seq in audioSequences"
            :key="seq.id"
            :base-width="baseWidth"
            :cursor-position="cursorPosition"
            :sequence="seq"
            :muted="track.muted"
          />
        </div>
      </template>

      <!-- Collapsed piano roll: notes as 1px horizontal lines -->
      <template v-else>
        <div class="absolute inset-0 overflow-hidden">
          <div
            class="absolute top-0 bottom-0 left-0 will-change-transform"
            :style="{
              transform: `translateX(${-timelineOffsetPx}px)`,
              width: `${gridWidth}px`,
            }"
          >
            <div
              v-for="note in track.notes"
              :key="note.id"
              class="absolute"
              :style="{
                left: `${noteLeft(note)}px`,
                width: `${Math.max(2, noteWidth(note))}px`,
                height: '1px',
                top: `${noteTopCollapsed(note)}px`,
                backgroundColor: track.muted
                  ? 'rgba(255,255,255,0.15)'
                  : 'var(--color-primary)',
                opacity: 0.8,
              }"
            />
          </div>
        </div>
      </template>

    </template>

    <!-- ── EXPANDED: WAVEFORM VIEW ── -->
    <template v-else-if="track.showWaveform">
      <div class="flex relative flex-nowrap h-full"
        :style="{ transform: `translateX(${-timelineOffsetPx}px)` }">
        <template v-if="hiddenAudioTrack && audioSequences.length">
          <AudioSequenceVue
            v-for="seq in audioSequences"
            :key="seq.id"
            :base-width="baseWidth"
            :cursor-position="cursorPosition"
            :sequence="seq"
            :muted="track.muted"
          />
        </template>
        <div v-else class="flex h-full items-center px-4">
          <span class="text-xs text-base-content/25 italic">No audio rendered yet</span>
        </div>
      </div>
    </template>

    <!-- ── EXPANDED: PIANO ROLL VIEW ── -->
    <template v-else>
      <div
        ref="gridRef"
        class="absolute inset-0 overflow-hidden cursor-crosshair"
        v-on:mousedown="handleMouseDown"
      >
        <!--
          Inner canvas: shifted by -timelineOffsetPx horizontally so note
          absolute positions match what the user sees.
          Height = EXPANDED_HEIGHT so the grid fills exactly the track height
          with no overflow and no scrolling.
        -->
        <div
          class="absolute top-0 left-0 will-change-transform"
          :style="{
            transform: `translateX(${-timelineOffsetPx}px)`,
            width: `${gridWidth}px`,
            height: `${EXPANDED_HEIGHT}px`,
            background: gridBackground,
          }"
        >
          <!-- Alternate row tints (black keys) -->
          <div
            v-for="(pitch, idx) in pitches"
            :key="pitch.id"
            class="absolute left-0 right-0"
            :style="{
              top: `${idx * dynamicRowHeight}px`,
              height: `${dynamicRowHeight}px`,
            }"
            :class="{
              'bg-base-300/30': pitch.id.includes('#'),
              'bg-transparent': !pitch.id.includes('#'),
            }"
          />

          <!-- Placed notes -->
          <div
            v-for="note in track.notes"
            :key="note.id"
            :data-note-id="note.id"
            class="absolute rounded-sm cursor-pointer transition-none"
            :style="{
              left: `${noteLeft(note)}px`,
              width: `${Math.max(2, noteWidth(note))}px`,
              top: `${noteTop(note)}px`,
              height: `${Math.max(1, dynamicRowHeight - 1)}px`,
              backgroundColor: track.muted
                ? 'rgba(255,255,255,0.15)'
                : 'var(--color-primary)',
            }"
          />
        </div>
      </div>
    </template>

  </div>
</template>
