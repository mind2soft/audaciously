// features/nodes/compute-target-buffer.test.ts
// Integration test: exercises the same function chain that the worker message
// handler calls — processEffectPipeline on Float32Array channels with a
// VolumeEffect — verifying the full DSP pipeline produces a modified buffer.
//
// This does NOT spin up an actual Web Worker (AudioBuffer is unavailable in
// Node/Vitest). Instead it replicates the exact code path the worker executes:
//   1. Build channels + effects (same shape as EffectProcessRequest)
//   2. Call processEffectPipeline (same call the worker makes)
//   3. Assert the output channels differ from input
//
// This isolates the question: "Given correctly-shaped data, does the pipeline
// modify the buffer?" — independent of worker transport / Vue reactivity.

import { describe, expect, test } from "vitest";
import { processEffectPipeline } from "../effects/dsp/pipeline";
import { createSingleShotContext } from "../effects/dsp/types";
import type { AudioEffect, VolumeEffect } from "../effects/types";

const SAMPLE_RATE = 44100;

describe("compute-target-buffer integration (worker code path)", () => {
  test("volume effect with non-unity keyframes modifies the buffer", () => {
    // Arrange — simulate what effect-processor.ts does on receipt of a request
    const lengthSamples = SAMPLE_RATE; // 1 second
    const channels: Float32Array[] = [
      new Float32Array(lengthSamples).fill(1),
      new Float32Array(lengthSamples).fill(1),
    ];
    const effects: AudioEffect[] = [
      {
        id: "vol-test",
        type: "volume",
        enabled: true,
        keyframes: [
          { time: 0, value: 0, curve: "linear" },
          { time: 0.5, value: 1.3, curve: "linear" },
          { time: 1, value: 0, curve: "linear" },
        ],
      } satisfies VolumeEffect,
    ];
    const ctx = createSingleShotContext(SAMPLE_RATE, lengthSamples / SAMPLE_RATE);

    // Act — same call as effect-processor.ts line 103
    const result = processEffectPipeline(channels, effects, ctx, () => false);

    // Assert
    expect(result.completed).toBe(true);

    // Start should be near 0
    expect(channels[0][0]).toBeCloseTo(0, 2);
    expect(channels[1][0]).toBeCloseTo(0, 2);

    // Middle (~0.5s) should be near 1.3
    const midIdx = Math.floor(SAMPLE_RATE * 0.5);
    expect(channels[0][midIdx]).toBeCloseTo(1.3, 1);
    expect(channels[1][midIdx]).toBeCloseTo(1.3, 1);

    // End should be near 0
    expect(channels[0][lengthSamples - 1]).toBeCloseTo(0, 2);
    expect(channels[1][lengthSamples - 1]).toBeCloseTo(0, 2);

    // At least SOME samples must differ from 1 (the original value)
    let diffCount = 0;
    for (let i = 0; i < lengthSamples; i++) {
      if (Math.abs(channels[0][i] - 1) > 0.01) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(lengthSamples * 0.5);
  });

  test("no enabled effects — buffer unchanged (zero-copy path)", () => {
    const lengthSamples = 1000;
    const channels: Float32Array[] = [new Float32Array(lengthSamples).fill(0.7)];
    const effects: AudioEffect[] = [
      {
        id: "vol-disabled",
        type: "volume",
        enabled: false,
        keyframes: [{ time: 0, value: 0, curve: "linear" }],
      } satisfies VolumeEffect,
    ];
    const ctx = createSingleShotContext(SAMPLE_RATE, lengthSamples / SAMPLE_RATE);

    const result = processEffectPipeline(channels, effects, ctx, () => false);

    expect(result.completed).toBe(true);
    for (let i = 0; i < lengthSamples; i++) {
      expect(channels[0][i]).toBeCloseTo(0.7, 5);
    }
  });

  test("structuredClone of effects before pipeline (full postMessage simulation)", () => {
    // Simulates the COMPLETE data path:
    // 1. Create effects (as the UI would)
    // 2. structuredClone (as postMessage does)
    // 3. processEffectPipeline (as the worker does)
    const lengthSamples = SAMPLE_RATE;
    const originalEffects: AudioEffect[] = [
      {
        id: "vol-clone",
        type: "volume",
        enabled: true,
        keyframes: [
          { time: 0, value: 0.5, curve: "linear" },
          { time: 1, value: 0.5, curve: "linear" },
        ],
      } satisfies VolumeEffect,
    ];

    // Step 1: shallow spread (watcher snapshot)
    const snapshot = originalEffects.map((e) => ({ ...e }));

    // Step 2: structuredClone (postMessage serialization)
    const cloned = structuredClone(snapshot);

    // Step 3: process (worker execution)
    const channels: Float32Array[] = [new Float32Array(lengthSamples).fill(1)];
    const ctx = createSingleShotContext(SAMPLE_RATE, lengthSamples / SAMPLE_RATE);

    const result = processEffectPipeline(channels, cloned, ctx, () => false);

    expect(result.completed).toBe(true);
    // All samples should be 0.5 (constant gain of 0.5)
    for (let i = 0; i < lengthSamples; i++) {
      expect(channels[0][i]).toBeCloseTo(0.5, 5);
    }
  });
});
