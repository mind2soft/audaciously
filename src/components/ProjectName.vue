<script setup lang="ts">
import { onUpdated, ref } from "vue";

const selectedRef = ref<boolean>(false);
const projectNameRef = ref<string>("Untitled project"); // TODO: bind this to a real model
const inputRef = ref<HTMLInputElement>();

const handleSelectInput = () => {
  selectedRef.value = true;
};
const handleUnselectInput = () => {
  selectedRef.value = false;
};

onUpdated(() => {
  if (selectedRef.value && inputRef.value) {
    inputRef.value.focus();
  }
});
</script>

<template>
  <label class="ml-1 input input-ghost" v-if="selectedRef">
    <input
      ref="inputRef"
      type="input"
      required
      placeholder="Project name"
      pattern="[A-Za-z][A-Za-z0-9\-]*"
      minlength="3"
      maxlength="30"
      class="text-xl"
      v-model="projectNameRef"
      v-on:blur="handleUnselectInput"
    />
  </label>
  <button v-else class="text-xl btn btn-ghost" v-on:click="handleSelectInput">
    {{ projectNameRef }}
  </button>
</template>
