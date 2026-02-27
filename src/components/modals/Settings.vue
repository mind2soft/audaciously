<script setup lang="ts">
import { inject, onUpdated, ref, watch } from "vue";
import { playerKey, recorderKey } from "../../lib/provider-keys";
import type { AudioPlayer } from "../../lib/audio/player";
import type { Recorder } from "../../lib/audio/recorder";
import { enumerateAudioDevices } from "../../lib/audio/devices";
import { patchSettings } from "../../lib/settings";

interface SettingsModalProps {
  open: boolean;
}
interface SettingsModalEvents {
  close: [];
}

const props = defineProps<SettingsModalProps>();
const emit = defineEmits<SettingsModalEvents>();

const _player = inject<AudioPlayer>(playerKey);
const _recorder = inject<Recorder>(recorderKey);

if (!_player) throw new Error("missing player");
if (!_recorder) throw new Error("missing recorder");

// Capture the narrowed (non-optional) types so closures below don't see
// `AudioPlayer | undefined` — TypeScript's throw-guard narrowing doesn't
// propagate across function boundaries.
const player = _player;
const recorder = _recorder;

const dialogRef = ref<HTMLDialogElement>();
const inputDevices = ref<MediaDeviceInfo[]>([]);
const outputDevices = ref<MediaDeviceInfo[]>([]);
const selectedInputId = ref<string>("");
const selectedOutputId = ref<string>("");
const echoCancellation = ref(false);
const noiseSuppression = ref(false);
const autoGainControl = ref(false);
const isLoading = ref(false);

/** Resolve the audio constraints object (or null) from the recorder. */
function getAudioConstraints(): MediaTrackConstraints | null {
  const constraints = recorder.getMediaStreamConstraints();
  const audio = constraints.audio;
  if (!audio || typeof audio === "boolean") return null;
  return audio as MediaTrackConstraints;
}

/** Read the currently selected input deviceId out of the recorder constraints. */
function readInputDeviceId(): string {
  const audio = getAudioConstraints();
  if (!audio) return "";
  const dc = audio.deviceId;
  if (!dc) return "";
  if (typeof dc === "string") return dc;
  if (Array.isArray(dc)) return (dc[0] as string) ?? "";
  // ConstrainDOMStringParameters — may have .exact or .ideal
  const params = dc as ConstrainDOMStringParameters;
  return (typeof params.exact === "string" ? params.exact : "") ||
    (typeof params.ideal === "string" ? params.ideal : "");
}

/** Read a boolean ConstrainBoolean field (echoCancellation etc.) */
function readBoolConstraint(
  field: keyof Pick<
    MediaTrackConstraints,
    "echoCancellation" | "noiseSuppression" | "autoGainControl"
  >
): boolean {
  const audio = getAudioConstraints();
  if (!audio) return false;
  const value = audio[field];
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") {
    const v = value as ConstrainBooleanParameters;
    return !!(v.exact ?? v.ideal ?? false);
  }
  return false;
}

async function loadDevices(): Promise<void> {
  isLoading.value = true;
  try {
    const { inputs, outputs } = await enumerateAudioDevices();
    inputDevices.value = inputs;
    outputDevices.value = outputs;

    // Pre-select whatever is currently configured
    const currentInput = readInputDeviceId();
    selectedInputId.value = inputs.some((d) => d.deviceId === currentInput)
      ? currentInput
      : "";

    const currentOutput = player.getOutputDeviceId() ?? "";
    selectedOutputId.value = outputs.some((d) => d.deviceId === currentOutput)
      ? currentOutput
      : "";

    // Read audio processing flags from current constraints
    echoCancellation.value = readBoolConstraint("echoCancellation");
    noiseSuppression.value = readBoolConstraint("noiseSuppression");
    autoGainControl.value = readBoolConstraint("autoGainControl");
  } finally {
    isLoading.value = false;
  }
}

// Load fresh device list whenever the dialog is opened.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) loadDevices();
  }
);

// Show / hide the native <dialog> element in sync with the `open` prop.
onUpdated(() => {
  if (!dialogRef.value) return;
  if (props.open) {
    dialogRef.value.showModal();
  } else {
    dialogRef.value.close();
  }
});

const handleApply = async () => {
  // Build the audio constraints, merging deviceId + audio-processing flags
  const inputId = selectedInputId.value;
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: echoCancellation.value,
    noiseSuppression: noiseSuppression.value,
    autoGainControl: autoGainControl.value,
  };
  if (inputId) {
    audioConstraints.deviceId = { exact: inputId };
  }
  recorder.setMediaStreamConstraints({ audio: audioConstraints });

  // Update player output device
  await player.setOutputDeviceId(selectedOutputId.value);

  // Persist so the choices survive a page reload
  patchSettings({
    inputDeviceId: selectedInputId.value,
    outputDeviceId: selectedOutputId.value,
    echoCancellation: echoCancellation.value,
    noiseSuppression: noiseSuppression.value,
    autoGainControl: autoGainControl.value,
  });

  emit("close");
};

const handleClose = () => {
  emit("close");
};
</script>

<template>
  <dialog ref="dialogRef" class="modal" @cancel.prevent="handleClose">
    <div class="bg-base-300 modal-box">
      <h3 class="mb-6 text-lg font-bold">Settings</h3>

      <div class="flex flex-col gap-5">
        <!-- Input device -->
        <label class="flex flex-col gap-1.5">
          <span class="flex gap-2 items-center text-sm font-medium">
            <i class="iconify mdi--microphone text-base" />
            Input device
          </span>
          <select
            v-model="selectedInputId"
            class="select w-full"
            :disabled="isLoading"
          >
            <option value="">— System default —</option>
            <option
              v-for="device in inputDevices"
              :key="device.deviceId"
              :value="device.deviceId"
            >
              {{ device.label || device.deviceId || "Unknown device" }}
            </option>
          </select>
        </label>

        <!-- Output device -->
        <label class="flex flex-col gap-1.5">
          <span class="flex gap-2 items-center text-sm font-medium">
            <i class="iconify mdi--speaker text-base" />
            Output device
          </span>
          <select
            v-model="selectedOutputId"
            class="select w-full"
            :disabled="isLoading"
          >
            <option value="">— System default —</option>
            <option
              v-for="device in outputDevices"
              :key="device.deviceId"
              :value="device.deviceId"
            >
              {{ device.label || device.deviceId || "Unknown device" }}
            </option>
          </select>
        </label>

        <!-- Audio processing -->
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">Audio processing</span>
          <p class="text-xs opacity-60">
            Disable these when overdubbing (recording while tracks play back).
            Using headphones is recommended when they are off.
          </p>
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              v-model="echoCancellation"
              :disabled="isLoading"
            />
            <span class="text-sm">Echo cancellation</span>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              v-model="noiseSuppression"
              :disabled="isLoading"
            />
            <span class="text-sm">Noise suppression</span>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              v-model="autoGainControl"
              :disabled="isLoading"
            />
            <span class="text-sm">Auto gain control</span>
          </label>
        </div>
      </div>

      <div class="modal-action">
        <button class="btn btn-ghost" v-on:click="handleClose">Cancel</button>
        <button
          class="btn btn-primary"
          v-on:click="handleApply"
          :disabled="isLoading"
        >
          Apply
        </button>
      </div>
    </div>

    <!-- Clicking the backdrop closes without saving -->
    <form method="dialog" class="modal-backdrop">
      <button v-on:click="handleClose">close</button>
    </form>
  </dialog>
</template>
