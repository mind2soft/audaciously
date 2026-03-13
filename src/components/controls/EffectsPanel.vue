<script setup lang="ts">
/**
 * EffectsPanel — sortable ordered list of audio effects with an [+ Add] dropdown.
 *
 * Rules (from 05-audio-effects.md):
 *   - Each effect type may appear at most once in the chain.
 *   - The [+ Add] dropdown only shows types not already present.
 *   - Effects can be reordered by dragging the ⣿ handle.
 *   - Individual effect panels emit update:effect and remove.
 *
 * Props
 * ─────
 * effects       Ordered list of AudioEffect objects.
 * maxDuration   Optional: total audio duration (seconds) passed to fade effects.
 *
 * Emits
 * ─────
 * update:effects   Full updated array whenever any effect changes or list mutates.
 *
 * @example
 * <EffectsPanel :effects="node.effects" :maxDuration="node.buffer?.duration"
 *               @update:effects="store.setNodeEffects(node.id, $event)" />
 */

import { computed, ref } from "vue";
import type {
  AudioEffect,
  AudioEffectType,
  GainEffect,
  BalanceEffect,
  FadeInEffect,
  FadeOutEffect,
} from "../../features/effects/types";
import {
  createGainEffect,
  createBalanceEffect,
  createFadeInEffect,
  createFadeOutEffect,
} from "../../features/effects";
import EffectGain from "./EffectGain.vue";
import EffectBalance from "./EffectBalance.vue";
import EffectFadeIn from "./EffectFadeIn.vue";
import EffectFadeOut from "./EffectFadeOut.vue";

const props = withDefaults(
  defineProps<{
    effects: AudioEffect[];
    maxDuration?: number;
    /** Set to false when the parent already renders its own section header. */
    showHeader?: boolean;
  }>(),
  {
    showHeader: true,
  },
);

const emit = defineEmits<{
  "update:effects": [effects: AudioEffect[]];
}>();

// ── Add dropdown ─────────────────────────────────────────────────────────────

const ALL_EFFECT_TYPES: { type: AudioEffectType; label: string }[] = [
  { type: "gain", label: "Gain" },
  { type: "balance", label: "Balance" },
  { type: "fadeIn", label: "Fade In" },
  { type: "fadeOut", label: "Fade Out" },
];

/** Only show types not already present in the chain. */
const availableTypes = computed(() =>
  ALL_EFFECT_TYPES.filter(
    (t) => !props.effects.some((e) => e.type === t.type),
  ),
);

const addDropdownOpen = ref(false);

const addEffect = (type: AudioEffectType) => {
  addDropdownOpen.value = false;
  let newEffect: AudioEffect;
  switch (type) {
    case "gain":    newEffect = createGainEffect();    break;
    case "balance": newEffect = createBalanceEffect(); break;
    case "fadeIn":  newEffect = createFadeInEffect();  break;
    case "fadeOut": newEffect = createFadeOutEffect(); break;
  }
  emit("update:effects", [...props.effects, newEffect]);
};

// ── Update / Remove individual effects ───────────────────────────────────────

const onUpdateEffect = (index: number, updated: AudioEffect) => {
  const next = [...props.effects];
  next[index] = updated;
  emit("update:effects", next);
};

const onRemoveEffect = (index: number) => {
  const next = [...props.effects];
  next.splice(index, 1);
  emit("update:effects", next);
};

// ── Drag-to-sort ─────────────────────────────────────────────────────────────

const draggingIndex = ref<number | null>(null);

const onDragstart = (index: number, evt: DragEvent) => {
  draggingIndex.value = index;
  evt.dataTransfer?.setData("text/plain", String(index));
};

const onDragover = (evt: DragEvent) => {
  evt.preventDefault(); // allow drop
};

const onDrop = (targetIndex: number, evt: DragEvent) => {
  evt.preventDefault();
  if (draggingIndex.value === null || draggingIndex.value === targetIndex) return;

  const next = [...props.effects];
  const [moved] = next.splice(draggingIndex.value, 1);
  next.splice(targetIndex, 0, moved);
  draggingIndex.value = null;
  emit("update:effects", next);
};

const onDragend = () => {
  draggingIndex.value = null;
};
</script>

<template>
  <div class="flex flex-col gap-0 w-full">
    <!-- ── Header ──────────────────────────────────────────────────────────── -->
    <!-- Hidden entirely when the parent renders its own section header
         (showHeader=false), since the parent also owns the [+ Add] button. -->
    <div
      v-if="showHeader"
      class="flex items-center justify-between px-2 py-1 bg-base-200 border-b border-base-300/60"
    >
      <span class="text-xs font-semibold text-base-content/70 uppercase tracking-wide">
        Effects
      </span>

      <!-- [+ Add] dropdown -->
      <div class="relative">
        <button
          class="btn btn-xs btn-ghost gap-1"
          :disabled="availableTypes.length === 0"
          :aria-disabled="availableTypes.length === 0"
          aria-haspopup="listbox"
          :aria-expanded="addDropdownOpen"
          @click="addDropdownOpen = !addDropdownOpen"
        >
          <i class="iconify mdi--plus size-3" aria-hidden="true" />
          Add
          <i class="iconify mdi--chevron-down size-3" aria-hidden="true" />
        </button>

        <!-- Dropdown menu -->
        <ul
          v-if="addDropdownOpen && availableTypes.length > 0"
          class="absolute right-0 top-full mt-1 z-50 menu menu-xs bg-base-300 border border-base-300/60 rounded-md shadow-md min-w-max"
          role="listbox"
        >
          <li v-for="t in availableTypes" :key="t.type">
            <button
              class="text-xs"
              role="option"
              @click="addEffect(t.type)"
            >
              {{ t.label }}
            </button>
          </li>
        </ul>

        <!-- Click-away to close -->
        <div
          v-if="addDropdownOpen"
          class="fixed inset-0 z-40"
          @click="addDropdownOpen = false"
          aria-hidden="true"
        />
      </div>
    </div>

    <!-- ── Effect list ─────────────────────────────────────────────────────── -->
    <div
      v-if="effects.length === 0"
      class="px-3 py-4 text-xs text-base-content/40 text-center"
    >
      No effects. Click [+ Add] to add one.
    </div>

    <div
      v-for="(effect, index) in effects"
      :key="effect.id"
      class="border-b border-base-300/40 last:border-0"
      :class="draggingIndex === index ? 'opacity-40' : ''"
      draggable="true"
      @dragstart="onDragstart(index, $event)"
      @dragover="onDragover"
      @drop="onDrop(index, $event)"
      @dragend="onDragend"
    >
      <!-- Drag handle row wrapper -->
      <div class="flex items-start gap-1 pr-1">
        <!-- ⣿ drag handle -->
        <div
          class="flex items-center justify-center w-5 pt-2 shrink-0 text-base-content/30 cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
          aria-hidden="true"
        >
          <i class="iconify mdi--drag-vertical size-4" />
        </div>

        <!-- Effect panel -->
        <div class="flex-1 min-w-0">
          <EffectGain
            v-if="effect.type === 'gain'"
            :effect="(effect as GainEffect)"
            @update:effect="onUpdateEffect(index, $event)"
            @remove="onRemoveEffect(index)"
          />
          <EffectBalance
            v-else-if="effect.type === 'balance'"
            :effect="(effect as BalanceEffect)"
            @update:effect="onUpdateEffect(index, $event)"
            @remove="onRemoveEffect(index)"
          />
          <EffectFadeIn
            v-else-if="effect.type === 'fadeIn'"
            :effect="(effect as FadeInEffect)"
            :maxDuration="maxDuration ?? 0"
            @update:effect="onUpdateEffect(index, $event)"
            @remove="onRemoveEffect(index)"
          />
          <EffectFadeOut
            v-else-if="effect.type === 'fadeOut'"
            :effect="(effect as FadeOutEffect)"
            :maxDuration="maxDuration ?? 0"
            @update:effect="onUpdateEffect(index, $event)"
            @remove="onRemoveEffect(index)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
