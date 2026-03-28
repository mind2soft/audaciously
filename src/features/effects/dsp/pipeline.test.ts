// features/effects/dsp/pipeline.test.ts
// Tests the effect pipeline orchestrator — routing and enabled/disabled filtering.

import { describe, expect, test } from "vitest";
import type { AudioEffect, VolumeEffect } from "../types";
import { processEffectPipeline } from "./pipeline";
import type { DspContext } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;
const neverCancel = () => false;

function constantBuffer(lengthSamples: number, value = 1): Float32Array[] {
  return [new Float32Array(lengthSamples).fill(value)];
}

function makeCtx(channels: Float32Array[]): DspContext {
  const length = channels[0]?.length ?? 0;
  return { sampleRate: SAMPLE_RATE, duration: length / SAMPLE_RATE, offset: 0 };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("processEffectPipeline", () => {
  test("empty effects list — buffer unchanged", () => {
    const channels = constantBuffer(1000, 0.7);
    const ctx = makeCtx(channels);

    const completed = processEffectPipeline(channels, [], ctx, neverCancel);

    expect(completed).toBe(true);
    for (let i = 0; i < channels[0].length; i++) {
      expect(channels[0][i]).toBeCloseTo(0.7, 5);
    }
  });

  test("enabled volume effect is routed and applied", () => {
    const channels = constantBuffer(1000, 1);
    const ctx = makeCtx(channels);
    const effect: VolumeEffect = {
      id: "v1",
      type: "volume",
      enabled: true,
      keyframes: [{ time: 0, value: 0.5, curve: "linear" }],
    };

    const completed = processEffectPipeline(channels, [effect], ctx, neverCancel);

    expect(completed).toBe(true);
    // All samples should be halved
    for (let i = 0; i < channels[0].length; i++) {
      expect(channels[0][i]).toBeCloseTo(0.5, 5);
    }
  });

  test("disabled volume effect is skipped — buffer unchanged", () => {
    const channels = constantBuffer(1000, 1);
    const ctx = makeCtx(channels);
    const effect: VolumeEffect = {
      id: "v1",
      type: "volume",
      enabled: false,
      keyframes: [{ time: 0, value: 0, curve: "linear" }],
    };

    const completed = processEffectPipeline(channels, [effect], ctx, neverCancel);

    expect(completed).toBe(true);
    for (let i = 0; i < channels[0].length; i++) {
      expect(channels[0][i]).toBeCloseTo(1, 5);
    }
  });

  test("multiple effects applied in order (gain then volume)", () => {
    const channels = constantBuffer(1000, 1);
    const ctx = makeCtx(channels);
    const effects: AudioEffect[] = [
      { id: "g1", type: "gain", enabled: true, value: 0.5 },
      {
        id: "v1",
        type: "volume",
        enabled: true,
        keyframes: [{ time: 0, value: 0.5, curve: "linear" }],
      },
    ];

    processEffectPipeline(channels, effects, ctx, neverCancel);

    // 1 * 0.5 (gain) * 0.5 (volume) = 0.25
    for (let i = 0; i < channels[0].length; i++) {
      expect(channels[0][i]).toBeCloseTo(0.25, 5);
    }
  });

  test("volume effect with multi-keyframe envelope modifies buffer", () => {
    // 1 second buffer
    const lengthSamples = SAMPLE_RATE;
    const channels = constantBuffer(lengthSamples, 1);
    const ctx = makeCtx(channels);
    const effect: VolumeEffect = {
      id: "v1",
      type: "volume",
      enabled: true,
      keyframes: [
        { time: 0, value: 0, curve: "linear" },
        { time: 0.5, value: 1, curve: "linear" },
        { time: 1, value: 0, curve: "linear" },
      ],
    };

    processEffectPipeline(channels, [effect], ctx, neverCancel);

    // First sample ~0, middle ~1, last ~0
    expect(channels[0][0]).toBeCloseTo(0, 2);
    const midIdx = Math.floor(SAMPLE_RATE * 0.5);
    expect(channels[0][midIdx]).toBeCloseTo(1, 2);
    expect(channels[0][lengthSamples - 1]).toBeCloseTo(0, 2);
  });
});
