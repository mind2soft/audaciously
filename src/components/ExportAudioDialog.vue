<script setup lang="ts">
import { ref, watch } from "vue";
import { usePlayerStore } from "../stores/player";
import { mixdownProject } from "../lib/audio/mixdown";
import { encodeMp3 } from "../lib/audio/encode/mp3-encoder";
import { encodeWav } from "../lib/audio/encode/wav-encoder";

const props = defineProps<{
  open: boolean;
  projectName?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const playerStore = usePlayerStore();
const player = playerStore.getEngine();

const dialogRef = ref<HTMLDialogElement>();

// ─── Format settings ────────────────────────────────────────────────────────

type AudioFormat = "mp3" | "wav";

const format = ref<AudioFormat>("mp3");
const mp3Kbps = ref(128);
const mp3Channels = ref(2);
const wavBitDepth = ref("16");
const sampleRate = ref(44100);

// ─── Export state ───────────────────────────────────────────────────────────

const exporting = ref(false);
const progress = ref(-1); // -1 = indeterminate
const stage = ref("");
const error = ref<string | null>(null);

// ─── Dialog open/close ──────────────────────────────────────────────────────

watch(
  () => props.open,
  (isOpen) => {
    if (!dialogRef.value) return;
    if (isOpen) {
      if (!dialogRef.value.open) dialogRef.value.showModal();
    } else {
      if (dialogRef.value.open) dialogRef.value.close();
      // Reset transient state when closed
      error.value = null;
      stage.value = "";
      progress.value = -1;
    }
  },
);

// ─── Helpers ────────────────────────────────────────────────────────────────

const triggerDownload = (blob: Blob, name: string, ext: string) => {
  const safeName =
    (name || "untitled").replaceAll(/[^a-zA-Z0-9 _-]/g, "_").trim() ||
    "untitled";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName}.${ext}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

// ─── Export handler ─────────────────────────────────────────────────────────

const doExport = async () => {
  if (exporting.value) return;
  exporting.value = true;
  progress.value = -1;
  error.value = null;

  try {
    // Stage 1: Mixdown
    stage.value = "Mixing down\u2026";
    const channels = format.value === "mp3" ? mp3Channels.value : 2;
    const audioBuffer = await mixdownProject(player, {
      sampleRate: sampleRate.value,
      channels,
    });

    // Stage 2: Encode
    let blob: Blob;
    let ext: string;

    if (format.value === "mp3") {
      stage.value = "Encoding MP3\u2026";
      progress.value = 0.5;
      blob = await encodeMp3(audioBuffer, {
        kbps: mp3Kbps.value,
        channels: channels as 1 | 2,
        onProgress: (p) => {
          progress.value = 0.5 + p * 0.5;
        },
      });
      ext = "mp3";
    } else {
      stage.value = "Encoding WAV\u2026";
      progress.value = 0.5;
      blob = encodeWav(audioBuffer, { float32: wavBitDepth.value === "32" });
      progress.value = 1;
      ext = "wav";
    }

    // Trigger download
    triggerDownload(blob, props.projectName ?? "", ext);

    // Brief pause so user sees completion before dialog closes
    stage.value = "Complete!";
    await new Promise((r) => setTimeout(r, 400));
    emit("close");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Export failed.";
    stage.value = "";
    progress.value = -1;
  } finally {
    exporting.value = false;
  }
};

// ─── Cancel ─────────────────────────────────────────────────────────────────

const doCancel = () => {
  if (exporting.value) return;
  emit("close");
};
</script>

<template>
  <dialog ref="dialogRef" class="modal" @cancel.prevent="doCancel">
    <div class="modal-box bg-base-300 max-w-md">
      <h3 class="mb-6 text-lg font-bold">Export Audio</h3>

      <div class="flex flex-col gap-5">
        <!-- Format selector -->
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">Format</span>
          <div class="flex gap-6">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                class="radio radio-sm radio-primary"
                value="mp3"
                v-model="format"
                :disabled="exporting"
              />
              <span class="text-sm">MP3</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                class="radio radio-sm radio-primary"
                value="wav"
                v-model="format"
                :disabled="exporting"
              />
              <span class="text-sm">WAV</span>
            </label>
          </div>
        </div>

        <!-- MP3 settings -->
        <template v-if="format === 'mp3'">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Bitrate</span>
            <select
              class="select w-full"
              v-model.number="mp3Kbps"
              :disabled="exporting"
            >
              <option value="128">128 kbps</option>
              <option value="192">192 kbps</option>
              <option value="256">256 kbps</option>
              <option value="320">320 kbps</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Channels</span>
            <select
              class="select w-full"
              v-model.number="mp3Channels"
              :disabled="exporting"
            >
              <option value="2">Stereo</option>
              <option value="1">Mono</option>
            </select>
          </label>
        </template>

        <!-- WAV settings -->
        <template v-if="format === 'wav'">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Bit Depth</span>
            <select
              class="select w-full"
              v-model="wavBitDepth"
              :disabled="exporting"
            >
              <option value="16">16-bit PCM</option>
              <option value="32">32-bit Float</option>
            </select>
          </label>
        </template>

        <!-- Sample rate (shared) -->
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">Sample Rate</span>
          <select
            class="select w-full"
            v-model.number="sampleRate"
            :disabled="exporting"
          >
            <option value="44100">44,100 Hz</option>
            <option value="48000">48,000 Hz</option>
          </select>
        </label>
      </div>

      <!-- Progress -->
      <div v-if="exporting" class="mt-5">
        <div class="flex justify-between text-xs mb-1.5">
          <span>{{ stage }}</span>
          <span v-if="progress >= 0">{{ Math.round(progress * 100) }}%</span>
        </div>
        <progress
          v-if="progress < 0"
          class="progress progress-primary w-full"
        ></progress>
        <progress
          v-else
          class="progress progress-primary w-full"
          :value="progress * 100"
          max="100"
        ></progress>
      </div>

      <!-- Error -->
      <div v-if="error" class="alert alert-error text-sm mt-5">
        <i class="iconify mdi--alert-circle size-4 shrink-0" />
        <span>{{ error }}</span>
        <button class="btn btn-ghost btn-xs ml-auto" @click="error = null">
          <i class="iconify mdi--close size-3" />
        </button>
      </div>

      <!-- Actions -->
      <div class="modal-action">
        <button class="btn btn-ghost" :disabled="exporting" @click="doCancel">
          Cancel
        </button>
        <button class="btn btn-primary" :disabled="exporting" @click="doExport">
          <i
            v-if="exporting"
            class="iconify mdi--loading animate-spin size-4"
          />
          {{ exporting ? "Exporting\u2026" : "Export" }}
        </button>
      </div>
    </div>

    <!-- Clicking the backdrop closes without exporting — disabled during active export -->
    <form method="dialog" class="modal-backdrop">
      <button @click.prevent="doCancel">close</button>
    </form>
  </dialog>
</template>
