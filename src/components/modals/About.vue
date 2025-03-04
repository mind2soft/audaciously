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

const handleCloseDialog = () => {
  emit("close");
};

onUpdated(() => {
  if (dialogRef.value) {
    if (props.open) {
      dialogRef.value.show();
    } else {
      dialogRef.value.close();
    }
  }
});
</script>

<template>
  <dialog ref="dialogRef" class="modal">
    <div class="bg-base-300 modal-box">
      <h3 class="flex gap-4 items-baseline mb-6">
        <span class="text-lg font-bold">{{ appName }}</span
        ><span class="text-sm">{{ appVersion }}</span>
      </h3>
      <div class="flex overflow-y-auto flex-col gap-4 max-h-80">
        <p>
          This project was done using
          <a class="underline" href="https://vuejs.org/">Vue 3</a> (Composition
          API) and
          <a class="underline" href="https://tailwindcss.com/" target="_blank"
            >Tailwind CSS 4</a
          >
          (using
          <a class="underline" href="https://v5.daisyui.com/" target="_blank"
            >Daisy UI v5</a
          >).
        </p>
        <p>
          The goal is to reproduce
          <a
            class="underline"
            href="https://www.audacityteam.org/"
            target="_blank"
            >Audacity</a
          >, or similar audio recording project, in the browser.
        </p>
        <h5 class="font-bold">What's implemented?</h5>
        <ul class="pl-8 list-disc list-outside">
          <li>Master volume with 2x volume boost</li>
          <li>Recording from default microphone</li>
          <li>Playback (seeking, pause, resume, stop, etc.)</li>
          <li>Audio tools (split, move, cut)</li>
          <li>Using Web Workers for background processing</li>
        </ul>
        <h5 class="font-bold">What's not completed?</h5>
        <ul class="pl-8 list-disc list-outside">
          <li>
            Audio filters (fading, balance, equaliser, normalise, pitch, noise
            cancelling, etc.)
          </li>
          <li>Changing playback speek per audio sequence</li>
          <li>Saving and loading projects</li>
          <li>Exporting project to other formats</li>
          <li>Scrolling and zooming improvements</li>
        </ul>
        <h5 class="font-bold">Bugs?</h5>
        <ul class="pl-8 list-disc list-outside">
          <li>Recording while playing sound affect recording quality</li>
          <li>
            Updating sequences (e.g. splitting a sequence) does not update the
            track correctly
          </li>
        </ul>
      </div>
      <div class="modal-action">
        <form method="dialog">
          <!-- if there is a button in form, it will close the modal -->
          <button class="btn" v-on:click="handleCloseDialog">Close</button>
        </form>
      </div>
    </div>
  </dialog>
</template>
