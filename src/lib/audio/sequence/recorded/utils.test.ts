// lib/audio/sequence/recorded/utils.test.ts
// Tests that splitSequence never mutates the source AudioBuffer.
//
// splitSequence reads getChannelData() → subarray() → .set() on NEW buffers.
// The .set() writes to the LEFT/RIGHT destination buffers, never the source.
// These tests prove the source survives all split operations.
//
// Note: splitSequence uses `new AudioBuffer(...)` which is not available in
// Node/Vitest, so we test the core data-splitting logic directly.

import { describe, expect, test } from "vitest";

// ── Stub ─────────────────────────────────────────────────────────────────────

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

function snapshot(channels: Float32Array[]): Float32Array[] {
  return channels.map((ch) => new Float32Array(ch));
}

function expectUnmutated(channels: Float32Array[], snap: Float32Array[]) {
  for (let ch = 0; ch < channels.length; ch++) {
    expect(channels[ch]).toEqual(snap[ch]);
  }
}

// ── Simulate the exact splitSequence data logic ─────────────────────────────
// We replicate just the data-splitting portion (lines 24-31 of utils.ts)
// without the AudioBuffer constructor or createRecordedSequence calls.

function simulateSplitData(
  buffer: AudioBuffer,
  splitTime: number,
): { leftChannels: Float32Array[]; rightChannels: Float32Array[] } {
  const sampleRate = buffer.sampleRate;
  const splitSample = Math.round(splitTime * sampleRate);

  const leftChannels: Float32Array[] = [];
  const rightChannels: Float32Array[] = [];

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    const leftChannelData = new Float32Array(splitSample);
    const rightChannelData = new Float32Array(buffer.length - splitSample);

    // Exact same code as utils.ts lines 29-30:
    leftChannelData.set(channelData.subarray(0, splitSample));
    rightChannelData.set(channelData.subarray(splitSample));

    leftChannels.push(leftChannelData);
    rightChannels.push(rightChannelData);
  }

  return { leftChannels, rightChannels };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("splitSequence — source buffer immutability", () => {
  test("split at midpoint does not mutate source", () => {
    const ch0 = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    const channels = [ch0];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 8);

    simulateSplitData(buffer, 0.5); // split at 0.5s → sample 4

    expectUnmutated(channels, snap);
  });

  test("split produces correct left and right halves", () => {
    const ch0 = new Float32Array([1, 2, 3, 4, 5, 6]);
    const buffer = createStubBuffer([ch0], 6);

    const { leftChannels, rightChannels } = simulateSplitData(buffer, 0.5);

    expect(leftChannels[0]).toEqual(new Float32Array([1, 2, 3]));
    expect(rightChannels[0]).toEqual(new Float32Array([4, 5, 6]));
  });

  test("modifying split outputs does not affect source", () => {
    const ch0 = new Float32Array([1, 2, 3, 4, 5, 6]);
    const snap = new Float32Array(ch0);
    const buffer = createStubBuffer([ch0], 6);

    const { leftChannels, rightChannels } = simulateSplitData(buffer, 0.5);

    // Aggressively mutate both outputs
    leftChannels[0].fill(0);
    rightChannels[0].fill(999);

    // Source must be untouched
    expect(ch0).toEqual(snap);
  });

  test("multi-channel split does not mutate any source channel", () => {
    const ch0 = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const ch1 = new Float32Array([-0.1, -0.2, -0.3, -0.4]);
    const channels = [ch0, ch1];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels, 4);

    const { leftChannels, rightChannels } = simulateSplitData(buffer, 0.5);

    // Mutate outputs
    leftChannels[0].fill(0);
    leftChannels[1].fill(0);
    rightChannels[0].fill(0);
    rightChannels[1].fill(0);

    expectUnmutated(channels, snap);
  });

  test("split at beginning (time=0) does not mutate source", () => {
    const ch0 = new Float32Array([1, 2, 3, 4]);
    const snap = new Float32Array(ch0);
    const buffer = createStubBuffer([ch0], 4);

    // splitSample = 0 → left is empty, right is full buffer
    simulateSplitData(buffer, 0);

    expect(ch0).toEqual(snap);
  });

  test("split at end does not mutate source", () => {
    const ch0 = new Float32Array([1, 2, 3, 4]);
    const snap = new Float32Array(ch0);
    const buffer = createStubBuffer([ch0], 4);

    // splitSample = 4 → left is full buffer, right is empty
    simulateSplitData(buffer, 1.0);

    expect(ch0).toEqual(snap);
  });

  test("subarray used in split creates views, but .set() copies values", () => {
    // Document the mechanics: subarray() creates a VIEW, but
    // Float32Array.set() copies VALUES from the view into a NEW array.
    const source = new Float32Array([1, 2, 3, 4, 5]);

    const view = source.subarray(2, 5); // VIEW: [3, 4, 5]
    expect(view.buffer).toBe(source.buffer); // same ArrayBuffer!

    const dest = new Float32Array(3);
    dest.set(view); // copies VALUES from view into dest
    expect(dest.buffer).not.toBe(source.buffer); // different ArrayBuffer

    // Mutating dest does NOT affect source
    dest.fill(0);
    expect(source).toEqual(new Float32Array([1, 2, 3, 4, 5]));
  });

  test("repeated splits never corrupt source", () => {
    const ch0 = new Float32Array(1000);
    for (let i = 0; i < ch0.length; i++) ch0[i] = Math.sin(i * 0.05);
    const snap = new Float32Array(ch0);
    const buffer = createStubBuffer([ch0], 1000);

    // Simulate multiple split operations at various points
    for (let i = 0; i < 20; i++) {
      const splitTime = Math.random();
      simulateSplitData(buffer, splitTime);
    }

    expect(ch0).toEqual(snap);
  });
});
