<script setup lang="ts">
/**
 * EffectVolume — panel for a VolumeEffect.
 *
 * Layout (top to bottom):
 *   1. SVG canvas — envelope curve with playhead cursor
 *   2. Navigation row — Steps  [◀]  [+ Add / − Remove]  [▶]
 *   3. Properties table — Step (read-only), Volume, Transition
 *
 * Props
 * ─────
 * effect       The VolumeEffect to edit.
 * currentTime  Optional playhead position in seconds (used for add/remove).
 * duration     Optional total clip/timeline duration in seconds (sets SVG right edge).
 *
 * Emits
 * ─────
 * update:effect  Full replacement whenever the effect changes.
 */
import { computed, ref, watch } from "vue";
import type { VolumeEffect, VolumeKeyframe, VolumeTransition } from "../../features/effects/types";

// ── Props & emits ──────────────────────────────────────────────────────────────

const props = defineProps<{
  effect: VolumeEffect;
  currentTime?: number;
  duration?: number;
}>();

const emit = defineEmits<{
  "update:effect": [effect: VolumeEffect];
}>();

// ── Derived: sorted keyframes ──────────────────────────────────────────────────

const sorted = computed((): VolumeKeyframe[] =>
  [...props.effect.keyframes].sort((a, b) => a.time - b.time),
);

// ── SVG view range ─────────────────────────────────────────────────────────────

/**
 * The rightmost time shown on the SVG.
 * Always at least 5 s, extends to clip duration / last keyframe / playhead.
 */
const viewMax = computed((): number => {
  const lastKfTime = sorted.value.at(-1)?.time ?? 0;
  return Math.max(props.duration ?? 0, lastKfTime + 1, (props.currentTime ?? 0) + 0.5, 5);
});

// ── Selected step index ────────────────────────────────────────────────────────

const selectedIndex = ref(0);

/** Clamped so it stays in bounds when keyframes are removed. */
const clampedIndex = computed((): number =>
  Math.min(selectedIndex.value, Math.max(0, sorted.value.length - 1)),
);

/** Reset selection to step 0 when a different VolumeEffect is shown. */
watch(
  () => props.effect.id,
  () => {
    selectedIndex.value = 0;
  },
);

const selectedKeyframe = computed(
  (): VolumeKeyframe | null => sorted.value[clampedIndex.value] ?? null,
);

// ── Playhead step detection ────────────────────────────────────────────────────

/** Snapping threshold in seconds: ≤ 50 ms counts as "on a step". */
const SNAP_S = 0.05;

/** The existing keyframe that the playhead is currently sitting on, or null. */
const stepAtPlayhead = computed((): VolumeKeyframe | null => {
  if (props.currentTime === undefined) return null;
  return sorted.value.find((kf) => Math.abs(kf.time - props.currentTime!) <= SNAP_S) ?? null;
});

/** Show the "Add" button when the playhead is NOT on an existing step. */
const canAddAtPlayhead = computed(
  (): boolean => props.currentTime !== undefined && stepAtPlayhead.value === null,
);

/** "Remove" is only valid for a non-zero step at the playhead. */
const canRemoveAtPlayhead = computed(
  (): boolean => stepAtPlayhead.value !== null && stepAtPlayhead.value.time > 0,
);

// ── Navigation ────────────────────────────────────────────────────────────────

function prevStep(): void {
  if (clampedIndex.value > 0) selectedIndex.value = clampedIndex.value - 1;
}

function nextStep(): void {
  if (clampedIndex.value < sorted.value.length - 1) selectedIndex.value = clampedIndex.value + 1;
}

// ── Add / Remove at playhead ──────────────────────────────────────────────────

function addStep(): void {
  const ct = props.currentTime ?? 0;
  const value = interpolateValue(sorted.value, ct);
  const newKf: VolumeKeyframe = { time: ct, value, curve: "linear" };
  const updated = [...props.effect.keyframes, newKf].sort((a, b) => a.time - b.time);
  emit("update:effect", { ...props.effect, keyframes: updated });
  selectedIndex.value = updated.findIndex((kf) => kf.time === ct);
}

function removeStep(): void {
  const step = stepAtPlayhead.value;
  if (!step || step.time <= 0) return;
  const updated = props.effect.keyframes.filter((kf) => Math.abs(kf.time - step.time) > SNAP_S);
  emit("update:effect", { ...props.effect, keyframes: updated });
  selectedIndex.value = Math.min(clampedIndex.value, Math.max(0, updated.length - 1));
}

/** Linear interpolation of the envelope value at time t (for add-step default). */
function interpolateValue(kfs: VolumeKeyframe[], t: number): number {
  if (kfs.length === 0) return 1;
  if (t <= kfs[0].time) return kfs[0].value;
  for (let i = 0; i < kfs.length - 1; i++) {
    if (t >= kfs[i].time && t <= kfs[i + 1].time) {
      const ratio = (t - kfs[i].time) / (kfs[i + 1].time - kfs[i].time);
      return kfs[i].value + ratio * (kfs[i + 1].value - kfs[i].value);
    }
  }
  return kfs[kfs.length - 1].value;
}

// ── Property editing ──────────────────────────────────────────────────────────

function updateSelectedValue(evt: Event): void {
  const raw = (evt.target as HTMLInputElement).valueAsNumber;
  const value = Math.min(2, Math.max(0, Number.isNaN(raw) ? 1 : raw));
  patchSelected({ value });
}

function updateSelectedCurve(evt: Event): void {
  const curve = (evt.target as HTMLSelectElement).value as VolumeTransition;
  patchSelected({ curve });
}

/** Apply a partial update to the currently selected keyframe (matched by time). */
function patchSelected(patch: Partial<VolumeKeyframe>): void {
  const kf = sorted.value[clampedIndex.value];
  if (!kf) return;
  const updated = props.effect.keyframes.map((k) => (k.time === kf.time ? { ...k, ...patch } : k));
  emit("update:effect", { ...props.effect, keyframes: updated });
}

// ── SVG ───────────────────────────────────────────────────────────────────────

const SVG_WIDTH = 300;
const SVG_HEIGHT = 48;
const PADDING_X = 10;
const PADDING_Y = 8;

function timeToX(t: number): number {
  return PADDING_X + (t / viewMax.value) * (SVG_WIDTH - PADDING_X * 2);
}

function valueToY(v: number): number {
  return PADDING_Y + (1 - v / 2) * (SVG_HEIGHT - PADDING_Y * 2);
}

/**
 * Envelope polyline: sorted keyframes + horizontal hold-line to viewMax.
 * The last keyframe's value is held constant until the right edge.
 */
const envelopePoints = computed((): string => {
  const kfs = sorted.value;
  const last = kfs.at(-1) ?? { time: 0, value: 1 };
  const pts = kfs.map((kf) => `${timeToX(kf.time)},${valueToY(kf.value)}`);
  pts.push(`${timeToX(viewMax.value)},${valueToY(last.value)}`);
  return pts.join(" ");
});

/** Polygon fill under the envelope. */
const fillPoints = computed((): string => {
  const kfs = sorted.value;
  const last = kfs.at(-1) ?? { time: 0, value: 1 };
  const baseline = SVG_HEIGHT - PADDING_Y;
  return [
    `${timeToX(0)},${baseline}`,
    ...kfs.map((kf) => `${timeToX(kf.time)},${valueToY(kf.value)}`),
    `${timeToX(viewMax.value)},${valueToY(last.value)}`,
    `${timeToX(viewMax.value)},${baseline}`,
  ].join(" ");
});

/** X position of the playhead cursor, or null when no currentTime is provided. */
const playheadX = computed((): number | null => {
  if (props.currentTime === undefined) return null;
  return timeToX(Math.min(props.currentTime, viewMax.value));
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

const CURVE_OPTIONS: { value: VolumeTransition; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "ease-in", label: "Ease In" },
  { value: "ease-out", label: "Ease Out" },
  { value: "ease-in-out", label: "Ease In/Out" },
];
</script>

<template>
  <div
    class="flex flex-col gap-2 px-2 py-1.5 text-xs"
    :class="effect.enabled ? '' : 'opacity-50 pointer-events-none'"
  >
    <!-- ── 1. SVG canvas ──────────────────────────────────────────────────── -->
    <div class="bg-base-300 rounded overflow-hidden">
      <svg
        :width="SVG_WIDTH"
        :height="SVG_HEIGHT"
        class="w-full"
        :viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
        preserveAspectRatio="none"
        :aria-label="`Volume automation with ${sorted.length} step${sorted.length === 1 ? '' : 's'}`"
      >
        <!-- Unity gain reference (dashed) -->
        <line
          :x1="PADDING_X"
          :y1="valueToY(1)"
          :x2="SVG_WIDTH - PADDING_X"
          :y2="valueToY(1)"
          stroke="currentColor"
          stroke-width="0.5"
          stroke-dasharray="3,3"
          class="text-base-content/20"
        />

        <!-- Fill under envelope -->
        <polygon :points="fillPoints" fill="currentColor" class="text-primary/10" />

        <!-- Envelope polyline (with hold-value extension) -->
        <polyline
          :points="envelopePoints"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="text-primary/70"
        />

        <!-- Playhead cursor -->
        <line
          v-if="playheadX !== null"
          :x1="playheadX"
          :y1="PADDING_Y / 2"
          :x2="playheadX"
          :y2="SVG_HEIGHT - PADDING_Y / 2"
          stroke="currentColor"
          stroke-width="1"
          stroke-dasharray="2,2"
          class="text-warning/70"
        />

        <!-- Step dots -->
        <circle
          v-for="(kf, i) in sorted"
          :key="i"
          :cx="timeToX(kf.time)"
          :cy="valueToY(kf.value)"
          :r="clampedIndex === i ? 4.5 : 3.5"
          fill="currentColor"
          :class="[
            clampedIndex === i ? 'text-primary' : 'text-base-content/50',
            kf.time === 0
              ? 'cursor-default'
              : 'cursor-pointer hover:text-primary transition-colors',
          ]"
          @click.stop="selectedIndex = i"
        />

        <!-- Time labels -->
        <text
          :x="PADDING_X"
          :y="SVG_HEIGHT - 1"
          font-size="7"
          fill="currentColor"
          class="text-base-content/30"
          >0s</text
        >
        <text
          :x="SVG_WIDTH - PADDING_X - 18"
          :y="SVG_HEIGHT - 1"
          font-size="7"
          fill="currentColor"
          class="text-base-content/30"
          >{{ formatTime(viewMax) }}</text
        >
      </svg>
    </div>

    <!-- ── 2. Navigation ──────────────────────────────────────────────────── -->
    <div class="flex items-center gap-1">
      <span class="text-[10px] font-medium text-base-content/50 shrink-0">Steps</span>
      <span class="flex-1" />

      <!-- Prev -->
      <button
        class="btn btn-xs btn-ghost min-h-0 h-6 w-6 p-0"
        title="Previous step"
        :disabled="clampedIndex <= 0"
        @click="prevStep"
      >
        <i class="iconify mdi--chevron-left size-3" aria-hidden="true" />
      </button>

      <!-- Add step at playhead -->
      <button
        v-if="canAddAtPlayhead"
        class="btn btn-xs btn-ghost gap-0.5 min-h-0 h-6 px-1.5"
        title="Add step at playhead"
        @click="addStep"
      >
        <i class="iconify mdi--plus size-3" aria-hidden="true" />
        Add
      </button>

      <!-- Remove step at playhead (or placeholder when no currentTime) -->
      <button
        v-else
        class="btn btn-xs btn-ghost gap-0.5 min-h-0 h-6 px-1.5"
        title="Remove step at playhead"
        :disabled="!canRemoveAtPlayhead"
        @click="removeStep"
      >
        <i class="iconify mdi--minus size-3" aria-hidden="true" />
        Remove
      </button>

      <!-- Next -->
      <button
        class="btn btn-xs btn-ghost min-h-0 h-6 w-6 p-0"
        title="Next step"
        :disabled="clampedIndex >= sorted.length - 1"
        @click="nextStep"
      >
        <i class="iconify mdi--chevron-right size-3" aria-hidden="true" />
      </button>
    </div>

    <!-- ── 3. Properties table ────────────────────────────────────────────── -->
    <table v-if="selectedKeyframe" class="w-full text-xs border-separate border-spacing-y-0.5">
      <tbody>
        <!-- Step — read-only position indicator -->
        <tr>
          <td class="text-base-content/50 pr-3 whitespace-nowrap py-0.5 w-16">Step</td>
          <td class="font-mono tabular-nums text-right py-0.5 text-base-content/70">
            {{ clampedIndex + 1 }}&thinsp;/&thinsp;{{ sorted.length }}&ensp;&middot;&ensp;{{ formatTime(selectedKeyframe.time) }}
          </td>
        </tr>

        <!-- Volume -->
        <tr>
          <td class="text-base-content/50 pr-3 whitespace-nowrap py-0.5">Volume</td>
          <td class="py-0.5">
            <input
              type="number"
              min="0"
              max="2"
              step="0.01"
              :value="selectedKeyframe.value.toFixed(2)"
              class="input input-xs w-full font-mono tabular-nums text-right"
              aria-label="Volume level (0 – 2)"
              @change="updateSelectedValue"
            />
          </td>
        </tr>

        <!-- Transition -->
        <tr>
          <td class="text-base-content/50 pr-3 whitespace-nowrap py-0.5">Transition</td>
          <td class="py-0.5">
            <select
              :value="selectedKeyframe.curve"
              class="select select-xs w-full"
              aria-label="Transition curve to next step"
              @change="updateSelectedCurve"
            >
              <option
                v-for="opt in CURVE_OPTIONS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Hint when no playhead is wired -->
    <p v-if="currentTime === undefined" class="text-[10px] text-base-content/30 italic">
      Move the playhead to add or remove steps.
    </p>
  </div>
</template>
