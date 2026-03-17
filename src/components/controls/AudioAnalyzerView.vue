<script setup lang="ts">
/**
 * AudioAnalyzerView — real-time audio input analyzer rendered as an SVG.
 *
 * Used by RecordedNodeView as the "idle / recording" state before a buffer
 * exists.  Path computation runs synchronously on the main thread because the
 * analyser buffer is tiny (~1024 samples) and latency from worker round-trips
 * would make the animation feel laggy at 60 fps.
 *
 * Props
 * ─────
 * analyserBuffer   Live AudioBuffer from the recorder's timeupdate event, or
 *                  null when the recorder is idle.  Reactive updates drive the
 *                  animation; pass null to show the silent "ready" state.
 *
 * View modes (internal toggle buttons at top-right)
 * ──────────────────────────────────────────────────
 *   linear-bottom   Vertical bars anchored to the bottom edge.
 *   linear-centered Symmetric mirror bars around the horizontal centre line.
 *   polar           Radial bars radiating from an inner circle (full 360°).
 */

import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  analyserBuffer: AudioBuffer | null;
}>();

// ── View mode ────────────────────────────────────────────────────────────────

type AnalyzerMode = "linear-bottom" | "linear-centered" | "polar";

const mode = ref<AnalyzerMode>("linear-centered");

// ── SVG dimensions (tracked via ResizeObserver) ───────────────────────────────

const svgRef = ref<SVGSVGElement | null>(null);
const svgWidth = ref(400);
const svgHeight = ref(120);

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (!svgRef.value) return;
  resizeObserver = new ResizeObserver(([entry]) => {
    svgWidth.value = entry?.contentRect.width ?? 400;
    svgHeight.value = entry?.contentRect.height ?? 120;
  });
  resizeObserver.observe(svgRef.value);
  const rect = svgRef.value.getBoundingClientRect();
  if (rect.width > 0) {
    svgWidth.value = rect.width;
    svgHeight.value = rect.height;
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

// ── Amplitude data extraction ─────────────────────────────────────────────────

const SAMPLES = 80;

/** Reduce an AudioBuffer to N normalised peak amplitudes in [0, 1]. */
function getAmplitudes(buffer: AudioBuffer | null): number[] {
  if (!buffer || buffer.length === 0) {
    return new Array(SAMPLES).fill(0) as number[];
  }
  const raw = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(raw.length / SAMPLES));
  const result: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    let peak = 0;
    const start = i * step;
    const end = Math.min(start + step, raw.length);
    for (let j = start; j < end; j++) {
      const v = Math.abs(raw[j] ?? 0);
      if (v > peak) peak = v;
    }
    result.push(Math.min(peak, 1));
  }
  return result;
}

// ── SVG path computation ──────────────────────────────────────────────────────

const path = computed<string>(() => {
  const N = SAMPLES;
  const W = svgWidth.value;
  const H = svgHeight.value;
  const amps = getAmplitudes(props.analyserBuffer);

  if (mode.value === "linear-bottom") {
    // Bars anchored to bottom edge; minimum 1.5px so the "silent" state is visible.
    let d = "";
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N) * W;
      const barH = Math.max(amps[i] * H, 1.5);
      d += `M ${x} ${H} L ${x} ${H - barH} `;
    }
    return d;
  }

  if (mode.value === "linear-centered") {
    // Symmetric mirror bars around the horizontal centre.
    // Minimum half-height 0.75px keeps the centre line visible when silent.
    let d = "";
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N) * W;
      const half = Math.max(amps[i] * (H / 2), 0.75);
      d += `M ${x} ${H / 2 - half} L ${x} ${H / 2 + half} `;
    }
    return d;
  }

  // polar — radial bars from innerR outward.
  const cx = W / 2;
  const cy = H / 2;
  const minDim = Math.min(W, H);
  const innerR = minDim * 0.18;
  const outerR = minDim * 0.46;
  let d = "";
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    // Minimum 1px extension so the inner circle outline is visible when silent.
    const r1 = innerR + Math.max(amps[i] * (outerR - innerR), 1);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    d += `M ${cx + innerR * cos} ${cy + innerR * sin} L ${cx + r1 * cos} ${cy + r1 * sin} `;
  }
  return d;
});

// ── Derived styling ───────────────────────────────────────────────────────────

/** True while the recorder is actively sending analyser frames. */
const isActive = computed(() => props.analyserBuffer !== null);
</script>

<template>
  <div class="relative w-full h-full overflow-hidden">
    <!-- ── View mode toggle (top-right) ───────────────────────────────────── -->
    <div class="absolute top-1.5 right-1.5 z-10 flex gap-0.5">
      <button
        class="btn btn-xs btn-square transition-opacity"
        :class="
          mode === 'linear-bottom'
            ? 'btn-primary'
            : 'btn-ghost opacity-40 hover:opacity-100'
        "
        title="Linear — bottom anchored"
        @click="mode = 'linear-bottom'"
      >
        <i class="iconify mdi--chart-bar size-3.5" aria-hidden="true" />
      </button>
      <button
        class="btn btn-xs btn-square transition-opacity"
        :class="
          mode === 'linear-centered'
            ? 'btn-primary'
            : 'btn-ghost opacity-40 hover:opacity-100'
        "
        title="Linear — centered (waveform)"
        @click="mode = 'linear-centered'"
      >
        <i class="iconify mdi--waveform size-3.5" aria-hidden="true" />
      </button>
      <button
        class="btn btn-xs btn-square transition-opacity"
        :class="
          mode === 'polar'
            ? 'btn-primary'
            : 'btn-ghost opacity-40 hover:opacity-100'
        "
        title="Polar"
        @click="mode = 'polar'"
      >
        <i class="iconify mdi--circle-outline size-3.5" aria-hidden="true" />
      </button>
    </div>

    <!-- ── SVG canvas ─────────────────────────────────────────────────────── -->
    <svg ref="svgRef" class="w-full h-full">
      <path
        class="fill-none"
        :stroke="isActive ? 'var(--color-accent)' : 'var(--color-base-content)'"
        :stroke-opacity="isActive ? 0.75 : 0.18"
        stroke-width="1.5"
        stroke-linecap="round"
        :d="path"
      />
    </svg>
  </div>
</template>
