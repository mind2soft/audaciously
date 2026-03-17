<script setup lang="ts">
/**
 * RecordedNodeView — visualizer + controls for a RecordedNode.
 *
 * Layout when buffer exists (top-to-bottom):
 *   Row 1  Header: [TimelineRuler flex-1]
 *   Row 2  Waveform (flex-1)
 *   Row 3  Player controls … [divider] [ZoomToolbar]
 *
 * Layout when no buffer (idle / recording):
 *   Row 1  AudioAnalyzerView (flex-1)
 *   Row 2  Record controls
 *
 * Props
 * ─────
 * node   The RecordedNode to display / record into.
 */

import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useNodePlayback } from "../../../composables/useNodePlayback";
import type { RecordedNode } from "../../../features/nodes";
import { recorder } from "../../../lib/audio/recorder-singleton";
import { ZOOM_PX_PER_MIN_MS } from "../../../lib/zoom-constants";
import { useNodesStore } from "../../../stores/nodes";
import { usePlayerStore } from "../../../stores/player";
import AudioAnalyzerView from "../../controls/AudioAnalyzerView.vue";
import ScrollableTimeline from "../../controls/ScrollableTimeline.vue";
import WaveformView from "../../controls/WaveformView.vue";
import ZoomToolbar from "../../controls/ZoomToolbar.vue";

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{ node: RecordedNode }>();

// ── Stores ────────────────────────────────────────────────────────────────────

const nodes = useNodesStore();
const player = usePlayerStore();

// ── Zoom + scroll ─────────────────────────────────────────────────────────────

// scaleFactor = 1 means full buffer visible.
const scaleFactor = ref(1);
const totalDurationSeconds = computed(() => props.node.sourceBuffer?.duration ?? 0);

// Container width (measured via ResizeObserver) drives maxRatio for ZoomToolbar.
const viewRef = ref<HTMLElement | null>(null);
const waveformContainerWidth = ref(0);

// maxRatio: at this ratio, 1ms of audio occupies ZOOM_PX_PER_MIN_MS pixels.
const maxRatio = computed(() => {
  const total = totalDurationSeconds.value;
  const w = waveformContainerWidth.value;
  if (!total || !w) return 1;
  return Math.max(1, (total * ZOOM_PX_PER_MIN_MS * 1000) / w);
});

let _viewObserver: ResizeObserver | null = null;

const zoomSelectActive = ref(false);

function zoomOut(): void {
  scaleFactor.value = Math.max(1, scaleFactor.value / 2);
}

function zoomIn(): void {
  scaleFactor.value = Math.min(maxRatio.value, scaleFactor.value * 2);
}

function onZoomSelect(startTime: number, endTime: number): void {
  const total = totalDurationSeconds.value;
  const duration = endTime - startTime;
  if (duration <= 0 || !total) return;
  const newSF = Math.min(Math.max(total / duration, 1), maxRatio.value);
  // Set currentTime to midpoint FIRST, then scaleFactor so watcher reads updated time.
  previewSeek((startTime + endTime) / 2);
  scaleFactor.value = newSF;
  zoomSelectActive.value = false;
}

// ── Node playback ─────────────────────────────────────────────────────────────

const nodeRef = computed(() => props.node);
// targetBuffer recompute is handled app-wide by useAllNodes() in App.vue.
const {
  state: previewState,
  currentTime: previewTime,
  play: previewPlay,
  pause: previewPause,
  stop: previewStop,
  seek: previewSeek,
} = useNodePlayback(nodeRef);

// ── Recording state ───────────────────────────────────────────────────────────

const isRecording = ref(false);
const recordingDuration = ref(0);
const includeTimeline = ref(false);

const recordingDurationLabel = computed(() => {
  const t = recordingDuration.value;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
});

let recorderDurationTimer: ReturnType<typeof setInterval> | null = null;

const analyserBuffer = ref<AudioBuffer | null>(null);

// Cleanup function set in onMounted and called in onUnmounted.
let _removeRecorderListeners: (() => void) | undefined;

onMounted(() => {
  // ResizeObserver to track the waveform container width for maxRatio.
  if (viewRef.value) {
    _viewObserver = new ResizeObserver(([entry]) => {
      waveformContainerWidth.value = entry?.contentRect.width ?? 0;
    });
    _viewObserver.observe(viewRef.value);
  }

  if (!recorder) return;

  const onRecord = () => {
    isRecording.value = true;
    recordingDuration.value = 0;
    recorderDurationTimer = setInterval(() => {
      recordingDuration.value += 0.1;
    }, 100);
  };

  const onStop = async () => {
    isRecording.value = false;
    analyserBuffer.value = null;
    if (recorderDurationTimer) {
      clearInterval(recorderDurationTimer);
      recorderDurationTimer = null;
    }
    const nodeId = props.node.id;
    try {
      const buf = await recorder?.getAudioBuffer();
      nodes.setRecordedSourceBuffer(nodeId, buf);
      nodes.setRecordingState(nodeId, false);
    } catch {
      // ignore decode errors
    }
  };

  const onTimeUpdate = (event: { analyserBuffer: AudioBuffer }) => {
    analyserBuffer.value = event.analyserBuffer;
  };

  recorder.addEventListener("record", onRecord);
  recorder.addEventListener("stop", onStop);
  recorder.addEventListener("timeupdate", onTimeUpdate);

  _removeRecorderListeners = () => {
    recorder?.removeEventListener("record", onRecord);
    recorder?.removeEventListener("stop", onStop);
    recorder?.removeEventListener("timeupdate", onTimeUpdate);
  };
});

// Stop recording and clear live state when the node changes
watch(
  () => props.node,
  (next, prev) => {
    if (next?.id !== prev?.id) {
      analyserBuffer.value = null;
      if (isRecording.value) {
        recorder?.stop();
      }
    }
  },
);

// ── Record controls ───────────────────────────────────────────────────────────

async function startRecording(): Promise<void> {
  if (!recorder) return;
  const nodeId = props.node.id;
  nodes.setRecordingState(nodeId, true);

  if (includeTimeline.value && player.state !== "playing") {
    void player.play();
  }

  try {
    await recorder.record(250);
  } catch {
    nodes.setRecordingState(nodeId, false);
  }
}

function stopRecording(): void {
  recorder?.stop();
}

// ── Reset recorded buffer ─────────────────────────────────────────────────────

const confirmReset = ref(false);
const resetCancelBtnRef = ref<HTMLButtonElement | null>(null);

function requestReset(): void {
  confirmReset.value = true;
}

function cancelReset(): void {
  confirmReset.value = false;
}

function doReset(): void {
  confirmReset.value = false;
  nodes.setRecordedSourceBuffer(props.node.id, null);
}

watch(confirmReset, async (val) => {
  if (val) {
    await nextTick();
    resetCancelBtnRef.value?.focus();
  }
});

// ── Playback label ────────────────────────────────────────────────────────────

const playbackLabel = computed(() => {
  const dur = props.node.sourceBuffer?.duration ?? 0;
  const cur = previewTime.value;
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, "0")}`;
  };
  return `${fmt(cur)} / ${fmt(dur)}`;
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

onUnmounted(() => {
  previewStop();
  if (recorderDurationTimer) clearInterval(recorderDurationTimer);
  _removeRecorderListeners?.();
  _viewObserver?.disconnect();
  _viewObserver = null;
});
</script>

<template>
  <div
    ref="viewRef"
    class="flex flex-col h-full w-full overflow-hidden bg-base-100"
  >
    <!-- ── Has buffer: 3-row layout ──────────────────────────────────────── -->
    <template v-if="node.sourceBuffer">
      <!-- Row 1+2: ScrollableTimeline wraps ruler + waveform -->
      <ScrollableTimeline
        class="flex-1 min-h-0"
        :total-duration="totalDurationSeconds"
        :min-scale-factor="1"
        :max-pixels-per-second="ZOOM_PX_PER_MIN_MS * 1000"
        :current-time="previewTime"
        :scale-factor="scaleFactor"
        :playing="previewState === 'playing'"
        @update:current-time="previewSeek"
        @update:scale-factor="scaleFactor = $event"
      >
        <WaveformView
          :buffer="node.sourceBuffer"
          :currentTime="previewTime"
          :zoom-select-active="zoomSelectActive"
          class="w-full h-full"
          @seek="previewSeek"
          @zoom-select="onZoomSelect"
        />
      </ScrollableTimeline>

      <!-- Row 3: Player controls -->
      <div
        class="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-base-200 border-t border-base-300/60 min-h-10"
      >
        <button
          class="btn btn-sm btn-ghost btn-square"
          :title="
            !node.targetBuffer
              ? 'Preparing audio…'
              : previewState === 'playing'
                ? 'Pause'
                : 'Play'
          "
          :disabled="!node.targetBuffer"
          @click="previewState === 'playing' ? previewPause() : previewPlay()"
        >
          <i
            class="iconify size-4"
            :class="
              !node.targetBuffer
                ? 'mdi--loading animate-spin'
                : previewState === 'playing'
                  ? 'mdi--pause'
                  : 'mdi--play'
            "
            aria-hidden="true"
          />
        </button>
        <span class="text-xs text-base-content/50 tabular-nums">{{
          playbackLabel
        }}</span>

        <div class="flex-1" />

        <button
          class="btn btn-xs btn-ghost"
          title="Insert silence — coming soon"
          disabled
        >
          <i class="iconify mdi--format-pilcrow size-3.5" aria-hidden="true" />
        </button>
        <button class="btn btn-xs btn-ghost" title="Cut — coming soon" disabled>
          <i class="iconify mdi--content-cut size-3.5" aria-hidden="true" />
        </button>
        <button
          class="btn btn-xs btn-ghost"
          title="Copy — coming soon"
          disabled
        >
          <i class="iconify mdi--content-copy size-3.5" aria-hidden="true" />
        </button>
        <button
          class="btn btn-xs btn-ghost"
          title="Paste — coming soon"
          disabled
        >
          <i class="iconify mdi--content-paste size-3.5" aria-hidden="true" />
        </button>

        <div class="w-px h-5 bg-base-300/60 mx-1" aria-hidden="true" />

        <button
          class="btn btn-xs btn-ghost text-error"
          title="Delete recorded audio"
          @click="requestReset"
        >
          <i
            class="iconify mdi--trash-can-outline size-3.5"
            aria-hidden="true"
          />
          Reset
        </button>

        <div class="w-px h-5 bg-base-300/60 mx-1" aria-hidden="true" />

        <ZoomToolbar
          :zoom-ratio="scaleFactor"
          :min-ratio="1"
          :max-ratio="maxRatio"
          :zoom-select-active="zoomSelectActive"
          :disabled="previewState === 'playing'"
          @zoom-out="zoomOut"
          @zoom-in="zoomIn"
          @update:zoom-select-active="zoomSelectActive = $event"
        />
      </div>
    </template>

    <!-- ── No buffer: 2-row layout (idle / recording) ────────────────────── -->
    <template v-else>
      <!-- Row 1: Audio analyzer (flex-1) -->
      <div class="flex-1 min-h-0 overflow-hidden">
        <AudioAnalyzerView
          :analyser-buffer="analyserBuffer"
          class="w-full h-full"
        />
      </div>

      <!-- Row 2: Record controls -->
      <div
        class="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-base-200 border-t border-base-300/60 min-h-10"
      >
        <!-- Not recording -->
        <template v-if="!isRecording">
          <button
            class="btn btn-sm btn-error gap-1"
            title="Start recording"
            @click="startRecording"
          >
            <i class="iconify mdi--record size-4" aria-hidden="true" />
            Record
          </button>
          <span class="text-xs text-base-content/50">0:00</span>
          <label
            class="flex items-center gap-1.5 text-xs text-base-content/60 ml-2 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              class="checkbox checkbox-xs"
              v-model="includeTimeline"
              :disabled="player.totalDuration === 0"
            />
            Include timeline playback
          </label>
        </template>

        <!-- Recording in progress -->
        <template v-else>
          <button
            class="btn btn-sm btn-warning gap-1"
            title="Stop recording"
            @click="stopRecording"
          >
            <i class="iconify mdi--stop size-4" aria-hidden="true" />
            Stop
          </button>
          <span class="text-xs text-base-content/50 tabular-nums">{{
            recordingDurationLabel
          }}</span>
        </template>
      </div>
    </template>

    <!-- ── Reset confirmation dialog (always present) ─────────────────────── -->
    <dialog class="modal" :class="{ 'modal-open': confirmReset }">
      <div class="modal-box bg-base-300 max-w-sm">
        <h3 class="mb-2 text-lg font-bold">Delete Recording?</h3>
        <p class="py-3 text-sm text-base-content/70">
          This will permanently delete the recorded audio from this node. This
          action cannot be undone.
        </p>
        <div class="modal-action">
          <button
            class="btn btn-ghost"
            ref="resetCancelBtnRef"
            @click="cancelReset"
          >
            Cancel
          </button>
          <button class="btn btn-error" @click="doReset">Delete</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop" @click="cancelReset">
        <button>close</button>
      </form>
    </dialog>
  </div>
</template>
