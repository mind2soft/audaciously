<script setup lang="ts">
import { computed, inject, ref, onMounted, onUnmounted } from "vue";
import type {
  InstrumentAudioTrack,
  PlacedNote,
} from "../lib/audio/track/instrument";
import {
  getNoteDurationBeats,
  getSecondsPerBeat,
} from "../lib/audio/track/instrument/utils";
import {
  MUSIC_INSTRUMENTS,
  filterPitchesByOctaveRange,
  type OctaveRange,
} from "../lib/music/instruments";
import { timelineKey, playerKey } from "../lib/provider-keys";
import type { Timeline } from "../lib/timeline";
import {
  formatTimeToPixel,
  baseSecondWidthInPixels,
} from "../lib/util/formatTime";
import type { BufferedAudioSequence } from "../lib/audio/sequence";
import type { AudioPlayer } from "../lib/audio/player";
import TrackWaveformView from "./TrackWaveformView.vue";
import InstrumentRollView from "./InstrumentRollView.vue";

const props = defineProps<{
  track: InstrumentAudioTrack;
  isSelected: boolean;
}>();

const player = inject<AudioPlayer>(playerKey);
const timeline = inject<Timeline>(timelineKey)!;

if (!player) {
  throw new Error("missing player");
} else if (!timeline) {
  throw new Error("missing timeline");
}

const instrument = computed(() => MUSIC_INSTRUMENTS[props.track.instrumentId]);
const octaveRange = ref<OctaveRange>({ ...props.track.octaveRange });
const pitches = computed(() =>
  instrument.value.id === "piano"
    ? filterPitchesByOctaveRange(instrument.value.pitches, octaveRange.value)
    : instrument.value.pitches,
);

/**
 * Sequences from the track, kept reactive via the track's "change" event.
 */
const audioSequences = ref<BufferedAudioSequence<any>[]>([]);

/**
 * Mirror of track.showWaveform — kept in sync via the track's "change" event
 * so that Vue re-renders the template when the value changes.
 */
const showWaveform = ref(props.track.showWaveform);

/** Cursor position in px — tracks playback for the waveform view. */
const cursorPosition = ref<number>(
  formatTimeToPixel(timeline.ratio, player.currentTime),
);

const handleUpdateCursor = () => {
  cursorPosition.value = formatTimeToPixel(timeline.ratio, player.currentTime);
};

const syncAudioSequences = () => {
  audioSequences.value = Array.from(
    props.track.getSequences(),
  ) as BufferedAudioSequence<any>[];
  showWaveform.value = props.track.showWaveform;
  octaveRange.value = { ...props.track.octaveRange };
};

/**
 * Mirror both timeline.ratio AND timeline.offsetTime into refs so that all
 * computed properties re-evaluate whenever the timeline zooms or scrolls.
 */
const timelineRatio = ref(timeline.ratio);
const timelineOffsetPx = ref(
  formatTimeToPixel(timeline.ratio, timeline.offsetTime),
);

const handleTimelineChange = () => {
  timelineRatio.value = timeline.ratio;
  timelineOffsetPx.value = formatTimeToPixel(
    timeline.ratio,
    timeline.offsetTime,
  );
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
const PIANO_EXPANDED_HEIGHT = computed(
  () => pitches.value.length * NOTE_HEIGHT_PX,
);

/**
 * Effective expanded height: waveform mode uses a fixed 192 px (same as a
 * recorded AudioTrack), piano roll uses the pitch-count-based height.
 */
const EXPANDED_HEIGHT = computed(() =>
  showWaveform.value ? WAVEFORM_EXPANDED_HEIGHT : PIANO_EXPANDED_HEIGHT.value,
);

/** Row height in collapsed mode — fits all pitches into COLLAPSED_HEIGHT. */
const collapsedRowHeight = computed(
  () => COLLAPSED_HEIGHT / pitches.value.length,
);

/**
 * Notes whose pitchId falls within the visible octave range.
 * Notes outside the range still play (audio is unaffected) but are not rendered.
 */
const visibleNotes = computed(() => {
  const ids = new Set(pitches.value.map((p) => p.id));
  return props.track.notes.filter((n) => ids.has(n.pitchId));
});

// ─── Grid geometry helpers ────────────────────────────────────────────────────

/** Pixels per beat at current (reactive) ratio. */
const pxPerBeat = computed(
  () =>
    getSecondsPerBeat(props.track.bpm) *
    timelineRatio.value *
    baseSecondWidthInPixels,
);

const selectedNoteDurationBeats = computed(() =>
  getNoteDurationBeats(
    props.track.selectedNoteType,
    props.track.timeSignature.beatUnit,
  ),
);

/** Pixels per measure. */
const pxPerMeasure = computed(
  () => pxPerBeat.value * props.track.timeSignature.beatsPerMeasure,
);

/**
 * Grid canvas width: always extends well past the current scroll offset so
 * the visible area is never empty on the right side.
 */
const gridWidth = computed(() => Math.max(8000, timelineOffsetPx.value + 8000));

/** px-per-second for the waveform view (matches AudioTrack.vue / AudioSequence.vue). */
const baseWidth = computed(() => formatTimeToPixel(timelineRatio.value, 1));

// ─── Note rendering (collapsed view only) ────────────────────────────────────

/** Top position for a note in the collapsed (32 px) view. */
function noteTopCollapsed(note: PlacedNote): number {
  const pitchIdx = pitches.value.findIndex((p) => p.id === note.pitchId);
  return pitchIdx >= 0 ? pitchIdx * collapsedRowHeight.value : 0;
}

/** Prevent the browser context menu from appearing over the track area. */
const handleContextMenu = (evt: MouseEvent) => evt.preventDefault();

onMounted(() => {
  // Sync sequences directly from the track and subscribe for future changes.
  syncAudioSequences();

  props.track.addEventListener("change", syncAudioSequences);

  player.addEventListener("timeupdate", handleUpdateCursor);
  player.addEventListener("change", handleUpdateCursor);
  player.addEventListener("seek", handleUpdateCursor);
  player.addEventListener("stop", handleUpdateCursor);

  timeline.addEventListener("change", handleTimelineChange);
});
onUnmounted(() => {
  props.track.removeEventListener("change", syncAudioSequences);

  player.removeEventListener("timeupdate", handleUpdateCursor);
  player.removeEventListener("change", handleUpdateCursor);
  player.removeEventListener("seek", handleUpdateCursor);
  player.removeEventListener("stop", handleUpdateCursor);

  timeline.removeEventListener("change", handleTimelineChange);
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
    <template v-if="showWaveform">
      <TrackWaveformView
        :sequences="audioSequences"
        :base-width="baseWidth"
        :cursor-position="cursorPosition"
        :muted="track.muted"
        :timeline-offset-px="timelineOffsetPx"
      />
    </template>

    <template v-else>
      <!-- ── COLLAPSED VIEW ── -->
      <template v-if="isSelected">
        <InstrumentRollView
          :track="track"
          :pitches="pitches"
          :visible-notes="visibleNotes"
          :is-selected="isSelected"
          :timeline-offset-px="timelineOffsetPx"
          :px-per-beat="pxPerBeat"
          :px-per-measure="pxPerMeasure"
          :grid-width="gridWidth"
          :height="EXPANDED_HEIGHT"
          :selected-note-duration-beats="selectedNoteDurationBeats"
        />
      </template>

      <!-- ── EXPANDED: PIANO ROLL VIEW ── -->
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
              v-for="note in visibleNotes"
              :key="note.id"
              class="absolute"
              :style="{
                left: `${note.startBeat * pxPerBeat}px`,
                width: `${Math.max(2, note.durationBeats * pxPerBeat)}px`,
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
  </div>
</template>
