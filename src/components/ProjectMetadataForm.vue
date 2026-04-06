<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import type { ProjectMetadata } from "../lib/storage/project-metadata";
import {
  GENRE_SUGGESTIONS,
  TAG_SUGGESTIONS,
  validateAuthor,
  validateDescription,
  validateGenre,
  validateProjectName,
  validateTags,
} from "../lib/storage/project-metadata";

const props = defineProps<{
  modelValue: ProjectMetadata;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: ProjectMetadata];
}>();

// ── Field updates ───────────────────────────────────────────────────────────

function update<K extends keyof ProjectMetadata>(field: K, value: ProjectMetadata[K]) {
  emit("update:modelValue", { ...props.modelValue, [field]: value });
}

// ── Tags ────────────────────────────────────────────────────────────────────

const tagInput = ref("");
const showTagSuggestions = ref(false);

const availableTagSuggestions = computed(() =>
  TAG_SUGGESTIONS.filter(
    (t) =>
      !props.modelValue.tags.includes(t) && t.toLowerCase().includes(tagInput.value.toLowerCase()),
  ),
);

function addTag(tag?: string) {
  // S-7: Reject whitespace-only input before attempting to add a tag.
  if (!tagInput.value.trim() && !tag) return;
  const value = (tag ?? tagInput.value).trim().toLowerCase();
  if (value && !props.modelValue.tags.includes(value)) {
    update("tags", [...props.modelValue.tags, value]);
  }
  tagInput.value = "";
  showTagSuggestions.value = false;
}

function removeTag(tag: string) {
  update(
    "tags",
    props.modelValue.tags.filter((t) => t !== tag),
  );
}

function handleTagKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    addTag();
  }
}

// S-6: Store the timer ID so it can be cleared on unmount.
let tagBlurTimer: ReturnType<typeof setTimeout> | undefined;

function handleTagBlur() {
  // Delay to allow click on suggestion before hiding.
  tagBlurTimer = globalThis.setTimeout(() => (showTagSuggestions.value = false), 150);
}

onUnmounted(() => {
  // S-6: Prevent the blur timer from firing after the component is gone.
  if (tagBlurTimer !== undefined) clearTimeout(tagBlurTimer);
});

// ── Validation ──────────────────────────────────────────────────────────────

const nameError = computed(() => validateProjectName(props.modelValue.name));
const authorError = computed(() => validateAuthor(props.modelValue.author));
const genreError = computed(() => validateGenre(props.modelValue.genre));
const tagsError = computed(() => validateTags(props.modelValue.tags));
const descriptionError = computed(() => validateDescription(props.modelValue.description));

// W-15: Derived validity flag — requires at minimum a non-empty name and no
// validation errors on any field.
const isValid = computed(
  () =>
    props.modelValue.name.trim().length > 0 &&
    !nameError.value &&
    !authorError.value &&
    !genreError.value &&
    !tagsError.value &&
    !descriptionError.value,
);

// Expose so parent dialogs can disable their confirm button (W-15).
defineExpose({ isValid });
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Name -->
    <fieldset class="fieldset w-full">
      <legend class="fieldset-legend font-medium">Project Name</legend>
      <input
        type="text"
        maxlength="64"
        class="input w-full"
        :class="{ 'input-error': nameError }"
        placeholder="My awesome track"
        :value="modelValue.name"
        @input="update('name', ($event.target as HTMLInputElement).value)"
      />
      <p v-if="nameError" class="fieldset-legend text-xs text-error">{{ nameError }}</p>
    </fieldset>

    <!-- Author -->
    <fieldset class="fieldset w-full">
      <legend class="fieldset-legend font-medium">Author</legend>
      <input
        type="text"
        class="input w-full"
        :class="{ 'input-error': authorError }"
        placeholder="Your name"
        :value="modelValue.author"
        @input="update('author', ($event.target as HTMLInputElement).value)"
      />
      <p v-if="authorError" class="fieldset-legend text-xs text-error">{{ authorError }}</p>
    </fieldset>

    <!-- Genre -->
    <fieldset class="fieldset w-full">
      <legend class="fieldset-legend font-medium">Genre</legend>
      <input
        type="text"
        list="genre-suggestions"
        class="input w-full"
        :class="{ 'input-error': genreError }"
        placeholder="Select or type a genre"
        :value="modelValue.genre"
        @input="update('genre', ($event.target as HTMLInputElement).value)"
      />
      <datalist id="genre-suggestions">
        <option v-for="g in GENRE_SUGGESTIONS" :key="g" :value="g" />
      </datalist>
      <p v-if="genreError" class="fieldset-legend text-xs text-error">{{ genreError }}</p>
    </fieldset>

    <!-- Tags -->
    <fieldset class="fieldset w-full">
      <legend class="fieldset-legend font-medium">Tags</legend>

      <!-- Tag badges -->
      <div
        v-if="modelValue.tags.length > 0"
        class="flex flex-wrap gap-1.5 mb-2"
      >
        <span
          v-for="tag in modelValue.tags"
          :key="tag"
          class="badge badge-primary gap-1"
        >
          {{ tag }}
          <button
            class="btn btn-ghost btn-xs px-0 min-h-0 h-auto"
            title="Remove tag"
            @click="removeTag(tag)"
          >
            <i class="iconify mdi--close size-3" />
          </button>
        </span>
      </div>

      <!-- Tag input with suggestions -->
      <div class="relative">
        <input
          type="text"
          class="input w-full"
          :class="{ 'input-error': tagsError }"
          placeholder="Type a tag and press Enter"
          v-model="tagInput"
          @keydown="handleTagKeydown"
          @focus="showTagSuggestions = true"
          @blur="handleTagBlur"
        />

        <!-- Suggestion dropdown -->
        <ul
          v-if="
            showTagSuggestions &&
            tagInput.length > 0 &&
            availableTagSuggestions.length > 0
          "
          class="menu menu-sm bg-base-300 rounded-box shadow-lg absolute z-10 w-full mt-1 max-h-40 overflow-y-auto"
        >
          <li
            v-for="suggestion in availableTagSuggestions.slice(0, 8)"
            :key="suggestion"
          >
            <a @mousedown.prevent="addTag(suggestion)">{{ suggestion }}</a>
          </li>
        </ul>
      </div>

      <p v-if="tagsError" class="fieldset-legend text-xs text-error">{{ tagsError }}</p>
    </fieldset>

    <!-- Description -->
    <fieldset class="fieldset w-full">
      <legend class="fieldset-legend font-medium">Description</legend>
      <textarea
        class="textarea w-full h-24 resize-y"
        :class="{ 'textarea-error': descriptionError }"
        placeholder="Describe your project..."
        :value="modelValue.description"
        @input="
          update('description', ($event.target as HTMLTextAreaElement).value)
        "
      />
      <p v-if="descriptionError" class="fieldset-legend text-xs text-error">{{ descriptionError }}</p>
    </fieldset>
  </div>
</template>
