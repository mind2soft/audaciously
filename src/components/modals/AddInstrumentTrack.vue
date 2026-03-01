<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { INSTRUMENT_LIST } from "../../lib/music/instruments";
import type { MusicInstrumentId } from "../../lib/music/instruments";

interface AddInstrumentTrackProps {
  open: boolean;
}
interface AddInstrumentTrackEvents {
  close: [];
  confirm: [name: string, instrumentId: MusicInstrumentId];
}

const props = defineProps<AddInstrumentTrackProps>();
const emit = defineEmits<AddInstrumentTrackEvents>();

const dialogRef = ref<HTMLDialogElement>();
const trackName = ref("");
const selectedInstrumentId = ref<MusicInstrumentId>("piano");
const nameError = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (!dialogRef.value) return;
    if (isOpen) {
      trackName.value = "";
      selectedInstrumentId.value = "piano";
      nameError.value = false;
      dialogRef.value.showModal();
    } else {
      dialogRef.value.close();
    }
  }
);

// Sync parent state when the dialog is closed by ANY means (native Enter,
// Escape key, backdrop click, etc.) so showAddTrackModal never gets stuck.
const handleNativeClose = () => emit("close");

onMounted(() => dialogRef.value?.addEventListener("close", handleNativeClose));
onBeforeUnmount(() => dialogRef.value?.removeEventListener("close", handleNativeClose));

const handleConfirm = () => {
  if (!trackName.value.trim()) {
    nameError.value = true;
    return;
  }
  emit("confirm", trackName.value.trim(), selectedInstrumentId.value);
  emit("close");
};

const handleCancel = () => {
  emit("close");
};
</script>

<template>
  <dialog ref="dialogRef" class="modal">
    <div class="modal-box bg-base-300">
      <h3 class="text-lg font-bold mb-4">Add Instrument Track</h3>

      <!-- Track name -->
      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text">Track name</span>
        </label>
        <input
          v-model="trackName"
          type="text"
          placeholder="e.g. Lead Piano"
          :class="['input input-bordered w-full', nameError ? 'input-error' : '']"
          v-on:input="nameError = false"
          v-on:keydown.enter="handleConfirm"
        />
        <label v-if="nameError" class="label">
          <span class="label-text-alt text-error">Please enter a track name.</span>
        </label>
      </div>

      <!-- Instrument selection -->
      <div class="form-control mb-6">
        <label class="label">
          <span class="label-text">Instrument</span>
        </label>
        <div class="flex gap-3">
          <button
            v-for="instrument in INSTRUMENT_LIST"
            :key="instrument.id"
            :class="[
              'btn flex-1 flex flex-col gap-1 h-auto py-3',
              selectedInstrumentId === instrument.id ? 'btn-primary' : 'btn-outline',
            ]"
            v-on:click="selectedInstrumentId = instrument.id"
          >
            <i :class="`iconify ${instrument.icon} size-6`" />
            <span class="text-sm">{{ instrument.label }}</span>
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="modal-action">
        <button class="btn btn-ghost" v-on:click="handleCancel">Cancel</button>
        <button class="btn btn-primary" v-on:click="handleConfirm">Add Track</button>
      </div>
    </div>

    <!-- Click-outside backdrop -->
    <form method="dialog" class="modal-backdrop">
      <button v-on:click="handleCancel">close</button>
    </form>
  </dialog>
</template>
