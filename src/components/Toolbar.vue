moveToolKey
<script setup lang="ts">
import { inject, ref, onMounted, onBeforeUnmount } from "vue";
import { toolsKey } from "../lib/provider-keys";
import AudioRecorder from "./AudioRecorder.vue";
import { sequenceSplitToolKey } from "../lib/audio/tool/sequence-split";
import { sequenceMoveToolKey } from "../lib/audio/tool/sequence-move";
import type { Tools } from "../lib/audio/tools";

const tools = inject<Tools>(toolsKey);

if (!tools) {
  throw new Error("missing tools");
}

const selectedTool = ref<string>(tools.getSelected().key);

const handleSelectTool = (key: string) => {
  tools.selectTool(key);
  selectedTool.value = key;
};

const handleToolChange = () => {
  // TODO
};

onMounted(() => {
  tools.addEventListener("change", handleToolChange);
});

onBeforeUnmount(() => {
  tools.removeEventListener("change", handleToolChange);
});
</script>

<template>
  <div class="flex gap-1 p-2 bg-base-200">
    <AudioRecorder />
    <div class="divider divider-horizontal"></div>
    <button
      :class="{
        'btn btn-square size-16': true,
        'btn-primary': selectedTool === sequenceMoveToolKey,
      }"
      title="Select sequences"
      v-on:click="handleSelectTool(sequenceMoveToolKey)"
    >
      <i class="iconify mdi--cursor-pointer size-10" />
    </button>
    <button
      :class="{
        'btn btn-square size-16': true,
        'btn-primary': selectedTool === sequenceSplitToolKey,
      }"
      title="Split sequence"
      v-on:click="handleSelectTool(sequenceSplitToolKey)"
    >
      <i class="iconify mdi--paper-cut-vertical size-10" />
    </button>
    <button class="btn btn-square size-16" title="Pan track">
      <i class="iconify mdi--pan-horizontal size-10" />
    </button>
  </div>
</template>
