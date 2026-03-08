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
      <div class="bg-base-300 modal-box max-w-md xl:max-w-2xl">

      <!-- Identity header -->
      <div class="flex flex-col items-center text-center gap-3 pb-5 border-b border-base-content/10">
        <div class="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
          <i class="iconify mdi--music-note text-primary text-3xl" />
        </div>
        <div>
          <h2 class="text-xl font-bold tracking-tight">{{ appName }}</h2>
          <p class="text-base-content/40 text-xs mt-0.5">v{{ appVersion }} · early preview</p>
        </div>
        <p class="text-sm text-base-content/60 leading-relaxed max-w-xs">
          A free music studio that lives in your browser.
          Record, compose, and mix — no install, no account, just music.
        </p>
      </div>

      <!-- Feature highlights -->
      <div class="grid grid-cols-2 gap-4 py-5">
        <div class="flex gap-3 items-start">
          <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-error/15 flex items-center justify-center">
            <i class="iconify mdi--microphone text-error text-base" />
          </div>
          <div>
            <p class="text-sm font-semibold leading-tight">Record anything</p>
            <p class="text-xs text-base-content/50 mt-0.5 leading-snug">
              Vocals, guitar, narration — captured straight from your mic.
            </p>
          </div>
        </div>

        <div class="flex gap-3 items-start">
          <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center">
            <i class="iconify mdi--piano text-secondary text-base" />
          </div>
          <div>
            <p class="text-sm font-semibold leading-tight">Compose with a piano roll</p>
            <p class="text-xs text-base-content/50 mt-0.5 leading-snug">
              Sketch melodies and chord progressions using built-in instruments.
            </p>
          </div>
        </div>

        <div class="flex gap-3 items-start">
          <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
            <i class="iconify mdi--tune-variant text-warning text-base" />
          </div>
          <div>
            <p class="text-sm font-semibold leading-tight">Mix your tracks</p>
            <p class="text-xs text-base-content/50 mt-0.5 leading-snug">
              Layer sounds, tweak volumes and pan, shape the final mix.
            </p>
          </div>
        </div>

        <div class="flex gap-3 items-start">
          <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center">
            <i class="iconify mdi--content-save text-success text-base" />
          </div>
          <div>
            <p class="text-sm font-semibold leading-tight">Your work is always saved</p>
            <p class="text-xs text-base-content/50 mt-0.5 leading-snug">
              Projects live in your browser — pick up right where you left off.
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <p class="text-xs text-base-content/30 text-center pt-3 border-t border-base-content/10">
        Free &amp; open source ·
        <a
          class="link link-hover"
          href="https://www.gnu.org/licenses/gpl-3.0.html"
          target="_blank"
        >GPL-3.0</a>
      </p>

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
