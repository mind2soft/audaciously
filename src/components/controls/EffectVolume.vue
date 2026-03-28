<script setup lang="ts">
/**
 * EffectVolume — panel for a VolumeEffect.
 *
 * Layout (top to bottom):
 *   1. SVG canvas — envelope curve with seekable playhead cursor
 *   2. Navigation row — Steps  [◀]  [+ Add / − Remove]  [▶]
 *   3. Properties table — Step (read-only), Volume, Transition
 *
 * Props
 * ─────
 * effect    The VolumeEffect to edit.
 * duration  Optional total clip/timeline duration in seconds (sets SVG right edge).
 *
 * Emits
 * ─────
 * update:effect  Full replacement whenever the effect changes.
 *
 * Playback time is obtained via inject(PlaybackContextKey) — the nearest
 * ancestor (RecordedNodeProperties or SequenceEffectsPanel) provides either
 * useNodePlayback or usePlayerStore under the same interface.
 */
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";
import { nullPlaybackContext, PlaybackContextKey } from "../../composables/usePlaybackContext";
import type { VolumeEffect, VolumeKeyframe, VolumeTransition } from "../../features/effects/types";

// ── Props & emits ──────────────────────────────────────────────────────────────

const props = defineProps<{
  effect: VolumeEffect;
  duration?: number;
}>();

const emit = defineEmits<{
  "update:effect": [effect: VolumeEffect];
}>();

const { currentTime, seek } = inject(PlaybackContextKey, nullPlaybackContext);

// ── Responsive SVG width ──────────────────────────────────────────────────────

const svgRef = ref<SVGSVGElement | null>(null);
const svgWidth = ref(300);
let _resizeObs: ResizeObserver | null = null;

onMounted(() => {
  if (!svgRef.value) return;
  _resizeObs = new ResizeObserver(([entry]) => {
    const w = entry.contentRect.width;
    if (w > 0) svgWidth.value = w;
  });
  _resizeObs.observe(svgRef.value);
});

onUnmounted(() => {
  _resizeObs?.disconnect();
  _resizeObs = null;
});

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
  return Math.max(props.duration ?? 0, lastKfTime + 1, currentTime.value + 0.5, 5);
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
  return sorted.value.find((kf) => Math.abs(kf.time - currentTime.value) <= SNAP_S) ?? null;
});

/** Show the "Add" button when the playhead is NOT on an existing step. */
const canAddAtPlayhead = computed((): boolean => stepAtPlayhead.value === null);

/** "Remove" is only valid for a non-zero step at the playhead. */
const canRemoveAtPlayhead = computed(
  (): boolean => stepAtPlayhead.value !== null && stepAtPlayhead.value.time > 0,
);

// ── Navigation ────────────────────────────────────────────────────────────────

function prevStep(): void {
  if (clampedIndex.value > 0) {
    const newIndex = clampedIndex.value - 1;
    selectedIndex.value = newIndex;
    seek(sorted.value[newIndex].time);
  }
}

function nextStep(): void {
  if (clampedIndex.value < sorted.value.length - 1) {
    const newIndex = clampedIndex.value + 1;
    selectedIndex.value = newIndex;
    seek(sorted.value[newIndex].time);
  }
}

/** Seek to time and auto-select the step at that time if one exists. */
function seekToTime(t: number): void {
  seek(t);
  const idx = sorted.value.findIndex((kf) => Math.abs(kf.time - t) <= SNAP_S);
  if (idx !== -1) selectedIndex.value = idx;
}

// ── Add / Remove at playhead ──────────────────────────────────────────────────

function addStep(): void {
  const ct = currentTime.value;
  const value = interpolateValue(sorted.value, ct);
  const newKf: VolumeKeyframe = { time: ct, value, curve: "linear" };
  const updated = [...props.effect.keyframes, newKf].sort((a, b) => a.time - b.time);
  emit("update:effect", { ...props.effect, keyframes: updated });
  selectedIndex.value = updated.findIndex((kf) => Math.abs(kf.time - ct) <= SNAP_S);
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
  const updated = props.effect.keyframes.map((k) =>
    Math.abs(k.time - kf.time) <= SNAP_S ? { ...k, ...patch } : k,
  );
  emit("update:effect", { ...props.effect, keyframes: updated });
}

// ── SVG ───────────────────────────────────────────────────────────────────────

const SVG_HEIGHT = 64;
const PADDING_X = 10;
const PADDING_Y = 8;

function timeToX(t: number): number {
  return PADDING_X + (t / viewMax.value) * (svgWidth.value - PADDING_X * 2);
}

function valueToY(v: number): number {
  return PADDING_Y + (1 - v / 2) * (SVG_HEIGHT - PADDING_Y * 2);
}

/**
 * CSS-standard cubic bezier control-point ratios for each transition curve.
 * Maps to cubic-bezier(p1x, p1y, p2x, p2y) as used in CSS easing functions.
 * For a segment A→B: C1=(ax+p1x·dx, ay+p1y·dy), C2=(ax+p2x·dx, ay+p2y·dy).
 */
const CURVE_CP: Record<VolumeTransition, [number, number, number, number]> = {
  linear: [0, 0, 1, 1], // Required by Record type — linear uses L command, not C
  "ease-in": [0.42, 0, 1.0, 1.0],
  "ease-out": [0.0, 0.0, 0.58, 1.0],
  "ease-in-out": [0.42, 0, 0.58, 1.0],
};

/** SVG path for the envelope stroke, using bezier curves per keyframe transition. */
const envelopePath = computed((): string => {
  const kfs = sorted.value;
  if (kfs.length === 0) return "";
  const last = kfs[kfs.length - 1];
  let d = `M ${timeToX(kfs[0].time)},${valueToY(kfs[0].value)}`;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    const ax = timeToX(a.time),
      ay = valueToY(a.value);
    const bx = timeToX(b.time),
      by = valueToY(b.value);
    const dx = bx - ax,
      dy = by - ay;
    if (a.curve === "linear") {
      d += ` L ${bx},${by}`;
    } else {
      const [p1x, p1y, p2x, p2y] = CURVE_CP[a.curve];
      d += ` C ${ax + p1x * dx},${ay + p1y * dy} ${ax + p2x * dx},${ay + p2y * dy} ${bx},${by}`;
    }
  }
  d += ` L ${timeToX(viewMax.value)},${valueToY(last.value)}`;
  return d;
});

/** SVG path for the filled area under the envelope. */
const fillPath = computed((): string => {
  const kfs = sorted.value;
  if (kfs.length === 0) return "";
  const last = kfs[kfs.length - 1];
  const baseY = SVG_HEIGHT - PADDING_Y;
  const startX = timeToX(kfs[0].time);
  let d = `M ${startX},${baseY} L ${startX},${valueToY(kfs[0].value)}`;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    const ax = timeToX(a.time),
      ay = valueToY(a.value);
    const bx = timeToX(b.time),
      by = valueToY(b.value);
    const dx = bx - ax,
      dy = by - ay;
    if (a.curve === "linear") {
      d += ` L ${bx},${by}`;
    } else {
      const [p1x, p1y, p2x, p2y] = CURVE_CP[a.curve];
      d += ` C ${ax + p1x * dx},${ay + p1y * dy} ${ax + p2x * dx},${ay + p2y * dy} ${bx},${by}`;
    }
  }
  const holdX = timeToX(viewMax.value);
  d += ` L ${holdX},${valueToY(last.value)} L ${holdX},${baseY} Z`;
  return d;
});

/** X position of the playhead cursor. */
const playheadX = computed((): number => timeToX(Math.min(currentTime.value, viewMax.value)));

// ── SVG seek on click ─────────────────────────────────────────────────────────

/**
 * Clicking anywhere on the SVG canvas seeks the playback cursor to that time.
 * Individual step-dot clicks stop propagation so they don't also seek.
 */
function handleSvgClick(evt: MouseEvent): void {
  const rect = (evt.currentTarget as SVGSVGElement).getBoundingClientRect();
  const ratio = Math.max(
    0,
    Math.min(1, (evt.clientX - rect.left - PADDING_X) / (svgWidth.value - PADDING_X * 2)),
  );
  seekToTime(ratio * viewMax.value);
}

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
    :class="effect.enabled ? '' : 'opacity-50'"
    :inert="!effect.enabled"
    :aria-disabled="!effect.enabled"
  >
    <!-- ── 1. SVG canvas ──────────────────────────────────────────────────── -->
    <div class="bg-base-300 rounded overflow-hidden">
      <svg
        ref="svgRef"
        :height="SVG_HEIGHT"
        class="w-full cursor-crosshair"
        :viewBox="`0 0 ${svgWidth} ${SVG_HEIGHT}`"
        preserveAspectRatio="none"
        :aria-label="`Volume automation with ${sorted.length} step${sorted.length === 1 ? '' : 's'}`"
        @click="handleSvgClick"
      >
        <!-- Unity gain reference (dashed) -->
        <line
          :x1="PADDING_X"
          :y1="valueToY(1)"
          :x2="svgWidth - PADDING_X"
          :y2="valueToY(1)"
          stroke="currentColor"
          stroke-width="0.5"
          stroke-dasharray="3,3"
          class="text-base-content/20"
        />

        <!-- Fill under envelope -->
        <path :d="fillPath" fill="currentColor" class="text-primary/15" />

        <!-- Envelope stroke (bezier curves per transition type) -->
        <path
          :d="envelopePath"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="text-primary"
        />

        <!-- Playhead cursor -->
        <line
          :x1="playheadX"
          :y1="PADDING_Y / 2"
          :x2="playheadX"
          :y2="SVG_HEIGHT - PADDING_Y / 2"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-dasharray="2,2"
          class="text-warning"
        />

        <!-- Step dots -->
        <circle
          v-for="(kf, i) in sorted"
          :key="kf.time"
          :cx="timeToX(kf.time)"
          :cy="valueToY(kf.value)"
          :r="clampedIndex === i ? 4.5 : 3.5"
          fill="currentColor"
          :stroke="clampedIndex === i ? 'currentColor' : 'none'"
          :stroke-width="clampedIndex === i ? 2 : 0"
          :stroke-opacity="clampedIndex === i ? 0.3 : 0"
          :class="[
            clampedIndex === i ? 'text-primary' : 'text-base-content/50',
            kf.time === 0
              ? 'cursor-default'
              : 'cursor-pointer hover:text-primary transition-colors',
          ]"
          @click.stop="seekToTime(kf.time)"
        />

        <!-- Time labels -->
        <text
          :x="PADDING_X"
          :y="SVG_HEIGHT - 1"
          font-size="7"
          fill="currentColor"
          class="text-base-content/30"
        >
          0s
        </text>
        <text
          :x="svgWidth - PADDING_X - 18"
          :y="SVG_HEIGHT - 1"
          font-size="7"
          fill="currentColor"
          class="text-base-content/30"
        >
          {{ formatTime(viewMax) }}
        </text>
      </svg>
    </div>

    <!-- ── 2. Navigation ──────────────────────────────────────────────────── -->
    <div class="flex items-center gap-1">
      <span class="text-[10px] font-medium text-base-content/50 shrink-0"
        >Steps</span
      >
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
        class="btn btn-xs btn-ghost gap-0.5 min-h-0 h-6 px-1.5 hover:text-error"
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

    <!-- ── 3. Properties ─────────────────────────────────────────────────── -->
    <div
      v-if="selectedKeyframe"
      class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 w-full text-xs"
    >
      <!-- Step — read-only position indicator -->
      <span class="text-base-content/50 whitespace-nowrap py-0.5">Step</span>
      <span
        class="font-mono tabular-nums text-right py-0.5 text-base-content/70"
      >
        {{ clampedIndex + 1 }}&thinsp;/&thinsp;{{
          sorted.length
        }}&ensp;&middot;&ensp;{{ formatTime(selectedKeyframe.time) }}
      </span>

      <!-- Volume -->
      <span class="text-base-content/50 whitespace-nowrap py-0.5">Volume</span>
      <span class="mb-1">
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

        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          :value="selectedKeyframe.value"
          class="range range-xs col-span-2 w-full range-primary"
          aria-label="Volume level slider (0 – 2)"
          @input="updateSelectedValue"
        />
      </span>

      <!-- Transition -->
      <span class="text-base-content/50 whitespace-nowrap py-0.5"
        >Transition</span
      >
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
    </div>
  </div>
</template>
