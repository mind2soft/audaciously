<script setup lang="ts">
/**
 * RecordedNodeView — visualizer + controls for a RecordedNode.
 *
 * Layout when buffer exists (top-to-bottom):
 *   Row 1  Header: [TimelineRuler flex-1]
 *   Row 2  Waveform (flex-1)
 *   Row 3  Player controls … [tools] [divider] [ZoomToolbar]
 *
 * Layout when no buffer (idle / recording):
 *   Row 1  AudioAnalyzerView (flex-1)
 *   Row 2  Record controls
 *
 * Props
 * ─────
 * node   The RecordedNode to display / record into.
 */

import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  audioBufferFromClipboardEntry,
  useAudioClipboard,
} from "../../../composables/useAudioClipboard";
import { NodePlaybackContextKey, nullNodePlayback } from "../../../composables/usePlaybackContext";
import { useRecordedAudioNode } from "../../../composables/useRecordedAudioNode";
import { getPristineChannels } from "../../../lib/audio/audio-buffer-repository";
import { cutRegion, insertSegment, insertSilence } from "../../../lib/audio/buffer-utils";
import { recorder } from "../../../lib/audio/recorder-singleton";
import type { RecordedToolId } from "../../../lib/piano-roll/tool-types";
import { ZOOM_PX_PER_MIN_MS } from "../../../lib/zoom-constants";
import { useNodesStore } from "../../../stores/nodes";
import { usePlayerStore } from "../../../stores/player";
import AudioAnalyzerView from "../../controls/audio/AudioAnalyzerView.vue";
import WaveformView from "../../controls/audio/WaveformView.vue";
import ButtonGroup, { type ButtonGroupItem } from "../../controls/ButtonGroup.vue";
import ScrollableTimeline from "../../controls/timeline/ScrollableTimeline.vue";
import ZoomToolbar from "../../controls/timeline/ZoomToolbar.vue";

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{ nodeId: string }>();

// ── Stores ────────────────────────────────────────────────────────────────────

const recordedNode = useRecordedAudioNode(props.nodeId, { pipeline: true });
const player = usePlayerStore();
const nodesStore = useNodesStore();

// ── Pristine channels for corruption-immune waveform rendering ───────────────

const sourcePristineChannels = computed(() => {
  const node = nodesStore.nodesById.get(props.nodeId);
  if (!node || node.kind !== "recorded" || !node.sourceBufferId) return undefined;
  return getPristineChannels(node.sourceBufferId);
});

// ── Zoom + scroll ─────────────────────────────────────────────────────────────

// scaleFactor = 1 means full buffer visible.
const scaleFactor = ref(1);
const totalDurationSeconds = computed(() => recordedNode.sourceBuffer.value?.duration ?? 0);

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

// targetBuffer recompute is handled by useRecordedAudioNode(nodeId, { pipeline: true }).
// The single useNodePlayback instance is created in App.vue and provided via
// NodePlaybackContextKey so this view and EffectVolume share the same cursor.
const {
  state: previewState,
  currentTime: previewTime,
  play: previewPlay,
  pause: previewPause,
  stop: previewStop,
  seek: previewSeek,
} = inject(NodePlaybackContextKey, nullNodePlayback);

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
    try {
      const buf = await recorder?.getAudioBuffer();
      recordedNode.setSourceBuffer(buf);
      recordedNode.setRecordingState(false);
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
  () => props.nodeId,
  () => {
    analyserBuffer.value = null;
    if (isRecording.value) {
      recorder?.stop();
    }
  },
);

// ── Record controls ───────────────────────────────────────────────────────────

async function startRecording(): Promise<void> {
  if (!recorder) return;
  recordedNode.setRecordingState(true);

  if (includeTimeline.value && player.state !== "playing") {
    void player.play();
  }

  try {
    await recorder.record(250);
  } catch {
    recordedNode.setRecordingState(false);
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
  recordedNode.setSourceBuffer(null);
}

watch(confirmReset, async (val) => {
  if (val) {
    await nextTick();
    resetCancelBtnRef.value?.focus();
  }
});

// ── Playback label ────────────────────────────────────────────────────────────

const playbackLabel = computed(() => {
  const dur = recordedNode.sourceBuffer.value?.duration ?? 0;
  const cur = previewTime.value;
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, "0")}`;
  };
  return `${fmt(cur)} / ${fmt(dur)}`;
});

// ── Active tool ───────────────────────────────────────────────────────────────

const activeTool = ref<RecordedToolId | null>(null);

// ── Audio clipboard ───────────────────────────────────────────────────────────

const { hasAudioSegment, audioSegmentEntry, copyAudioSegment } = useAudioClipboard();

// ── Tool button items ─────────────────────────────────────────────────────────

const toolItems = computed<ButtonGroupItem[]>(() => [
  {
    id: "pan",
    label: "Pan",
    title: "Pan — drag to insert silence",
    icon: "mdi--hand-front-left-outline",
  },
  {
    id: "cut",
    label: "Cut",
    title: "Cut — select and remove a region",
    icon: "mdi--content-cut",
    activeClass: "btn-warning",
  },
  {
    id: "copy",
    label: "Copy",
    title: "Copy — select a region to clipboard",
    icon: "mdi--content-copy",
  },
  {
    id: "paste",
    label: "Paste",
    title: "Paste — click to place audio from clipboard",
    icon: "mdi--content-paste",
    disabled: !hasAudioSegment.value,
  },
]);

function onToolSelected(id: string): void {
  const newTool = id as RecordedToolId;
  // Toggle off if clicking the already-active tool
  if (activeTool.value === newTool) {
    activeTool.value = null;
    selectionRange.value = null;
    return;
  }
  activeTool.value = newTool;
  selectionRange.value = null;
}

// ── Selection range (shared by cut/copy) ──────────────────────────────────────

const selectionRange = ref<{ start: number; end: number } | null>(null);

/** WaveformView should enter selection-drag mode when cut or copy is active. */
const isSelectionMode = computed(() => activeTool.value === "cut" || activeTool.value === "copy");

const selectionColor = computed(() => {
  if (activeTool.value === "cut") return "var(--color-warning)";
  if (activeTool.value === "copy") return "var(--color-info)";
  return undefined;
});

function onWaveformSelection(start: number, end: number): void {
  if (!isSelectionMode.value) return;
  selectionRange.value = { start, end };

  // Immediately execute the action after selection completes
  if (activeTool.value === "copy") {
    doCopy(start, end);
  } else if (activeTool.value === "cut") {
    doCut(start, end);
  }
}

// ── Pan tool (insert silence — drag-based) ────────────────────────────────────

/**
 * Pan behaviour: matches instrument-node UX.  When the Pan tool is active,
 * mousedown on the waveform captures the insertion point, dragging right
 * defines the silence duration with a live visual preview, and mouseup
 * commits the silence insertion to the source buffer.
 */

const isPanMode = computed(() => activeTool.value === "pan");

function onPanCommit(atTime: number, duration: number): void {
  const buf = recordedNode.sourceBuffer.value;
  if (!buf) return;
  const newBuffer = insertSilence(buf, atTime, duration);
  recordedNode.setSourceBuffer(newBuffer);
  showToast(`${duration.toFixed(1)}s silence inserted`);
}

// ── Cut tool ──────────────────────────────────────────────────────────────────

function doCut(startSec: number, endSec: number): void {
  const buf = recordedNode.sourceBuffer.value;
  if (!buf) return;

  // First copy to clipboard, then cut
  const duration = copyAudioSegment(buf, startSec, endSec);

  const newBuffer = cutRegion(buf, startSec, endSec);
  recordedNode.setSourceBuffer(newBuffer);

  // Seek to cut point
  previewSeek(Math.min(startSec, newBuffer?.duration ?? 0));

  selectionRange.value = null;
  activeTool.value = null;

  showToast(`${duration.toFixed(1)}s cut to clipboard`);
}

// ── Copy tool ─────────────────────────────────────────────────────────────────

function doCopy(startSec: number, endSec: number): void {
  const buf = recordedNode.sourceBuffer.value;
  if (!buf) return;

  const duration = copyAudioSegment(buf, startSec, endSec);

  selectionRange.value = null;
  activeTool.value = null;

  showToast(`${duration.toFixed(1)}s copied to clipboard`);
}

// ── Paste tool (hover+click mode) ─────────────────────────────────────────────

/**
 * Paste behaviour: matches instrument-node UX.  When the Paste tool is active,
 * hovering the waveform shows a preview band of the clipboard duration,
 * and clicking inserts the audio at that position.  The tool stays active
 * after paste — it's repeatable.
 */

const isPasteMode = computed(() => activeTool.value === "paste");

const pastePreviewDuration = computed(() => {
  const entry = audioSegmentEntry.value;
  return entry ? entry.durationSeconds : 0;
});

function onPasteAt(time: number): void {
  const buf = recordedNode.sourceBuffer.value;
  const entry = audioSegmentEntry.value;
  if (!buf || !entry) return;

  const segment = audioBufferFromClipboardEntry(entry);
  const newBuffer = insertSegment(buf, segment, time);
  recordedNode.setSourceBuffer(newBuffer);

  showToast(`${entry.durationSeconds.toFixed(1)}s pasted`);
}

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

// ── Cleanup ───────────────────────────────────────────────────────────────────

onUnmounted(() => {
  previewStop();
  if (recorderDurationTimer) clearInterval(recorderDurationTimer);
  _removeRecorderListeners?.();
  _viewObserver?.disconnect();
  _viewObserver = null;
  if (_toastTimer !== null) clearTimeout(_toastTimer);
});
</script>

<template>
  <div
    ref="viewRef"
    class="flex flex-col h-full w-full overflow-hidden bg-base-100"
  >
    <!-- ── Has buffer: 3-row layout ──────────────────────────────────────── -->
    <template v-if="recordedNode.sourceBuffer.value">
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
          :buffer="recordedNode.sourceBuffer.value"
          :currentTime="previewTime"
          :zoom-select-active="zoomSelectActive && activeTool == null"
          :selection-active="isSelectionMode"
          :selection-range="selectionRange"
          :selection-color="selectionColor"
          :pan-drag-active="isPanMode"
          :paste-preview-active="isPasteMode"
          :paste-preview-duration="pastePreviewDuration"
          :pristine-channels="sourcePristineChannels"
          class="w-full h-full"
          @seek="previewSeek"
          @zoom-select="onZoomSelect"
          @selection="onWaveformSelection"
          @pan-commit="onPanCommit"
          @paste-at="onPasteAt"
        />
      </ScrollableTimeline>

      <!-- Row 3: Player controls -->
      <div
        class="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-base-200 border-t border-base-300/60 min-h-10"
      >
        <button
          class="btn btn-sm btn-ghost btn-square"
          :title="
            !recordedNode.targetBuffer.value
              ? 'Preparing audio…'
              : previewState === 'playing'
                ? 'Pause'
                : 'Play'
          "
          :disabled="!recordedNode.targetBuffer.value"
          @click="previewState === 'playing' ? previewPause() : previewPlay()"
        >
          <i
            class="iconify size-4"
            :class="
              !recordedNode.targetBuffer.value
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

        <!-- Tool selector -->
        <ButtonGroup
          :items="toolItems"
          :model-value="activeTool ?? ''"
          @update:model-value="onToolSelected"
        />

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
