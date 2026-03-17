<script setup lang="ts">
/**
 * ProjectName — inline editable project name field.
 *
 * Migrated from src/components/ProjectName.vue. No inject() usage.
 *
 * The component is self-sizing: it grows to fit the current name using a
 * CSS-grid ghost-span technique.  An invisible <span> holding the current
 * value drives the container width; the <input> overlays it in the same
 * grid cell so it always matches.
 *
 * Props / Model
 * ─────────────
 * modelValue  The project name string (v-model).
 *
 * Emits
 * ─────
 * update:modelValue  When the user commits a new name.
 *
 * @example
 * <ProjectName v-model="projectName" />
 */

import { nextTick, ref } from "vue";

const model = defineModel<string>({ default: "Untitled Project" });

const editing = ref(false);
const inputRef = ref<HTMLInputElement>();
const originalValue = ref("");

const startEditing = async () => {
  originalValue.value = model.value;
  editing.value = true;
  await nextTick();
  inputRef.value?.select();
};

const commitEdit = () => {
  if (!model.value.trim()) {
    model.value = originalValue.value || "Untitled Project";
  }
  editing.value = false;
};

const cancelEdit = () => {
  model.value = originalValue.value;
  editing.value = false;
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter") commitEdit();
  if (e.key === "Escape") cancelEdit();
};
</script>

<template>
  <!--
    Outer wrapper: inline-grid so the component is content-sized (not
    stretched by the parent flex container).  Both the ghost span and the
    input/button share the same single grid cell so they stack and the
    visible element always has the width of the content.
  -->
  <div class="inline-grid">
    <!--
      Ghost span — invisible, sits in the grid cell and sets the width.
      Font, size, and padding must match both the button and the input
      exactly so the sizing is accurate.
      Minimum width keeps the field usable when the name is very short.
    -->
    <span
      class="invisible col-start-1 row-start-1 whitespace-pre text-xl font-semibold px-3 min-w-24 pointer-events-none select-none"
      aria-hidden="true"
      >{{ model || "Untitled Project" }}</span
    >

    <!-- Editing state: input overlays the ghost span -->
    <input
      v-if="editing"
      ref="inputRef"
      type="text"
      maxlength="64"
      class="col-start-1 row-start-1 input input-ghost text-xl font-semibold w-full text-left"
      v-model="model"
      @blur="commitEdit"
      @keydown="handleKeydown"
    />

    <!-- Display state: button overlays the ghost span -->
    <button
      v-else
      class="col-start-1 row-start-1 btn btn-ghost text-xl font-semibold normal-case w-full text-left justify-start"
      :title="model"
      @click="startEditing"
    >
      {{ model }}
    </button>
  </div>
</template>
