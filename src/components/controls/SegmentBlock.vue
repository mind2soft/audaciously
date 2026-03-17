<script setup lang="ts">
/**
 * SegmentBlock — a segment placed on a timeline track.
 *
 * Renders as a positioned block within the track's content area.
 * Width and position are derived from the segment's time + node duration and
 * the current pixelsPerSecond value.
 *
 * Displays:
 *   - RecordedNode: audio peak graph (mini WaveformView)
 *   - InstrumentNode: horizontal note bars (roll preview)
 *
 * When selected, trim handles appear on the left and right edges.
 *
 * Props
 * ─────
 * segment           The Segment data (time, trimStart, trimEnd, selected).
 * node              The referenced ProjectNode (recorded or instrument).
 * pixelsPerSecond   Timeline zoom — how many px represent 1 second.
 *
 * Emits
 * ─────
 * select            User clicked the segment body.
 * movestart(evt)    User pressed on the center drag handle.
 * trimstart-left    User pressed the left trim handle.
 * trimstart-right   User pressed the right trim handle.
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { InstrumentNode, ProjectNode, RecordedNode } from "../../features/nodes/node";
import type { Segment } from "../../features/sequence/segment";
import { createWaveformProcessor } from "../../lib/audio/waveform";

const props = defineProps<{
  segment: Segment;
  node: ProjectNode;
  pixelsPerSecond: number;
}>();

const emit = defineEmits<{
  select: [];
  movestart: [event: MouseEvent];
  "trimstart-left": [event: MouseEvent];
  "trimstart-right": [event: MouseEvent];
}>();

// ── Geometry ─────────────────────────────────────────────────────────────────

/** Duration of the underlying audio buffer (or 0 if no buffer). */
const rawDuration = computed((): number => {
  if (props.node.kind === "recorded") {
    return (props.node as RecordedNode).targetBuffer?.duration ?? 0;
  }
  if (props.node.kind === "instrument") {
    return (props.node as InstrumentNode).targetBuffer?.duration ?? 0;
  }
  return 0;
});

/** Visible duration after applying trim. */
const visibleDuration = computed(() =>
  Math.max(0, rawDuration.value - props.segment.trimStart - props.segment.trimEnd),
);

/** Left offset in pixels (segment time position). */
const leftPx = computed(() => props.segment.time * props.pixelsPerSecond);

/** Block width in pixels. */
const widthPx = computed(() => Math.max(4, visibleDuration.value * props.pixelsPerSecond));

// ── Waveform for RecordedNode ─────────────────────────────────────────────────

const svgRef = ref<SVGSVGElement>();
const waveformPath = ref<string>("");
const waveform = createWaveformProcessor();

const updateWaveform = () => {
  if (props.node.kind !== "recorded") return;
  const buffer = (props.node as RecordedNode).sourceBuffer;
  if (!buffer || !svgRef.value) return;
  const rect = svgRef.value.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  waveform
    .getLinearPath(buffer, {
      channel: 0,
      samples: Math.max(1, rect.width / 2),
      type: "steps",
      top: 0,
      height: rect.height,
      width: rect.width,
      paths: [
        { d: "L", sx: 0, sy: 0, ex: 50, ey: 100 },
        { d: "L", sx: 50, sy: 100, ex: 100, ey: 0 },
      ],
      animation: false,
      normalize: false,
    })
    .then(
      (p) => {
        waveformPath.value = p;
      },
      () => {},
    );
};

const resizeObserver = new ResizeObserver(updateWaveform);

watch(() => [props.node, props.pixelsPerSecond], updateWaveform);

onMounted(() => {
  if (svgRef.value) resizeObserver.observe(svgRef.value);
  updateWaveform();
});
onBeforeUnmount(() => {
  if (svgRef.value) resizeObserver.unobserve(svgRef.value);
});

// ── Note bars for InstrumentNode ──────────────────────────────────────────────

const noteBarHeight = 3; // px per note bar in the mini roll preview

const noteBars = computed(() => {
  if (props.node.kind !== "instrument") return [];
  const instrNode = props.node as InstrumentNode;
  if (!instrNode.notes.length) return [];

  // Use buffer duration as denominator for x-axis, fallback to 1
  const totalBeats =
    instrNode.notes.reduce((max, n) => Math.max(max, n.startBeat + n.durationBeats), 0) || 1;

  const w = widthPx.value;
  const h = 100; // SVG viewBox height

  // Collect unique pitches and assign y positions
  const pitchIds = [...new Set(instrNode.notes.map((n) => n.pitchKey))].sort();
  const pitchCount = Math.max(pitchIds.length, 1);

  return instrNode.notes.map((note) => {
    const x = (note.startBeat / totalBeats) * w;
    const noteW = Math.max(1, (note.durationBeats / totalBeats) * w);
    const pitchIdx = pitchIds.indexOf(note.pitchKey);
    const y = h - ((pitchIdx + 1) / pitchCount) * h;
    return { x, y, w: noteW, h: noteBarHeight };
  });
});

// ── Interaction ───────────────────────────────────────────────────────────────

const onBodyClick = (evt: MouseEvent) => {
  evt.stopPropagation();
  emit("select");
};

const onMoveHandleMousedown = (evt: MouseEvent) => {
  evt.stopPropagation();
  emit("movestart", evt);
};

const onTrimLeftMousedown = (evt: MouseEvent) => {
  evt.stopPropagation();
  emit("trimstart-left", evt);
};

const onTrimRightMousedown = (evt: MouseEvent) => {
  evt.stopPropagation();
  emit("trimstart-right", evt);
};
</script>

<template>
  <div
    class="absolute top-1 bottom-1 rounded overflow-hidden flex flex-col select-none"
    :class="[
      segment.selected
        ? 'ring-2 ring-primary ring-offset-0 bg-primary/20'
        : 'bg-accent/20 hover:bg-accent/30',
      'cursor-pointer',
    ]"
    :style="{
      left: `${leftPx}px`,
      width: `${widthPx}px`,
    }"
    @click="onBodyClick"
  >
    <!-- ── Label bar ──────────────────────────────────────────────────────── -->
    <div
      class="flex items-center gap-1 px-1 py-0 shrink-0 bg-accent/30 text-xs font-medium truncate h-4"
      :title="node.name"
    >
      <i
        v-if="node.kind === 'recorded'"
        class="iconify mdi--microphone size-3 shrink-0"
        aria-hidden="true"
      />
      <i
        v-else-if="node.kind === 'instrument'"
        class="iconify mdi--piano size-3 shrink-0"
        aria-hidden="true"
      />
      <span class="truncate leading-none">{{ node.name }}</span>
    </div>

    <!-- ── Content area ───────────────────────────────────────────────────── -->
    <div class="flex-1 relative overflow-hidden">
      <!-- RecordedNode: waveform preview -->
      <svg
        v-if="node.kind === 'recorded'"
        ref="svgRef"
        class="absolute inset-0 w-full h-full"
        :aria-label="`Waveform for ${node.name}`"
      >
        <path
          class="fill-none stroke-1"
          stroke="var(--color-accent)"
          stroke-opacity="0.7"
          :d="waveformPath"
        />
      </svg>

      <!-- InstrumentNode: mini note-bar roll preview -->
      <svg
        v-else-if="node.kind === 'instrument'"
        class="absolute inset-0 w-full h-full"
        :viewBox="`0 0 ${widthPx} 100`"
        preserveAspectRatio="none"
        :aria-label="`Notes for ${node.name}`"
      >
        <rect
          v-for="(bar, i) in noteBars"
          :key="i"
          :x="bar.x"
          :y="bar.y"
          :width="bar.w"
          :height="bar.h"
          fill="var(--color-accent)"
          fill-opacity="0.8"
        />
      </svg>

      <!-- Empty state -->
      <div
        v-else
        class="absolute inset-0 flex items-center justify-center text-xs text-base-content/30"
      >
        No audio
      </div>
    </div>

    <!-- ── Center move handle (only when NOT showing trim handles) ───────── -->
    <div
      v-if="!segment.selected"
      class="absolute inset-x-0 top-0 bottom-0 cursor-grab active:cursor-grabbing"
      @mousedown="onMoveHandleMousedown"
      aria-hidden="true"
    />

    <!-- ── Trim handles (only when selected) ─────────────────────────────── -->
    <template v-if="segment.selected">
      <!-- Left trim -->
      <div
        class="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize bg-primary hover:bg-primary/80 z-20 rounded-l"
        @mousedown="onTrimLeftMousedown"
        title="Trim start"
        aria-label="Trim start"
      />
      <!-- Move handle (center) -->
      <div
        class="absolute top-0 bottom-0 left-2 right-2 cursor-grab active:cursor-grabbing z-10"
        @mousedown="onMoveHandleMousedown"
        aria-hidden="true"
      />
      <!-- Right trim -->
      <div
        class="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize bg-primary hover:bg-primary/80 z-20 rounded-r"
        @mousedown="onTrimRightMousedown"
        title="Trim end"
        aria-label="Trim end"
      />
    </template>
  </div>
</template>
