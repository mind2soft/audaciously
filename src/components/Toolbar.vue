moveToolKey
<script setup lang="ts">
import { inject, ref, onMounted, onBeforeUnmount } from "vue";
import { toolsKey } from "../lib/provider-keys";
import AudioTest from "./AudioTest.vue";
import AudioRecorder from "./AudioRecorder.vue";
import { selectToolKey } from "../lib/audio/tool/select";
import { sequenceSplitToolKey } from "../lib/audio/tool/sequence-split";
import { sequenceMoveToolKey } from "../lib/audio/tool/sequence-move";
import { sequenceCutToolKey } from "../lib/audio/tool/sequence-cut";
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
    <AudioTest />
    <AudioRecorder />
    <div class="divider divider-horizontal"></div>
    <button
      :class="{
        'btn btn-square size-16': true,
        'btn-primary': selectedTool === selectToolKey,
      }"
      title="Select sequences"
      v-on:click="handleSelectTool(selectToolKey)"
    >
      <i class="iconify mdi--cursor-pointer size-10" />
    </button>
    <button
      :class="{
        'btn btn-square size-16': true,
        'btn-primary': selectedTool === sequenceMoveToolKey,
      }"
      title="Pan track"
      v-on:click="handleSelectTool(sequenceMoveToolKey)"
    >
      <i class="iconify mdi--pan-horizontal size-10" />
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
    <button
      :class="{
        'btn btn-square size-16': true,
        'btn-primary': selectedTool === sequenceCutToolKey,
      }"
      title="Remove sequence"
      v-on:click="handleSelectTool(sequenceCutToolKey)"
    >
      <i class="iconify mdi--clip size-10" />
    </button>
  </div>
</template>
