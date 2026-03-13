<script setup lang="ts">
/**
 * SequenceEffectsPanel — post-mix timeline effects (right column of Row 3).
 *
 * Wraps controls/EffectsPanel and wires it to useSequenceStore.timelineEffects.
 * The EffectsPanel emits a full replacement array on every change; this component
 * diffs old vs. new to dispatch the appropriate fine-grained store actions.
 *
 * Store connections
 * ─────────────────
 * useSequenceStore — timelineEffects, addTimelineEffect, removeTimelineEffect,
 *                    reorderTimelineEffects, setTimelineEffectValue, toggleTimelineEffect
 * useSequenceStore.totalDuration — passed as maxDuration to fade effects
 */

import { computed, ref } from "vue";
import { useSequenceStore } from "../../stores/sequence";
import type { AudioEffect, AudioEffectType } from "../../features/effects/types";
import EffectsPanel from "../controls/EffectsPanel.vue";

const sequence = useSequenceStore();

const effects = computed(() => sequence.timelineEffects);
const maxDuration = computed(() => sequence.totalDuration || undefined);

// ── Add effect dropdown (owned here so the EffectsPanel header can be hidden) ──

const ALL_EFFECT_TYPES: { type: AudioEffectType; label: string }[] = [
  { type: "gain", label: "Gain" },
  { type: "balance", label: "Balance" },
  { type: "fadeIn", label: "Fade In" },
  { type: "fadeOut", label: "Fade Out" },
];

const addDropdownOpen = ref(false);

const availableTypes = computed(() =>
  ALL_EFFECT_TYPES.filter(
    (t) => !effects.value.some((e) => e.type === t.type),
  ),
);

function addEffect(type: AudioEffectType): void {
  addDropdownOpen.value = false;
  sequence.addTimelineEffect(type);
}

/**
 * Handle full array replacement emitted by EffectsPanel.
 *
 * EffectsPanel emits on three types of mutations:
 *   1. Add — a new effect id appears that wasn't in the old list
 *   2. Remove — an old effect id is missing from the new list
 *   3. Reorder — same ids, different order
 *   4. Value change — same ids, same order, different field values
 *
 * We detect add/remove first (they're the simplest mutations), then check for
 * reorder. Value changes are applied by comparing each field individually.
 */
function onUpdateEffects(next: AudioEffect[]): void {
  const prev = sequence.timelineEffects;

  const prevIds = prev.map((e) => e.id);
  const nextIds = next.map((e) => e.id);

  // ── Detect additions ────────────────────────────────────────────────────────
  for (const effect of next) {
    if (!prevIds.includes(effect.id)) {
      sequence.addTimelineEffect(effect.type);
      return; // EffectsPanel only adds one at a time — done
    }
  }

  // ── Detect removals ────────────────────────────────────────────────────────
  for (const effect of prev) {
    if (!nextIds.includes(effect.id)) {
      sequence.removeTimelineEffect(effect.id);
      return; // EffectsPanel only removes one at a time — done
    }
  }

  // ── Detect reorder ─────────────────────────────────────────────────────────
  const reordered =
    prevIds.length === nextIds.length &&
    prevIds.some((id, i) => id !== nextIds[i]);

  if (reordered) {
    // Find what moved: locate the first position that differs, figure out
    // where the element at that position ended up.
    for (let i = 0; i < prevIds.length; i++) {
      if (prevIds[i] !== nextIds[i]) {
        const movedId = prevIds[i];
        const toIndex = nextIds.indexOf(movedId);
        sequence.reorderTimelineEffects(i, toIndex);
        return;
      }
    }
  }

  // ── Detect value changes (enabled toggle or numeric field) ─────────────────
  for (const nextEff of next) {
    const prevEff = prev.find((e) => e.id === nextEff.id);
    if (!prevEff) continue;

    // enabled toggle
    if (prevEff.enabled !== nextEff.enabled) {
      sequence.toggleTimelineEffect(nextEff.id);
    }

    // numeric fields
    for (const key of Object.keys(nextEff) as (keyof AudioEffect)[]) {
      if (key === "id" || key === "type" || key === "enabled") continue;
      const pv = (prevEff as unknown as Record<string, unknown>)[key as string];
      const nv = (nextEff as unknown as Record<string, unknown>)[key as string];
      if (typeof nv === "number" && pv !== nv) {
        sequence.setTimelineEffectValue(nextEff.id, key as string, nv);
      }
    }
  }
}
</script>

<template>
  <div class="flex flex-col h-full w-full overflow-hidden">

    <!-- ── Section header (single, combined with [+ Add] button) ──────── -->
    <div class="flex items-center justify-between px-3 py-1.5 shrink-0 bg-base-200 border-b border-base-300/60">
      <span class="text-xs font-semibold text-base-content/70 uppercase tracking-wide">
        Timeline Effects
      </span>

      <!-- [+ Add] effect dropdown -->
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

        <ul
          v-if="addDropdownOpen && availableTypes.length > 0"
          class="absolute right-0 top-full mt-1 z-50 menu menu-xs bg-base-300 border border-base-300/60 rounded-md shadow-md min-w-max"
          role="listbox"
        >
          <li v-for="t in availableTypes" :key="t.type">
            <button class="text-xs" role="option" @click="addEffect(t.type)">
              {{ t.label }}
            </button>
          </li>
        </ul>

        <div
          v-if="addDropdownOpen"
          class="fixed inset-0 z-40"
          aria-hidden="true"
          @click="addDropdownOpen = false"
        />
      </div>
    </div>

    <!-- ── Effects panel (scrollable) — header suppressed since we own it ── -->
    <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <EffectsPanel
        :effects="effects"
        :maxDuration="maxDuration"
        :showHeader="false"
        @update:effects="onUpdateEffects"
      />
    </div>

  </div>
</template>
