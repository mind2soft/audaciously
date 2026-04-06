// lib/audio/waveform-window.test.ts
// Every test verifies a single invariant: getWaveformChunk NEVER mutates the
// source AudioBuffer's channel data. This is the exact code path that runs
// during zoom — the path where the corruption bug manifests.

import { describe, expect, test } from "vitest";
import { getWaveformChunk } from "./waveform-window";

// ── Stub ─────────────────────────────────────────────────────────────────────

/** Minimal AudioBuffer stub backed by real Float32Array data. */
function createStubBuffer(channelData: Float32Array[], sampleRate = 44100): AudioBuffer {
  const length = channelData[0]?.length ?? 0;
  return {
    sampleRate,
    length,
    duration: length / sampleRate,
    numberOfChannels: channelData.length,
    getChannelData(ch: number) {
      return channelData[ch];
    },
  } as unknown as AudioBuffer;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function snapshot(channels: Float32Array[]): Float32Array[] {
  return channels.map((ch) => new Float32Array(ch));
}

function expectUnmutated(channels: Float32Array[], snap: Float32Array[]) {
  for (let ch = 0; ch < channels.length; ch++) {
    expect(channels[ch]).toEqual(snap[ch]);
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("getWaveformChunk — source buffer immutability", () => {
  test("single call does not mutate source channel data", () => {
    const data = new Float32Array([0.1, 0.5, -0.3, 0.8, -1.0, 0.2, 0.7, -0.4]);
    const channels = [data];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 8);

    getWaveformChunk(buffer, 0, 1, 4);

    expectUnmutated(channels, snap);
  });

  test("repeated calls (zoom cycle) do not progressively corrupt data", () => {
    const data = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) data[i] = Math.sin(i * 0.1);
    const channels = [data];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 1000);

    // 20 zoom cycles: progressively narrower then wider windows
    for (let cycle = 0; cycle < 20; cycle++) {
      const visibleDuration = 1 / (1 + cycle * 0.5);
      const center = 0.5;
      getWaveformChunk(buffer, center - visibleDuration / 2, center + visibleDuration / 2, 200);
    }

    expectUnmutated(channels, snap);
  });

  test("out-of-bounds time windows do not mutate source", () => {
    const data = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const channels = [data];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 4);

    getWaveformChunk(buffer, -2, -1, 10); // entirely before
    getWaveformChunk(buffer, 2, 3, 10); // entirely after
    getWaveformChunk(buffer, -0.5, 0.5, 10); // partial overlap

    expectUnmutated(channels, snap);
  });

  test("multi-channel buffer: no channel is mutated", () => {
    const ch0 = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const ch1 = new Float32Array([-0.1, -0.2, -0.3, -0.4, -0.5]);
    const channels = [ch0, ch1];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 5);

    getWaveformChunk(buffer, 0, 1, 3, 0);
    getWaveformChunk(buffer, 0, 1, 3, 1);

    expectUnmutated(channels, snap);
  });

  test("edge case: numSamples=0 does not mutate source", () => {
    const data = new Float32Array([1, 2, 3]);
    const channels = [data];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 3);

    getWaveformChunk(buffer, 0, 1, 0);

    expectUnmutated(channels, snap);
  });

  test("edge case: timeTo <= timeFrom does not mutate source", () => {
    const data = new Float32Array([1, 2, 3]);
    const channels = [data];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 3);

    getWaveformChunk(buffer, 0.5, 0.5, 10); // equal
    getWaveformChunk(buffer, 0.8, 0.2, 10); // reversed

    expectUnmutated(channels, snap);
  });

  test("extreme zoom (single-sample bucket) does not mutate source", () => {
    const data = new Float32Array(44100);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.01) * 0.9;
    const channels = [data];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 44100);

    // Extremely zoomed in: 1ms window at 44.1kHz → ~44 samples
    getWaveformChunk(buffer, 0.5, 0.501, 500);

    expectUnmutated(channels, snap);
  });
});

// ── Zoom + concurrent operations simulation ─────────────────────────────────
// Simulates what actually happens during zoom: getWaveformChunk is called
// while other operations (compression, serialization, copy) may run
// concurrently. Proves source buffer survives all combinations.

describe("getWaveformChunk — zoom with concurrent operations", () => {
  test("zoom cycles interleaved with simulated compression reads", () => {
    const data = new Float32Array(4096);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.02) * 0.8;
    const channels = [data];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 4096);

    for (let cycle = 0; cycle < 15; cycle++) {
      // Zoom call
      const visibleDuration = 1 / (1 + cycle * 0.3);
      getWaveformChunk(buffer, 0.5 - visibleDuration / 2, 0.5 + visibleDuration / 2, 300);

      // Simulated compression: create Uint8Array view on source (what compression.ts does)
      const raw = new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
      // Read all bytes (simulating deflate input processing)
      let checksum = 0;
      for (let j = 0; j < raw.length; j++) checksum += raw[j];
      expect(checksum).toBeGreaterThan(0);
    }

    expectUnmutated(channels, snap);
  });

  test("zoom cycles interleaved with simulated copy operations", () => {
    const data = new Float32Array(2048);
    for (let i = 0; i < data.length; i++) data[i] = Math.cos(i * 0.03) * 0.6;
    const channels = [data];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 2048);

    for (let cycle = 0; cycle < 10; cycle++) {
      // Zoom call
      const zoom = 1 + cycle * 0.5;
      const duration = 1 / zoom;
      getWaveformChunk(buffer, 0.3, 0.3 + duration, 200);

      // Simulated clipboard copy: subarray → copy to number[]
      const full = buffer.getChannelData(0);
      const view = full.subarray(100, 500);
      const copied: number[] = [];
      for (let j = 0; j < view.length; j++) copied.push(view[j]);

      // Mutate the copy aggressively
      for (let j = 0; j < copied.length; j++) copied[j] = 0;
    }

    expectUnmutated(channels, snap);
  });

  test("zoom cycles interleaved with simulated split (subarray + set)", () => {
    const data = new Float32Array(1000);
    for (let i = 0; i < data.length; i++) data[i] = (i / 1000) * 2 - 1;
    const channels = [data];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 1000);

    for (let cycle = 0; cycle < 10; cycle++) {
      // Zoom call
      const start = Math.random() * 0.5;
      const end = start + Math.random() * 0.5;
      getWaveformChunk(buffer, start, end, 150);

      // Simulated split: read source, write to NEW arrays
      const channelData = buffer.getChannelData(0);
      const splitPoint = Math.floor(channelData.length / 2);
      const left = new Float32Array(splitPoint);
      const right = new Float32Array(channelData.length - splitPoint);
      left.set(channelData.subarray(0, splitPoint));
      right.set(channelData.subarray(splitPoint));

      // Mutate split outputs
      left.fill(0);
      right.fill(0);
    }

    expectUnmutated(channels, snap);
  });

  test("rapid alternating zoom-in / zoom-out (50 cycles)", () => {
    const data = new Float32Array(8000);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.005) * 0.95;
    const channels = [data];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 8000);

    for (let cycle = 0; cycle < 50; cycle++) {
      const zoomIn = cycle % 2 === 0;
      const visibleDuration = zoomIn ? 0.01 : 0.9;
      const center = 0.5;
      getWaveformChunk(buffer, center - visibleDuration / 2, center + visibleDuration / 2, 400);
    }

    expectUnmutated(channels, snap);
  });
});
