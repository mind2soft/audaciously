<script setup lang="ts">
/**
 * RecordedNodeView — visualizer + controls for a RecordedNode.
 *
 * Layout (top-to-bottom):
 *   Row 1  Header: [80px label | TimelineRuler flex-1 | ZoomControl w-40]
 *   Row 2  Waveform / recording visualizer (flex-1)
 *   Row 3  Player controls
 *
 * Props
 * ─────
 * node   The RecordedNode to display / record into.
 */

import { ref, computed, onUnmounted, watch, nextTick } from "vue";
import { recorder } from "../../../lib/audio/recorder-singleton";
import { useNodesStore } from "../../../stores/nodes";
import { usePlayerStore } from "../../../stores/player";
import { useNodePlayback } from "../../../composables/useNodePlayback";
import type { RecordedNode } from "../../../features/nodes";
import WaveformView from "../../controls/WaveformView.vue";
import TimelineRuler from "../../controls/TimelineRuler.vue";
import ZoomControl from "../../controls/ZoomControl.vue";

// ── Props ─────────────────────────────────────────────────────────────────────

const props = defineProps<{ node: RecordedNode }>();

// ── Stores ────────────────────────────────────────────────────────────────────

const nodes = useNodesStore();
const player = usePlayerStore();

// ── Zoom (ruler only — waveform always shows full buffer) ─────────────────────

const zoomRatio = ref(4);
const totalDurationSeconds = computed(() => props.node.buffer?.duration ?? 0);

// ── Node playback ─────────────────────────────────────────────────────────────

const nodeRef = computed(() => props.node);
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

if (recorder) {
  recorder.addEventListener("record", () => {
    isRecording.value = true;
    recordingDuration.value = 0;
    recorderDurationTimer = setInterval(() => {
      recordingDuration.value += 0.1;
    }, 100);
  });

  recorder.addEventListener("stop", async () => {
    isRecording.value = false;
    if (recorderDurationTimer) {
      clearInterval(recorderDurationTimer);
      recorderDurationTimer = null;
    }
    const nodeId = props.node.id;
    try {
      const buf = await recorder.getAudioBuffer();
      nodes.setRecordedBuffer(nodeId, buf);
      nodes.setRecordingState(nodeId, false);
    } catch {
      // ignore decode errors
    }
  });

  recorder.addEventListener("timeupdate", (event) => {
    void event; // live analyser handled via bufferupdate below
  });
}

const liveBuffer = ref<AudioBuffer | null>(null);

if (recorder) {
  recorder.addEventListener("bufferupdate", (event) => {
    liveBuffer.value = event.buffer;
  });
}

// Stop recording and clear live state when the node changes
watch(
  () => props.node,
  (next, prev) => {
    if (next?.id !== prev?.id) {
      liveBuffer.value = null;
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
  nodes.setRecordedBuffer(props.node.id, null);
}

watch(confirmReset, async (val) => {
  if (val) {
    await nextTick();
    resetCancelBtnRef.value?.focus();
  }
});

// ── Playback label ────────────────────────────────────────────────────────────

const playbackLabel = computed(() => {
  const dur = props.node.buffer?.duration ?? 0;
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
});
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-base-100">
    <!-- ── Row 1: Header (label | ruler | zoom) ───────────────────────────── -->
    <div class="shrink-0 flex items-stretch h-10 border-b border-base-300/60 bg-base-200">
      <!-- Track label -->
      <div
        class="shrink-0 flex items-center gap-1.5 px-2 border-r border-base-300/60 text-xs text-base-content/60"
        style="width: 80px"
      >
        <i class="iconify mdi--microphone text-sm" aria-hidden="true" />
        <span class="truncate">Audio</span>
      </div>

      <!-- Timeline ruler (shows playback position, allows seeking) -->
      <TimelineRuler
        class="flex-1 min-w-0"
        :durationSeconds="totalDurationSeconds"
        :offsetTime="0"
        :ratio="zoomRatio"
        :currentTime="previewTime"
        @seek="previewSeek"
      />

      <!-- Zoom control -->
      <ZoomControl
        v-model="zoomRatio"
        :min="1"
        :max="20"
        class="w-40 shrink-0 border-l border-base-300/60"
      />
    </div>

    <!-- ── Row 2: Visualizer (flex-1) ──────────────────────────────────────── -->
    <div class="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
      <!-- Recording in progress → live waveform or spinner -->
      <template v-if="isRecording">
        <div class="w-full h-full flex items-center justify-center p-2">
          <WaveformView
            v-if="liveBuffer"
            :buffer="liveBuffer"
            :currentTime="previewTime"
            class="w-full h-full"
            @seek="() => {}"
          />
          <div v-else class="text-sm text-base-content/40 flex items-center gap-2">
            <i class="iconify mdi--loading animate-spin size-5" />
            Recording… {{ recordingDurationLabel }}
          </div>
        </div>
      </template>

      <!-- Has buffer → interactive waveform -->
      <template v-else-if="node.buffer">
        <WaveformView
          :buffer="node.buffer"
          :currentTime="previewTime"
          class="w-full h-full"
          @seek="previewSeek"
        />
      </template>

      <!-- No buffer yet (empty state handled in this block too) -->
      <template v-else>
        <div class="flex flex-col items-center gap-2 text-base-content/30 text-sm">
          <i class="iconify mdi--microphone-outline size-10 mb-1" aria-hidden="true" />
          <p>No recording yet</p>
        </div>
      </template>
    </div>

    <!-- ── Player Controls ─────────────────────────────────────────────── -->
    <div class="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-base-200 border-t border-base-300/60 min-h-10">
      <!-- No buffer, not recording -->
      <template v-if="!node.buffer && !isRecording">
        <button class="btn btn-sm btn-error gap-1" title="Start recording" @click="startRecording">
          <i class="iconify mdi--record size-4" aria-hidden="true" />
          Record
        </button>
        <span class="text-xs text-base-content/50">0:00</span>
        <label class="flex items-center gap-1.5 text-xs text-base-content/60 ml-2 cursor-pointer select-none">
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
      <template v-else-if="isRecording">
        <button class="btn btn-sm btn-warning gap-1" title="Stop recording" @click="stopRecording">
          <i class="iconify mdi--stop size-4" aria-hidden="true" />
          Stop
        </button>
        <span class="text-xs text-base-content/50 tabular-nums">{{ recordingDurationLabel }}</span>
      </template>

      <!-- Has buffer -->
      <template v-else-if="node.buffer">
        <button
          class="btn btn-sm btn-ghost btn-square"
          :title="previewState === 'playing' ? 'Pause' : 'Play'"
          @click="previewState === 'playing' ? previewPause() : previewPlay()"
        >
          <i
            class="iconify size-4"
            :class="previewState === 'playing' ? 'mdi--pause' : 'mdi--play'"
            aria-hidden="true"
          />
        </button>
        <span class="text-xs text-base-content/50 tabular-nums">{{ playbackLabel }}</span>

        <div class="flex-1" />

        <button class="btn btn-xs btn-ghost" title="Insert silence — coming soon" disabled>
          <i class="iconify mdi--format-pilcrow size-3.5" aria-hidden="true" />
        </button>
        <button class="btn btn-xs btn-ghost" title="Cut — coming soon" disabled>
          <i class="iconify mdi--content-cut size-3.5" aria-hidden="true" />
        </button>
        <button class="btn btn-xs btn-ghost" title="Copy — coming soon" disabled>
          <i class="iconify mdi--content-copy size-3.5" aria-hidden="true" />
        </button>
        <button class="btn btn-xs btn-ghost" title="Paste — coming soon" disabled>
          <i class="iconify mdi--content-paste size-3.5" aria-hidden="true" />
        </button>

        <div class="w-px h-5 bg-base-300/60 mx-1" aria-hidden="true" />

        <button class="btn btn-xs btn-ghost text-error" title="Delete recorded audio" @click="requestReset">
          <i class="iconify mdi--trash-can-outline size-3.5" aria-hidden="true" />
          Reset
        </button>
      </template>
    </div>

    <!-- ── Reset confirmation dialog ─────────────────────────────────────── -->
    <dialog class="modal" :class="{ 'modal-open': confirmReset }">
      <div class="modal-box bg-base-300 max-w-sm">
        <h3 class="mb-2 text-lg font-bold">Delete Recording?</h3>
        <p class="py-3 text-sm text-base-content/70">
          This will permanently delete the recorded audio from this node. This action cannot be undone.
        </p>
        <div class="modal-action">
          <button class="btn btn-ghost" ref="resetCancelBtnRef" @click="cancelReset">Cancel</button>
          <button class="btn btn-error" @click="doReset">Delete</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop" @click="cancelReset">
        <button>close</button>
      </form>
    </dialog>
  </div>
</template>
