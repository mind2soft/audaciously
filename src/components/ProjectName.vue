<script setup lang="ts">
import { nextTick, ref } from "vue";

const model = defineModel<string>({ default: "Untitled Project" });

const editing = ref(false);
const inputRef = ref<HTMLInputElement>();

const startEditing = async () => {
  editing.value = true;
  await nextTick();
  inputRef.value?.select();
};

const stopEditing = () => {
  // Commit empty → revert to previous or default
  if (!model.value.trim()) {
    model.value = "Untitled Project";
  }
  editing.value = false;
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") stopEditing();
  if (e.key === "Escape") {
    editing.value = false;
  }
};
</script>

<template>
  <input
    v-if="editing"
    ref="inputRef"
    type="text"
    class="input input-ghost text-xl font-semibold w-full max-w-xs"
    v-model="model"
    @blur="stopEditing"
    @keydown="handleKeydown"
  />
  <button
    v-else
    class="btn btn-ghost text-xl font-semibold normal-case max-w-xs truncate"
    :title="model"
    @click="startEditing"
  >
    {{ model }}
  </button>
</template>
