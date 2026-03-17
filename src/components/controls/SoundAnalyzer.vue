<script setup lang="ts">
/**
 * SoundAnalyzer — live recording analyser waveform.
 *
 * Draws a time-domain waveform from a live AnalyserNode during recording.
 *
 * Props
 * ─────
 * analyserNode   The Web Audio AnalyserNode to read from.
 */

import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{
  analyserNode: AnalyserNode;
}>();

const canvasRef = ref<HTMLCanvasElement>();
let rafId: number;

const draw = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const analyser = props.analyserNode;
  const bufferLength = analyser.fftSize;
  const dataArray = new Float32Array(bufferLength);
  analyser.getFloatTimeDomainData(dataArray);

  const W = canvas.width;
  const H = canvas.height;
  const mid = H / 2;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = "var(--color-base-200, #1d2027)";
  ctx.fillRect(0, 0, W, H);

  // Waveform line
  ctx.beginPath();
  ctx.strokeStyle = "var(--color-error, #f87272)";
  ctx.lineWidth = 1.5;

  const sliceWidth = W / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const y = mid + dataArray[i] * mid;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }

  ctx.stroke();

  rafId = requestAnimationFrame(draw);
};

onMounted(() => {
  if (canvasRef.value) {
    const canvas = canvasRef.value;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }
  }
  rafId = requestAnimationFrame(draw);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
});
</script>

<template>
  <canvas ref="canvasRef" class="w-full h-full" />
</template>
