// features/effects/dsp/volume.test.ts
// Targeted tests for the volume automation DSP processor.
// Tests the pure math layer in isolation — no workers, no Vue, no Web Audio.

import { describe, expect, test } from "vitest";
import type { VolumeEffect } from "../types";
import type { DspContext } from "./types";
import { processVolumeEffect } from "./volume";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 44100;

/** Create a mono Float32Array filled with a constant value. */
function constantBuffer(lengthSamples: number, value = 1): Float32Array[] {
  const ch = new Float32Array(lengthSamples).fill(value);
  return [ch];
}

/** Create a stereo pair filled with a constant value. */
function stereoBuffer(lengthSamples: number, value = 1): Float32Array[] {
  return [new Float32Array(lengthSamples).fill(value), new Float32Array(lengthSamples).fill(value)];
}

function makeCtx(channels: Float32Array[]): DspContext {
  const length = channels[0]?.length ?? 0;
  return { sampleRate: SAMPLE_RATE, duration: length / SAMPLE_RATE, offset: 0 };
}

function makeVolumeEffect(keyframes: VolumeEffect["keyframes"], enabled = true): VolumeEffect {
  return { id: "test-vol", type: "volume", enabled, keyframes };
}

const neverCancel = () => false;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("processVolumeEffect", () => {
  test("empty keyframes — buffer unchanged (passthrough)", () => {
    const channels = constantBuffer(1000, 0.5);
    const effect = makeVolumeEffect([]);
    const ctx = makeCtx(channels);

    const completed = processVolumeEffect(channels, effect, ctx, neverCancel);

    expect(completed).toBe(true);
    // Every sample should still be 0.5
    for (let i = 0; i < channels[0].length; i++) {
      expect(channels[0][i]).toBeCloseTo(0.5, 5);
    }
  });

  test("single keyframe at value=1 — buffer unchanged", () => {
    const channels = constantBuffer(1000, 0.8);
    const effect = makeVolumeEffect([{ time: 0, value: 1, curve: "linear" }]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    for (let i = 0; i < channels[0].length; i++) {
      expect(channels[0][i]).toBeCloseTo(0.8, 5);
    }
  });

  test("single keyframe at value=0.5 — all samples halved", () => {
    const channels = constantBuffer(1000, 1);
    const effect = makeVolumeEffect([{ time: 0, value: 0.5, curve: "linear" }]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    for (let i = 0; i < channels[0].length; i++) {
      expect(channels[0][i]).toBeCloseTo(0.5, 5);
    }
  });

  test("single keyframe at value=0 — all samples silenced", () => {
    const channels = constantBuffer(1000, 1);
    const effect = makeVolumeEffect([{ time: 0, value: 0, curve: "linear" }]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    for (let i = 0; i < channels[0].length; i++) {
      expect(channels[0][i]).toBe(0);
    }
  });

  test("two keyframes — linear ramp from 0 to 1 over 1 second", () => {
    // 1 second of audio at 44100 Hz
    const lengthSamples = SAMPLE_RATE;
    const channels = constantBuffer(lengthSamples, 1);
    const effect = makeVolumeEffect([
      { time: 0, value: 0, curve: "linear" },
      { time: 1, value: 1, curve: "linear" },
    ]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    // First sample should be near 0
    expect(channels[0][0]).toBeCloseTo(0, 2);
    // Midpoint sample should be near 0.5
    const midIdx = Math.floor(lengthSamples / 2);
    expect(channels[0][midIdx]).toBeCloseTo(0.5, 2);
    // Last sample should be near 1
    expect(channels[0][lengthSamples - 1]).toBeCloseTo(1, 2);
  });

  test("two keyframes — linear ramp from 1 to 0 (fade out)", () => {
    const lengthSamples = SAMPLE_RATE;
    const channels = constantBuffer(lengthSamples, 1);
    const effect = makeVolumeEffect([
      { time: 0, value: 1, curve: "linear" },
      { time: 1, value: 0, curve: "linear" },
    ]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    // First sample near 1
    expect(channels[0][0]).toBeCloseTo(1, 2);
    // Last sample near 0
    expect(channels[0][lengthSamples - 1]).toBeCloseTo(0, 2);
  });

  test("three keyframes — envelope: 0→1→0", () => {
    // 2 seconds of audio
    const lengthSamples = SAMPLE_RATE * 2;
    const channels = constantBuffer(lengthSamples, 1);
    const effect = makeVolumeEffect([
      { time: 0, value: 0, curve: "linear" },
      { time: 1, value: 1, curve: "linear" },
      { time: 2, value: 0, curve: "linear" },
    ]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    // Start: ~0
    expect(channels[0][0]).toBeCloseTo(0, 2);
    // 0.5s: ~0.5
    const quarterIdx = Math.floor(SAMPLE_RATE * 0.5);
    expect(channels[0][quarterIdx]).toBeCloseTo(0.5, 2);
    // 1.0s: ~1
    const midIdx = SAMPLE_RATE;
    expect(channels[0][midIdx]).toBeCloseTo(1, 2);
    // 1.5s: ~0.5
    const threeQuarterIdx = Math.floor(SAMPLE_RATE * 1.5);
    expect(channels[0][threeQuarterIdx]).toBeCloseTo(0.5, 2);
    // 2.0s: ~0
    expect(channels[0][lengthSamples - 1]).toBeCloseTo(0, 2);
  });

  test("boost above unity — value=1.3 amplifies samples", () => {
    const channels = constantBuffer(1000, 0.5);
    const effect = makeVolumeEffect([{ time: 0, value: 1.3, curve: "linear" }]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    for (let i = 0; i < channels[0].length; i++) {
      expect(channels[0][i]).toBeCloseTo(0.65, 4); // 0.5 * 1.3
    }
  });

  test("stereo — both channels are processed identically", () => {
    const lengthSamples = SAMPLE_RATE;
    const channels = stereoBuffer(lengthSamples, 1);
    const effect = makeVolumeEffect([{ time: 0, value: 0.5, curve: "linear" }]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    for (let i = 0; i < lengthSamples; i++) {
      expect(channels[0][i]).toBeCloseTo(0.5, 5);
      expect(channels[1][i]).toBeCloseTo(0.5, 5);
    }
  });

  test("keyframes beyond buffer duration — holds last value", () => {
    // Buffer is 0.5s but last keyframe is at 1s
    const lengthSamples = Math.floor(SAMPLE_RATE * 0.5);
    const channels = constantBuffer(lengthSamples, 1);
    const effect = makeVolumeEffect([
      { time: 0, value: 0.5, curve: "linear" },
      { time: 1, value: 1, curve: "linear" },
    ]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    // At time=0 gain=0.5; at time=0.5 gain should be 0.75 (linear interp)
    expect(channels[0][0]).toBeCloseTo(0.5, 2);
    expect(channels[0][lengthSamples - 1]).toBeCloseTo(0.75, 2);
  });

  test("unsorted keyframes — still processes correctly", () => {
    const lengthSamples = SAMPLE_RATE;
    const channels = constantBuffer(lengthSamples, 1);
    // Keyframes deliberately out of order
    const effect = makeVolumeEffect([
      { time: 1, value: 0, curve: "linear" },
      { time: 0, value: 1, curve: "linear" },
    ]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    // Should be sorted internally: 0→1, 1→0 (fade out)
    expect(channels[0][0]).toBeCloseTo(1, 2);
    expect(channels[0][lengthSamples - 1]).toBeCloseTo(0, 2);
  });

  test("ease-in curve — slower start, faster end", () => {
    const lengthSamples = SAMPLE_RATE;
    const channels = constantBuffer(lengthSamples, 1);
    const effect = makeVolumeEffect([
      { time: 0, value: 0, curve: "ease-in" },
      { time: 1, value: 1, curve: "linear" },
    ]);
    const ctx = makeCtx(channels);

    processVolumeEffect(channels, effect, ctx, neverCancel);

    // Ease-in: at 50% time, value should be < 0.5 (slower start)
    const midIdx = Math.floor(lengthSamples / 2);
    expect(channels[0][midIdx]).toBeLessThan(0.4);
    // End should still reach ~1
    expect(channels[0][lengthSamples - 1]).toBeCloseTo(1, 1);
  });

  test("cancellation returns false", () => {
    const channels = constantBuffer(SAMPLE_RATE, 1);
    const effect = makeVolumeEffect([
      { time: 0, value: 0, curve: "linear" },
      { time: 1, value: 1, curve: "linear" },
    ]);
    const ctx = makeCtx(channels);

    const completed = processVolumeEffect(channels, effect, ctx, () => true);

    expect(completed).toBe(false);
  });
});
