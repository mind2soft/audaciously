// features/effects/dsp/chunked.test.ts
// End-to-end chunk tests — verifies that processing a buffer in chunks via
// createChunkContext() produces identical output to single-shot processing.
//
// Covers: fade-in, fade-out, volume automation, full pipeline, split effect,
// and edge cases (boundary-aligned keyframes, tiny chunks, degenerate single chunk).

import { describe, expect, test } from "vitest";
import type {
  AudioEffect,
  FadeInEffect,
  FadeOutEffect,
  GainEffect,
  SplitEffect,
  VolumeEffect,
} from "../types";
import { processFadeInEffect } from "./fade-in";
import { processFadeOutEffect } from "./fade-out";
import { processEffectPipeline } from "./pipeline";
import { createChunkContext, createSingleShotContext } from "./types";
import { processVolumeEffect } from "./volume";

// ── Constants ────────────────────────────────────────────────────────────────

const SR = 44100;
const neverCancel = () => false;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a mono buffer filled with a constant value. */
function monoBuffer(samples: number, value = 1): Float32Array[] {
  return [new Float32Array(samples).fill(value)];
}

/** Create a stereo buffer filled with a constant value. */
function stereoBuffer(samples: number, value = 1): Float32Array[] {
  return [new Float32Array(samples).fill(value), new Float32Array(samples).fill(value)];
}

/** Deep-copy channel data so the reference buffer is not mutated. */
function cloneChannels(channels: Float32Array[]): Float32Array[] {
  return channels.map((ch) => new Float32Array(ch));
}

/**
 * Split a buffer into chunks of `chunkSamples` each (last chunk may be shorter).
 * Returns an array of per-chunk channel arrays.
 */
function splitIntoChunks(channels: Float32Array[], chunkSamples: number): Float32Array[][] {
  const total = channels[0].length;
  const chunks: Float32Array[][] = [];
  for (let offset = 0; offset < total; offset += chunkSamples) {
    const end = Math.min(offset + chunkSamples, total);
    chunks.push(channels.map((ch) => ch.slice(offset, end)));
  }
  return chunks;
}

/**
 * Stitch chunks back into a single buffer (concatenate per-channel).
 */
function stitchChunks(chunks: Float32Array[][], numChannels: number): Float32Array[] {
  const totalLen = chunks.reduce((sum, c) => sum + c[0].length, 0);
  const result: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const buf = new Float32Array(totalLen);
    let pos = 0;
    for (const chunk of chunks) {
      buf.set(chunk[ch], pos);
      pos += chunk[ch].length;
    }
    result.push(buf);
  }
  return result;
}

/**
 * Assert two channel arrays are sample-identical within tolerance.
 * Uses a loop with index reporting for clear failure messages.
 */
function assertChannelsEqual(
  actual: Float32Array[],
  expected: Float32Array[],
  tolerance = 1e-6,
  label = "",
): void {
  expect(actual.length).toBe(expected.length);
  for (let ch = 0; ch < actual.length; ch++) {
    expect(actual[ch].length).toBe(expected[ch].length);
    for (let i = 0; i < actual[ch].length; i++) {
      const diff = Math.abs(actual[ch][i] - expected[ch][i]);
      if (diff > tolerance) {
        throw new Error(
          `${label}Channel ${ch}, sample ${i}: ` +
            `actual=${actual[ch][i]}, expected=${expected[ch][i]}, diff=${diff}`,
        );
      }
    }
  }
}

// ── Fade-in across chunk boundaries ──────────────────────────────────────────

describe("fade-in across chunk boundaries", () => {
  const fadeIn: FadeInEffect = {
    id: "fi1",
    type: "fadeIn",
    enabled: true,
    duration: 1,
    curve: "linear",
  };

  test("2 chunks — matches single-shot", () => {
    const totalSamples = SR * 2; // 2 seconds
    const chunkSamples = SR; // 1s per chunk

    // Single-shot reference
    const refChannels = monoBuffer(totalSamples);
    const refCtx = createSingleShotContext(SR, 2);
    processFadeInEffect(refChannels, fadeIn, refCtx);

    // Chunked processing
    const srcChannels = monoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    for (let ci = 0; ci < chunks.length; ci++) {
      const ctx = createChunkContext(SR, chunks[ci][0].length / SR, (ci * chunkSamples) / SR, 2);
      processFadeInEffect(chunks[ci], fadeIn, ctx);
    }
    const stitched = stitchChunks(chunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "fade-in 2 chunks: ");
  });

  test("4 chunks with logarithmic curve — matches single-shot", () => {
    const logFade: FadeInEffect = { ...fadeIn, curve: "logarithmic" };
    const totalSamples = SR * 2;
    const chunkSamples = SR / 2; // 0.5s per chunk

    const refChannels = monoBuffer(totalSamples);
    processFadeInEffect(refChannels, logFade, createSingleShotContext(SR, 2));

    const srcChannels = monoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    for (let ci = 0; ci < chunks.length; ci++) {
      const ctx = createChunkContext(SR, chunks[ci][0].length / SR, (ci * chunkSamples) / SR, 2);
      processFadeInEffect(chunks[ci], logFade, ctx);
    }
    const stitched = stitchChunks(chunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "fade-in 4 chunks log: ");
  });

  test("chunk entirely past fade region — untouched", () => {
    // 3 seconds total, 1s fade — chunk covering second 2–3 is past the fade
    const chunk = monoBuffer(SR);
    const original = cloneChannels(chunk);
    const ctx = createChunkContext(SR, 1, 2, 3); // globalOffset=2, totalDuration=3
    processFadeInEffect(chunk, fadeIn, ctx);

    assertChannelsEqual(chunk, original, 0, "fade-in past region: ");
  });
});

// ── Fade-out across chunk boundaries ─────────────────────────────────────────

describe("fade-out across chunk boundaries", () => {
  const fadeOut: FadeOutEffect = {
    id: "fo1",
    type: "fadeOut",
    enabled: true,
    duration: 1,
    curve: "linear",
  };

  test("2 chunks — matches single-shot", () => {
    const totalSamples = SR * 2;
    const chunkSamples = SR;

    const refChannels = monoBuffer(totalSamples);
    processFadeOutEffect(refChannels, fadeOut, createSingleShotContext(SR, 2));

    const srcChannels = monoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    for (let ci = 0; ci < chunks.length; ci++) {
      const ctx = createChunkContext(SR, chunks[ci][0].length / SR, (ci * chunkSamples) / SR, 2);
      processFadeOutEffect(chunks[ci], fadeOut, ctx);
    }
    const stitched = stitchChunks(chunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "fade-out 2 chunks: ");
  });

  test("3 uneven chunks with sine curve — matches single-shot", () => {
    const sineFade: FadeOutEffect = { ...fadeOut, curve: "sine" };
    const totalSamples = SR * 2;
    // Uneven: ~0.7s, ~0.7s, ~0.6s
    const chunkSizes = [
      Math.floor(SR * 0.7),
      Math.floor(SR * 0.7),
      totalSamples - Math.floor(SR * 0.7) * 2,
    ];

    const refChannels = monoBuffer(totalSamples);
    processFadeOutEffect(refChannels, sineFade, createSingleShotContext(SR, 2));

    const srcChannels = monoBuffer(totalSamples);
    let offset = 0;
    const processedChunks: Float32Array[][] = [];
    for (const size of chunkSizes) {
      const chunk = srcChannels.map((ch) => ch.slice(offset, offset + size));
      const ctx = createChunkContext(SR, size / SR, offset / SR, 2);
      processFadeOutEffect(chunk, sineFade, ctx);
      processedChunks.push(chunk);
      offset += size;
    }
    const stitched = stitchChunks(processedChunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "fade-out 3 uneven sine: ");
  });

  test("chunk entirely before fade region — untouched", () => {
    // 3s total, 1s fade-out at end (2–3s). Chunk 0 (0–1s) should be untouched.
    const chunkSamples = SR;
    const chunk = monoBuffer(chunkSamples);
    const original = cloneChannels(chunk);
    const ctx = createChunkContext(SR, 1, 0, 3); // globalOffset=0, totalDuration=3
    processFadeOutEffect(chunk, fadeOut, ctx);

    assertChannelsEqual(chunk, original, 0, "fade-out before region: ");
  });
});

// ── Volume automation across chunk boundaries ────────────────────────────────

describe("volume automation across chunk boundaries", () => {
  const envelope: VolumeEffect = {
    id: "vol1",
    type: "volume",
    enabled: true,
    keyframes: [
      { time: 0, value: 0, curve: "linear" },
      { time: 1, value: 1, curve: "linear" },
      { time: 2, value: 0, curve: "linear" },
    ],
  };

  test("2 equal chunks — matches single-shot", () => {
    const totalSamples = SR * 2;
    const chunkSamples = SR;

    const refChannels = monoBuffer(totalSamples);
    processVolumeEffect(refChannels, envelope, createSingleShotContext(SR, 2), neverCancel);

    const srcChannels = monoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    for (let ci = 0; ci < chunks.length; ci++) {
      const ctx = createChunkContext(SR, chunks[ci][0].length / SR, (ci * chunkSamples) / SR, 2);
      processVolumeEffect(chunks[ci], envelope, ctx, neverCancel);
    }
    const stitched = stitchChunks(chunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "volume 2 chunks: ");
  });

  test("3 chunks hitting mid-segment — binary search path", () => {
    const totalSamples = SR * 2;
    // ~0.7s chunks — chunk 1 starts at 0.7s (mid-segment of kf[0]→kf[1])
    const chunkSizes = [
      Math.floor(SR * 0.7),
      Math.floor(SR * 0.7),
      totalSamples - Math.floor(SR * 0.7) * 2,
    ];

    const refChannels = monoBuffer(totalSamples);
    processVolumeEffect(refChannels, envelope, createSingleShotContext(SR, 2), neverCancel);

    const srcChannels = monoBuffer(totalSamples);
    let offset = 0;
    const processedChunks: Float32Array[][] = [];
    for (const size of chunkSizes) {
      const chunk = srcChannels.map((ch) => ch.slice(offset, offset + size));
      const ctx = createChunkContext(SR, size / SR, offset / SR, 2);
      processVolumeEffect(chunk, envelope, ctx, neverCancel);
      processedChunks.push(chunk);
      offset += size;
    }
    const stitched = stitchChunks(processedChunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "volume 3 chunks mid-seg: ");
  });

  test("many small chunks (128 samples each) — matches single-shot", () => {
    const totalSamples = SR; // 1 second
    const chunkSamples = 128;
    const shortEnvelope: VolumeEffect = {
      id: "vol-short",
      type: "volume",
      enabled: true,
      keyframes: [
        { time: 0, value: 0, curve: "linear" },
        { time: 1, value: 1, curve: "linear" },
      ],
    };

    const refChannels = monoBuffer(totalSamples);
    processVolumeEffect(refChannels, shortEnvelope, createSingleShotContext(SR, 1), neverCancel);

    const srcChannels = monoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    for (let ci = 0; ci < chunks.length; ci++) {
      const globalOffset = (ci * chunkSamples) / SR;
      const ctx = createChunkContext(SR, chunks[ci][0].length / SR, globalOffset, 1);
      processVolumeEffect(chunks[ci], shortEnvelope, ctx, neverCancel);
    }
    const stitched = stitchChunks(chunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "volume 128-sample chunks: ");
  });

  test("ease-in-out curve across chunks — matches single-shot", () => {
    const curvedEnvelope: VolumeEffect = {
      id: "vol-curve",
      type: "volume",
      enabled: true,
      keyframes: [
        { time: 0, value: 0, curve: "ease-in-out" },
        { time: 1, value: 1, curve: "ease-in-out" },
        { time: 2, value: 0.2, curve: "linear" },
      ],
    };
    const totalSamples = SR * 2;
    const chunkSamples = Math.floor(SR * 0.8); // unaligned with keyframes

    const refChannels = monoBuffer(totalSamples);
    processVolumeEffect(refChannels, curvedEnvelope, createSingleShotContext(SR, 2), neverCancel);

    const srcChannels = monoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    let offset = 0;
    for (const chunk of chunks) {
      const ctx = createChunkContext(SR, chunk[0].length / SR, offset / SR, 2);
      processVolumeEffect(chunk, curvedEnvelope, ctx, neverCancel);
      offset += chunk[0].length;
    }
    const stitched = stitchChunks(chunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "volume ease-in-out chunks: ");
  });
});

// ── Full pipeline across chunk boundaries ────────────────────────────────────

describe("full pipeline across chunk boundaries", () => {
  test("gain + fade-in + volume — chunked matches single-shot", () => {
    const effects: AudioEffect[] = [
      { id: "g1", type: "gain", enabled: true, value: 0.8 } as GainEffect,
      {
        id: "fi1",
        type: "fadeIn",
        enabled: true,
        duration: 0.5,
        curve: "linear",
      } as FadeInEffect,
      {
        id: "vol1",
        type: "volume",
        enabled: true,
        keyframes: [
          { time: 0, value: 0.5, curve: "linear" },
          { time: 1, value: 1, curve: "linear" },
          { time: 2, value: 0.3, curve: "linear" },
        ],
      } as VolumeEffect,
    ];
    const totalSamples = SR * 2;
    const chunkSamples = SR;

    // Single-shot reference
    const refChannels = monoBuffer(totalSamples);
    const refCtx = createSingleShotContext(SR, 2);
    processEffectPipeline(refChannels, effects, refCtx, neverCancel);

    // Chunked
    const srcChannels = monoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    for (let ci = 0; ci < chunks.length; ci++) {
      const ctx = createChunkContext(SR, chunks[ci][0].length / SR, (ci * chunkSamples) / SR, 2);
      processEffectPipeline(chunks[ci], effects, ctx, neverCancel);
    }
    const stitched = stitchChunks(chunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "pipeline gain+fi+vol: ");
  });

  test("fade-out + gain — chunked matches single-shot", () => {
    const effects: AudioEffect[] = [
      {
        id: "fo1",
        type: "fadeOut",
        enabled: true,
        duration: 1,
        curve: "exponential",
      } as FadeOutEffect,
      { id: "g1", type: "gain", enabled: true, value: 0.6 } as GainEffect,
    ];
    const totalSamples = SR * 2;
    const chunkSamples = Math.floor(SR * 0.75); // uneven chunks

    const refChannels = monoBuffer(totalSamples);
    processEffectPipeline(refChannels, effects, createSingleShotContext(SR, 2), neverCancel);

    const srcChannels = monoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    let offset = 0;
    for (const chunk of chunks) {
      const ctx = createChunkContext(SR, chunk[0].length / SR, offset / SR, 2);
      processEffectPipeline(chunk, effects, ctx, neverCancel);
      offset += chunk[0].length;
    }
    const stitched = stitchChunks(chunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "pipeline fo+gain: ");
  });
});

// ── Split effect across chunk boundaries ─────────────────────────────────────

describe("split effect across chunk boundaries", () => {
  test("split with different L/R gain — chunked matches single-shot", () => {
    const split: SplitEffect = {
      id: "s1",
      type: "split",
      enabled: true,
      left: [{ id: "gl", type: "gain", enabled: true, value: 0.3 } as GainEffect],
      right: [{ id: "gr", type: "gain", enabled: true, value: 0.7 } as GainEffect],
    };
    const totalSamples = SR * 2;
    const chunkSamples = SR;

    const refChannels = stereoBuffer(totalSamples);
    processEffectPipeline(refChannels, [split], createSingleShotContext(SR, 2), neverCancel);

    const srcChannels = stereoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    for (let ci = 0; ci < chunks.length; ci++) {
      const ctx = createChunkContext(SR, chunks[ci][0].length / SR, (ci * chunkSamples) / SR, 2);
      processEffectPipeline(chunks[ci], [split], ctx, neverCancel);
    }
    const stitched = stitchChunks(chunks, 2);

    assertChannelsEqual(stitched, refChannels, 1e-6, "split L/R gain: ");
  });

  test("split with fade-in on left, volume on right — chunked matches single-shot", () => {
    const split: SplitEffect = {
      id: "s2",
      type: "split",
      enabled: true,
      left: [
        { id: "fi-l", type: "fadeIn", enabled: true, duration: 1, curve: "linear" } as FadeInEffect,
      ],
      right: [
        {
          id: "vol-r",
          type: "volume",
          enabled: true,
          keyframes: [
            { time: 0, value: 1, curve: "linear" },
            { time: 2, value: 0, curve: "linear" },
          ],
        } as VolumeEffect,
      ],
    };
    const totalSamples = SR * 2;
    const chunkSamples = Math.floor(SR * 0.6);

    const refChannels = stereoBuffer(totalSamples);
    processEffectPipeline(refChannels, [split], createSingleShotContext(SR, 2), neverCancel);

    const srcChannels = stereoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    let offset = 0;
    for (const chunk of chunks) {
      const ctx = createChunkContext(SR, chunk[0].length / SR, offset / SR, 2);
      processEffectPipeline(chunk, [split], ctx, neverCancel);
      offset += chunk[0].length;
    }
    const stitched = stitchChunks(chunks, 2);

    assertChannelsEqual(stitched, refChannels, 1e-6, "split fi-L vol-R: ");
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("chunked edge cases", () => {
  test("chunk boundary exactly at keyframe time", () => {
    const envelope: VolumeEffect = {
      id: "vol-edge",
      type: "volume",
      enabled: true,
      keyframes: [
        { time: 0, value: 0, curve: "linear" },
        { time: 1, value: 1, curve: "linear" },
        { time: 2, value: 0, curve: "linear" },
      ],
    };
    const totalSamples = SR * 2;
    // Chunk boundary exactly at time=1.0 (the second keyframe)
    const chunkSamples = SR;

    const refChannels = monoBuffer(totalSamples);
    processVolumeEffect(refChannels, envelope, createSingleShotContext(SR, 2), neverCancel);

    const srcChannels = monoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    for (let ci = 0; ci < chunks.length; ci++) {
      const ctx = createChunkContext(SR, chunks[ci][0].length / SR, (ci * chunkSamples) / SR, 2);
      processVolumeEffect(chunks[ci], envelope, ctx, neverCancel);
    }
    const stitched = stitchChunks(chunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "volume boundary-at-kf: ");
  });

  test("single chunk equals full buffer — degenerate case", () => {
    const fadeIn: FadeInEffect = {
      id: "fi-degen",
      type: "fadeIn",
      enabled: true,
      duration: 0.5,
      curve: "sine",
    };
    const totalSamples = SR;

    const refChannels = monoBuffer(totalSamples);
    processFadeInEffect(refChannels, fadeIn, createSingleShotContext(SR, 1));

    // "Chunked" with 1 chunk = full buffer
    const chunkChannels = monoBuffer(totalSamples);
    const ctx = createChunkContext(SR, 1, 0, 1);
    processFadeInEffect(chunkChannels, fadeIn, ctx);

    assertChannelsEqual(chunkChannels, refChannels, 1e-6, "single-chunk degenerate: ");
  });

  test("very small chunks (128 samples) with fade-out — matches single-shot", () => {
    const fadeOut: FadeOutEffect = {
      id: "fo-tiny",
      type: "fadeOut",
      enabled: true,
      duration: 0.5,
      curve: "exponential",
    };
    const totalSamples = SR; // 1 second
    const chunkSamples = 128;

    const refChannels = monoBuffer(totalSamples);
    processFadeOutEffect(refChannels, fadeOut, createSingleShotContext(SR, 1));

    const srcChannels = monoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    let offset = 0;
    for (const chunk of chunks) {
      const ctx = createChunkContext(SR, chunk[0].length / SR, offset / SR, 1);
      processFadeOutEffect(chunk, fadeOut, ctx);
      offset += chunk[0].length;
    }
    const stitched = stitchChunks(chunks, 1);

    assertChannelsEqual(stitched, refChannels, 1e-6, "fade-out 128-sample chunks: ");
  });

  test("stereo buffer — both channels match across chunks", () => {
    const effects: AudioEffect[] = [
      { id: "g1", type: "gain", enabled: true, value: 0.5 } as GainEffect,
      {
        id: "fi1",
        type: "fadeIn",
        enabled: true,
        duration: 1,
        curve: "linear",
      } as FadeInEffect,
    ];
    const totalSamples = SR * 2;
    const chunkSamples = Math.floor(SR * 0.9);

    const refChannels = stereoBuffer(totalSamples);
    processEffectPipeline(refChannels, effects, createSingleShotContext(SR, 2), neverCancel);

    const srcChannels = stereoBuffer(totalSamples);
    const chunks = splitIntoChunks(srcChannels, chunkSamples);
    let offset = 0;
    for (const chunk of chunks) {
      const ctx = createChunkContext(SR, chunk[0].length / SR, offset / SR, 2);
      processEffectPipeline(chunk, effects, ctx, neverCancel);
      offset += chunk[0].length;
    }
    const stitched = stitchChunks(chunks, 2);

    assertChannelsEqual(stitched, refChannels, 1e-6, "stereo pipeline chunks: ");
  });
});
