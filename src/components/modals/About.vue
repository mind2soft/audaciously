<script setup lang="ts">
import { onUpdated, ref } from "vue";
import { appName, appVersion } from "../../lib/constants";

interface AboutModalProps {
  open: boolean;
}
interface AboutModalEvents {
  close: [];
}

const props = defineProps<AboutModalProps>();
const emit = defineEmits<AboutModalEvents>();
const dialogRef = ref<HTMLDialogElement>();

const handleClose = () => {
  emit("close");
};

onUpdated(() => {
  if (!dialogRef.value) return;
  if (props.open) {
    dialogRef.value.showModal();
  } else {
    dialogRef.value.close();
  }
});
</script>

<template>
  <dialog ref="dialogRef" class="modal" @cancel.prevent="handleClose">
    <div class="bg-base-300 modal-box">
      <h3 class="mb-6 text-lg font-bold flex items-baseline gap-3">
        {{ appName }}
        <span class="text-sm font-normal text-base-content/50">v{{ appVersion }}</span>
      </h3>

      <div class="flex flex-col gap-4 overflow-y-auto max-h-80 text-sm">
        <p>
          This project was built using
          <a class="link" href="https://vuejs.org/" target="_blank">Vue 3</a>
          (Composition API) and
          <a class="link" href="https://tailwindcss.com/" target="_blank">Tailwind CSS 4</a>
          with
          <a class="link" href="https://v5.daisyui.com/" target="_blank">DaisyUI v5</a>.
        </p>
        <p>
          The goal is to reproduce
          <a class="link" href="https://www.audacityteam.org/" target="_blank">Audacity</a>,
          or a similar audio recording app, in the browser.
        </p>

        <div class="flex flex-col gap-1.5">
          <h5 class="font-semibold text-base-content/80">What's implemented</h5>
          <ul class="list-disc list-outside pl-5 flex flex-col gap-1 text-base-content/70">
            <li>Master volume with 2× volume boost</li>
            <li>Recording from default microphone</li>
            <li>Playback (seeking, pause, resume, stop, etc.)</li>
            <li>Audio tools (split, move, cut)</li>
            <li>Web Workers for background processing</li>
          </ul>
        </div>

        <div class="flex flex-col gap-1.5">
          <h5 class="font-semibold text-base-content/80">Not yet completed</h5>
          <ul class="list-disc list-outside pl-5 flex flex-col gap-1 text-base-content/70">
            <li>Audio filters (fading, EQ, normalise, pitch, noise cancelling, etc.)</li>
            <li>Per-sequence playback speed</li>
            <li>Scrolling and zooming improvements</li>
          </ul>
        </div>

        <div class="flex flex-col gap-1.5">
          <h5 class="font-semibold text-base-content/80">Known issues</h5>
          <ul class="list-disc list-outside pl-5 flex flex-col gap-1 text-base-content/70">
            <li>Recording quality degrades when tracks are playing simultaneously</li>
            <li>Splitting a sequence may not update the track display correctly</li>
          </ul>
        </div>
      </div>

      <div class="modal-action">
        <button class="btn" @click="handleClose">Close</button>
      </div>
    </div>

    <!-- Clicking the backdrop closes the dialog -->
    <form method="dialog" class="modal-backdrop">
      <button @click="handleClose">close</button>
    </form>
  </dialog>
</template>
