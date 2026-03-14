<script lang="ts">
/**
 * ButtonGroupItem — shape of each item in a {@link ButtonGroup}.
 * Exported as a named export so callers can build typed item arrays.
 */
export interface ButtonGroupItem {
  id: string;
  /** Short display text shown in the compact dropdown list. */
  label: string;
  /** Tooltip text shown on hover (may be longer / more descriptive than label). */
  title: string;
  /** MDI icon name without the "mdi--" prefix, e.g. "pencil-outline". */
  icon?: string;
  /** Text/glyph shown when no MDI icon is available (e.g. note fractions). */
  glyph?: string;
  /** Active CSS class override — defaults to "btn-primary". */
  activeClass?: string;
  /** Disables the item when true. */
  disabled?: boolean;
}
</script>

<script setup lang="ts">
/**
 * ButtonGroup — renders a mutually-exclusive set of buttons.
 *
 * inline  (default) — each item is a `btn btn-xs` showing icon/glyph + tooltip.
 * compact           — a drop-up shows only the active item as trigger; the panel
 *                     lists all items with icon/glyph + label + tooltip.
 *
 * Props
 * ─────
 * items          Array of ButtonGroupItem definitions.
 * modelValue     ID of the currently active item (v-model).
 * compact        When true, renders as a drop-up. Default false.
 * dropdownAlign  Horizontal alignment of the compact drop-up: "start" (default) or "end".
 *
 * Emits
 * ─────
 * update:modelValue  ID of the item the user selected.
 */
import { ref, computed, onUnmounted } from "vue";

const props = withDefaults(
  defineProps<{
    items: ButtonGroupItem[];
    modelValue: string;
    /** When true, renders as a drop-up instead of an inline row. */
    compact?: boolean;
    /** Horizontal alignment of the compact drop-up. Defaults to "start". */
    dropdownAlign?: "start" | "end";
  }>(),
  { compact: false, dropdownAlign: "start" },
);

const emit = defineEmits<{
  "update:modelValue": [id: string];
}>();

// ── Helpers ───────────────────────────────────────────────────────────────────

const activeItem = computed(
  () => props.items.find((it) => it.id === props.modelValue) ?? props.items[0],
);

function activeClassFor(item: ButtonGroupItem): string {
  return item.activeClass ?? "btn-primary";
}

// ── Compact dropdown ──────────────────────────────────────────────────────────

const detailsRef = ref<HTMLDetailsElement | null>(null);

function onDocumentClick(e: MouseEvent): void {
  if (detailsRef.value && !detailsRef.value.contains(e.target as Node)) {
    detailsRef.value.open = false;
  }
}

/**
 * Called by the native `toggle` event whenever the `<details>` opens or closes.
 * Adds a document-level click listener (deferred past the opening click via
 * setTimeout) when the panel opens, and removes it when it closes.
 */
function onDetailsToggle(): void {
  if (detailsRef.value?.open) {
    // Defer so the click that just opened the panel doesn't immediately close it.
    setTimeout(() => document.addEventListener("click", onDocumentClick), 0);
  } else {
    document.removeEventListener("click", onDocumentClick);
  }
}

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
});

function select(id: string): void {
  emit("update:modelValue", id);
  if (detailsRef.value) detailsRef.value.open = false;
}
</script>

<template>
  <!-- ── Inline mode ──────────────────────────────────────────────────────── -->
  <div v-if="!compact" class="flex gap-1" role="group">
    <button
      v-for="item in items"
      :key="item.id"
      class="btn btn-xs w-8"
      :class="modelValue === item.id ? activeClassFor(item) : 'btn-ghost'"
      :title="item.title"
      :disabled="item.disabled"
      @click="select(item.id)"
    >
      <i
        v-if="item.icon"
        :class="`iconify mdi--${item.icon} size-4`"
        aria-hidden="true"
      />
      <span v-else-if="item.glyph" class="text-lg">{{ item.glyph }}</span>
    </button>
  </div>

  <!-- ── Compact / drop-up mode ───────────────────────────────────────────── -->
  <details
    v-else
    ref="detailsRef"
    class="dropdown dropdown-top"
    :class="{ 'dropdown-end': dropdownAlign === 'end' }"
    @toggle="onDetailsToggle"
  >
    <summary
      class="btn btn-xs btn-ghost [&::marker]:hidden [&::-webkit-details-marker]:hidden"
      :title="activeItem.title"
    >
      <i
        v-if="activeItem.icon"
        :class="`iconify mdi--${activeItem.icon} size-4`"
        aria-hidden="true"
      />
      <span v-else-if="activeItem.glyph" class="text-lg">{{
        activeItem.glyph
      }}</span>
      <i class="iconify mdi--chevron-up size-4" aria-hidden="true" />
    </summary>

    <ul
      class="dropdown-content menu menu-xs bg-base-200 border border-base-300/60 rounded-box z-10 p-1 shadow-md min-w-max mb-1"
      role="menu"
    >
      <li v-for="item in items" :key="item.id" role="none">
        <button
          class="btn btn-xs w-full justify-start gap-2 font-normal"
          :class="modelValue === item.id ? activeClassFor(item) : 'btn-ghost'"
          :disabled="item.disabled"
          :title="item.title"
          role="menuitem"
          @click="select(item.id)"
        >
          <i
            v-if="item.icon"
            :class="`iconify mdi--${item.icon} size-4`"
            aria-hidden="true"
          />
          <span
            v-else-if="item.glyph"
            class="w-4 text-lg text-center leading-none"
            >{{ item.glyph }}</span
          >
          <span>{{ item.label }}</span>
        </button>
      </li>
    </ul>
  </details>
</template>
