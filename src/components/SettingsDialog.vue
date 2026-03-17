<script setup lang="ts">
/**
 * SettingsDialog — audio input / output device selection and browser processing toggles.
 *
 * Follows the same pattern as ExportAudioDialog:
 *   - props.open / emit("close") controlled externally via project.settingsOpen
 *   - native <dialog> + DaisyUI modal classes
 *   - settings loaded from localStorage on open, staged locally, saved on "Done"
 *   - volume and output device are applied live to the player engine on save
 */

import { ref, watch } from "vue";
import { type AudioDeviceList, enumerateAudioDevices } from "../lib/audio/devices";
import {
  defaultSettings,
  loadSettings,
  type PersistedSettings,
  saveSettings,
} from "../lib/settings";
import { usePlayerStore } from "../stores/player";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const playerStore = usePlayerStore();

const dialogRef = ref<HTMLDialogElement>();

// ─── Staged settings (local copy — not written to store until "Done") ────────

const staged = ref<PersistedSettings>({ ...defaultSettings });

// ─── Device enumeration ───────────────────────────────────────────────────────

const devices = ref<AudioDeviceList>({ inputs: [], outputs: [] });
const loadingDevices = ref(false);

async function loadDevices(): Promise<void> {
  loadingDevices.value = true;
  try {
    devices.value = await enumerateAudioDevices();
  } catch {
    // Proceed with empty lists; labels may be absent if permission is denied.
  } finally {
    loadingDevices.value = false;
  }
}

// ─── Dialog open / close ──────────────────────────────────────────────────────

watch(
  () => props.open,
  (isOpen) => {
    if (!dialogRef.value) return;
    if (isOpen) {
      // Populate staged from persisted settings each time the dialog opens.
      staged.value = { ...loadSettings() };
      // Enumerate devices (may trigger a permission prompt on first use).
      void loadDevices();
      if (!dialogRef.value.open) dialogRef.value.showModal();
    } else {
      if (dialogRef.value.open) dialogRef.value.close();
    }
  },
);

// ─── Actions ──────────────────────────────────────────────────────────────────

function doConfirm(): void {
  saveSettings(staged.value);
  // Live-apply playback settings immediately (no restart needed).
  playerStore.setVolume(staged.value.volume);
  void playerStore.getEngine().setOutputDeviceId(staged.value.outputDeviceId);
  emit("close");
}

function doCancel(): void {
  emit("close");
}
</script>

<template>
  <dialog ref="dialogRef" class="modal" @cancel.prevent="doCancel">
    <div class="modal-box bg-base-300 max-w-md">
      <h3 class="mb-6 text-lg font-bold">Settings</h3>

      <div class="flex flex-col gap-6">
        <!-- ─── Audio Input ──────────────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
          <h4
            class="text-xs font-semibold uppercase tracking-wider text-base-content/50"
          >
            Audio Input
          </h4>

          <!-- Input device selector -->
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Microphone</span>
            <select
              class="select select-sm w-full"
              v-model="staged.inputDeviceId"
              :disabled="loadingDevices"
            >
              <option value="">System Default</option>
              <option
                v-for="d in devices.inputs"
                :key="d.deviceId"
                :value="d.deviceId"
              >
                {{ d.label || `Microphone (${d.deviceId.slice(0, 8)}…)` }}
              </option>
            </select>
            <p class="text-xs text-base-content/50">
              Applied when you next start recording.
            </p>
          </label>

          <!-- Browser processing toggles -->
          <div class="flex flex-col gap-2.5 pt-1">
            <label
              class="flex items-center justify-between gap-3 cursor-pointer"
            >
              <div class="flex flex-col gap-0.5">
                <span class="text-sm">Echo Cancellation</span>
                <span class="text-xs text-base-content/50"
                  >Reduces speaker feedback in the recording.</span
                >
              </div>
              <input
                type="checkbox"
                class="toggle toggle-sm toggle-primary"
                v-model="staged.echoCancellation"
              />
            </label>
            <label
              class="flex items-center justify-between gap-3 cursor-pointer"
            >
              <div class="flex flex-col gap-0.5">
                <span class="text-sm">Noise Suppression</span>
                <span class="text-xs text-base-content/50"
                  >Filters out background noise from recordings.</span
                >
              </div>
              <input
                type="checkbox"
                class="toggle toggle-sm toggle-primary"
                v-model="staged.noiseSuppression"
              />
            </label>
            <label
              class="flex items-center justify-between gap-3 cursor-pointer"
            >
              <div class="flex flex-col gap-0.5">
                <span class="text-sm">Auto Gain Control</span>
                <span class="text-xs text-base-content/50"
                  >Automatically adjusts microphone input level.</span
                >
              </div>
              <input
                type="checkbox"
                class="toggle toggle-sm toggle-primary"
                v-model="staged.autoGainControl"
              />
            </label>
          </div>
        </section>

        <div class="border-t border-base-content/10" aria-hidden="true" />

        <!-- ─── Audio Output ───────────────────────────────────────────────── -->
        <section class="flex flex-col gap-3">
          <h4
            class="text-xs font-semibold uppercase tracking-wider text-base-content/50"
          >
            Audio Output
          </h4>

          <!-- Output device selector -->
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium">Output Device</span>
            <select
              class="select select-sm w-full"
              v-model="staged.outputDeviceId"
              :disabled="loadingDevices"
            >
              <option value="">System Default</option>
              <option
                v-for="d in devices.outputs"
                :key="d.deviceId"
                :value="d.deviceId"
              >
                {{ d.label || `Speaker (${d.deviceId.slice(0, 8)}…)` }}
              </option>
            </select>
            <p class="text-xs text-base-content/50">
              Applied immediately when you click Done.
            </p>
          </label>

          <!-- Master volume -->
          <label class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">Master Volume</span>
              <span class="text-xs tabular-nums text-base-content/50">
                {{ Math.round(staged.volume * 100) }}%
              </span>
            </div>
            <input
              type="range"
              class="range range-sm range-primary"
              min="0"
              max="3"
              step="0.01"
              v-model.number="staged.volume"
            />
            <p class="text-xs text-base-content/50">
              Up to 300% for quiet recordings. Applied immediately when you
              click Done.
            </p>
          </label>
        </section>
      </div>

      <!-- Actions -->
      <div class="modal-action">
        <button class="btn btn-ghost" @click="doCancel">Cancel</button>
        <button class="btn btn-primary" @click="doConfirm">Done</button>
      </div>
    </div>

    <form method="dialog" class="modal-backdrop">
      <button @click.prevent="doCancel">close</button>
    </form>
  </dialog>
</template>
