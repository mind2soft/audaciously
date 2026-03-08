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

// Sync parent state when the dialog is closed by ANY means (Escape, backdrop, etc.)
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
  <dialog ref="dialogRef" class="modal" @cancel.prevent="handleCancel">
    <div class="modal-box bg-base-300">
      <h3 class="mb-6 text-lg font-bold">Add Instrument Track</h3>

      <div class="flex flex-col gap-5">
        <!-- Track name -->
        <label class="flex flex-col gap-1.5">
          <span class="flex gap-2 items-center text-sm font-medium">
            <i class="iconify mdi--music-note text-base" />
            Track name
          </span>
          <input
            v-model="trackName"
            type="text"
            placeholder="e.g. Lead Piano"
            :class="['input w-full', nameError ? 'input-error' : '']"
            @input="nameError = false"
            @keydown.enter="handleConfirm"
          />
          <p v-if="nameError" class="text-xs text-error">
            Please enter a track name.
          </p>
        </label>

        <!-- Instrument selection -->
        <div class="flex flex-col gap-1.5">
          <span class="flex gap-2 items-center text-sm font-medium">
            <i class="iconify mdi--piano text-base" />
            Instrument
          </span>
          <div class="flex gap-3">
            <button
              v-for="instrument in INSTRUMENT_LIST"
              :key="instrument.id"
              :class="[
                'btn flex-1 flex flex-col gap-1 h-auto py-3',
                selectedInstrumentId === instrument.id ? 'btn-primary' : 'btn-outline',
              ]"
              @click="selectedInstrumentId = instrument.id"
            >
              <i :class="`iconify ${instrument.icon} size-6`" />
              <span class="text-sm">{{ instrument.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="modal-action">
        <button class="btn btn-ghost" @click="handleCancel">Cancel</button>
        <button class="btn btn-primary" @click="handleConfirm">Add Track</button>
      </div>
    </div>

    <!-- Clicking the backdrop cancels -->
    <form method="dialog" class="modal-backdrop">
      <button @click="handleCancel">close</button>
    </form>
  </dialog>
</template>
