<script setup lang="ts">
/**
 * EffectVolume — panel for a VolumeEffect with a visual keyframe timeline.
 *
 * Props: effect: VolumeEffect
 * Emits: update:effect(VolumeEffect), remove()
 */
import { computed, ref } from "vue";
import type { VolumeEffect, VolumeKeyframe } from "../../features/effects/types";

const props = defineProps<{
  effect: VolumeEffect;
}>();

const emit = defineEmits<{
  "update:effect": [effect: VolumeEffect];
  remove: [];
}>();

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Produce a new sorted copy of keyframes. */
function sortedKeyframes(kfs: VolumeKeyframe[]): VolumeKeyframe[] {
  return [...kfs].sort((a, b) => a.time - b.time);
}

// ── Selected keyframe index ────────────────────────────────────────────────────

const selectedIndex = ref<number | null>(null);

// ── Keyframe editing ──────────────────────────────────────────────────────────

function onUpdateKeyframeTime(index: number, evt: Event) {
  const raw = (evt.target as HTMLInputElement).valueAsNumber;
  const time = Math.min(1, Math.max(0, Number.isNaN(raw) ? 0 : raw / 100));
  const updated = props.effect.keyframes.map((kf, i) => (i === index ? { ...kf, time } : kf));
  emit("update:effect", { ...props.effect, keyframes: sortedKeyframes(updated) });
  // Reselect by value after sort
  selectedIndex.value = sortedKeyframes(updated).findIndex((kf) => kf.time === time);
}

function onUpdateKeyframeValue(index: number, evt: Event) {
  const raw = (evt.target as HTMLInputElement).valueAsNumber;
  const value = Math.min(2, Math.max(0, Number.isNaN(raw) ? 1 : raw));
  const updated = props.effect.keyframes.map((kf, i) => (i === index ? { ...kf, value } : kf));
  emit("update:effect", { ...props.effect, keyframes: updated });
}

function onAddKeyframe() {
  // Find a gap: pick the midpoint of the largest gap
  const sorted = sortedKeyframes(props.effect.keyframes);
  let largestGap = 0;
  let insertTime = 0.5;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].time - sorted[i].time;
    if (gap > largestGap) {
      largestGap = gap;
      insertTime = (sorted[i].time + sorted[i + 1].time) / 2;
    }
  }
  if (sorted.length === 0) insertTime = 0.5;

  const newKf: VolumeKeyframe = { time: insertTime, value: 1 };
  const updated = sortedKeyframes([...props.effect.keyframes, newKf]);
  emit("update:effect", { ...props.effect, keyframes: updated });
  selectedIndex.value = updated.findIndex((kf) => kf.time === insertTime);
}

function onRemoveKeyframe(index: number) {
  if (props.effect.keyframes.length <= 2) return; // keep minimum 2
  const updated = props.effect.keyframes.filter((_, i) => i !== index);
  emit("update:effect", { ...props.effect, keyframes: updated });
  selectedIndex.value = null;
}

// ── SVG timeline interaction ──────────────────────────────────────────────────

const svgRef = ref<SVGSVGElement | null>(null);
const SVG_WIDTH = 300;
const SVG_HEIGHT = 48;
const PADDING_X = 10;
const PADDING_Y = 8;

/** Convert keyframe time (0..1) to SVG x coordinate. */
function timeToX(t: number): number {
  return PADDING_X + t * (SVG_WIDTH - PADDING_X * 2);
}

/** Convert keyframe value (0..2) to SVG y coordinate (inverted: 0 at top = loud). */
function valueToY(v: number): number {
  return PADDING_Y + (1 - v / 2) * (SVG_HEIGHT - PADDING_Y * 2);
}

/** Build the polyline points string from sorted keyframes. */
const polylinePoints = computed((): string => {
  const kfs = sortedKeyframes(props.effect.keyframes);
  return kfs.map((kf) => `${timeToX(kf.time)},${valueToY(kf.value)}`).join(" ");
});

/** Handle click on SVG to add a keyframe at that time position. */
function onSvgClick(evt: MouseEvent) {
  if (!svgRef.value) return;
  const rect = svgRef.value.getBoundingClientRect();
  const xRel = evt.clientX - rect.left;
  const time = Math.min(1, Math.max(0, (xRel - PADDING_X) / (SVG_WIDTH - PADDING_X * 2)));
  const newKf: VolumeKeyframe = { time, value: 1 };
  const inserted = sortedKeyframes([...props.effect.keyframes, newKf]);
  emit("update:effect", { ...props.effect, keyframes: inserted });
  // Select by exact time value — unique since we just computed it from the click position
  selectedIndex.value = inserted.findIndex((kf) => kf.time === time);
}
</script>

<template>
  <div
    class="flex flex-col gap-2 px-2 py-1.5 text-xs"
    :class="effect.enabled ? '' : 'opacity-50'"
  >
    <!-- ── Header row ─────────────────────────────────────────────────────── -->
    <div class="flex items-center gap-2">
      <span class="font-medium">Volume Automation</span>

      <span class="flex-1" />

      <!-- Add keyframe -->
      <button
        class="btn btn-xs btn-ghost gap-0.5"
        title="Add keyframe at the largest gap"
        :disabled="!effect.enabled"
        @click="onAddKeyframe"
      >
        <i class="iconify mdi--plus size-3" aria-hidden="true" />
        Keyframe
      </button>
    </div>

    <!-- ── SVG Timeline ──────────────────────────────────────────────────── -->
    <div class="bg-base-300 rounded relative">
      <svg
        ref="svgRef"
        :width="SVG_WIDTH"
        :height="SVG_HEIGHT"
        class="w-full cursor-crosshair"
        :viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
        preserveAspectRatio="none"
        :aria-label="`Volume envelope with ${effect.keyframes.length} keyframes`"
        @click="onSvgClick"
      >
        <!-- Unity gain reference line (value=1 midpoint) -->
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

        <!-- Envelope polyline -->
        <polyline
          :points="polylinePoints"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="text-primary/70"
        />

        <!-- Filled area under the curve -->
        <polygon
          :points="`${timeToX(0)},${SVG_HEIGHT - PADDING_Y} ${polylinePoints} ${timeToX(1)},${SVG_HEIGHT - PADDING_Y}`"
          fill="currentColor"
          class="text-primary/10"
        />

        <!-- Keyframe dots -->
        <g v-for="(kf, i) in effect.keyframes" :key="i">
          <circle
            :cx="timeToX(kf.time)"
            :cy="valueToY(kf.value)"
            r="4"
            fill="currentColor"
            :class="selectedIndex === i ? 'text-primary' : 'text-base-content/60'"
            class="cursor-pointer hover:text-primary transition-colors"
            @click.stop="selectedIndex = selectedIndex === i ? null : i"
          />
        </g>

        <!-- Time labels -->
        <text
          :x="PADDING_X"
          :y="SVG_HEIGHT - 1"
          font-size="7"
          fill="currentColor"
          class="text-base-content/30"
        >0%</text>
        <text
          :x="SVG_WIDTH - PADDING_X - 14"
          :y="SVG_HEIGHT - 1"
          font-size="7"
          fill="currentColor"
          class="text-base-content/30"
        >100%</text>
      </svg>
    </div>

    <!-- ── Keyframe editor table ──────────────────────────────────────────── -->
    <div class="flex flex-col gap-0.5">
      <div class="grid grid-cols-[1fr_1fr_auto] gap-1 text-[10px] text-base-content/40 px-0.5 pb-0.5">
        <span>Time %</span>
        <span>Gain (0–2)</span>
        <span class="w-5" />
      </div>

      <div
        v-for="(kf, i) in effect.keyframes"
        :key="i"
        class="grid grid-cols-[1fr_1fr_auto] gap-1 items-center p-0.5 rounded cursor-pointer"
        :class="selectedIndex === i ? 'bg-primary/10' : 'hover:bg-base-300/50'"
        @click="selectedIndex = selectedIndex === i ? null : i"
      >
        <!-- Time % -->
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          :value="(kf.time * 100).toFixed(0)"
          class="input input-xs w-full font-mono tabular-nums text-right"
          :disabled="!effect.enabled"
          aria-label="Keyframe time percent"
          @click.stop
          @change="onUpdateKeyframeTime(i, $event)"
        />

        <!-- Value -->
        <input
          type="number"
          min="0"
          max="2"
          step="0.01"
          :value="kf.value.toFixed(2)"
          class="input input-xs w-full font-mono tabular-nums text-right"
          :disabled="!effect.enabled"
          aria-label="Keyframe gain value"
          @click.stop
          @change="onUpdateKeyframeValue(i, $event)"
        />

        <!-- Remove keyframe -->
        <button
          class="btn btn-xs btn-ghost min-h-0 h-5 w-5 p-0 text-base-content/30 hover:text-error"
          :disabled="!effect.enabled || effect.keyframes.length <= 2"
          title="Remove keyframe"
          @click.stop="onRemoveKeyframe(i)"
        >
          <i class="iconify mdi--close size-3" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Hint: click SVG to add -->
    <p class="text-[10px] text-base-content/30 italic">
      Click the timeline to add a keyframe at that position.
    </p>
  </div>
</template>
