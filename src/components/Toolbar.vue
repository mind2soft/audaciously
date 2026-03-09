<script setup lang="ts">
import { inject, ref, onMounted, onBeforeUnmount } from "vue";
import { toolsKey } from "../lib/provider-keys";
import AudioTest from "./AudioTest.vue";
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
  <div
    class="flex gap-1 items-center p-1 bg-base-200 border-t border-base-300/60"
  >
    <AudioTest />
    <div class="divider divider-horizontal mx-0"></div>
    <button
      :class="{
        'btn btn-sm': true,
        'btn-primary': selectedTool === selectToolKey,
        'btn-ghost': selectedTool !== selectToolKey,
      }"
      title="Select sequences"
      v-on:click="handleSelectTool(selectToolKey)"
    >
      <i class="iconify mdi--cursor-pointer size-4" />
      <span class="hidden sm:inline">Select</span>
    </button>
    <button
      :class="{
        'btn btn-sm': true,
        'btn-primary': selectedTool === sequenceMoveToolKey,
        'btn-ghost': selectedTool !== sequenceMoveToolKey,
      }"
      title="Pan track"
      v-on:click="handleSelectTool(sequenceMoveToolKey)"
    >
      <i class="iconify mdi--pan-horizontal size-4" />
      <span class="hidden sm:inline">Pan</span>
    </button>
    <button
      :class="{
        'btn btn-sm': true,
        'btn-primary': selectedTool === sequenceSplitToolKey,
        'btn-ghost': selectedTool !== sequenceSplitToolKey,
      }"
      title="Split sequence"
      v-on:click="handleSelectTool(sequenceSplitToolKey)"
    >
      <i class="iconify mdi--paper-cut-vertical size-4" />
      <span class="hidden sm:inline">Split</span>
    </button>
    <button
      :class="{
        'btn btn-sm': true,
        'btn-primary': selectedTool === sequenceCutToolKey,
        'btn-ghost': selectedTool !== sequenceCutToolKey,
      }"
      title="Remove sequence"
      v-on:click="handleSelectTool(sequenceCutToolKey)"
    >
      <i class="iconify mdi--clip size-4" />
      <span class="hidden sm:inline">Cut</span>
    </button>
  </div>
</template>
