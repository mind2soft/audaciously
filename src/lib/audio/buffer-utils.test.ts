// lib/audio/buffer-utils.test.ts
// Every test verifies a single invariant: tool operations (insertSilence,
// cutRegion, insertSegment) NEVER mutate the source buffer. They always
// return a new buffer with the result. The source is immutable.

import { describe, expect, test, vi } from "vitest";

// ── Mock Web Audio API (not available in Node) ──────────────────────────────

class MockAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(ch: number): Float32Array {
    return this.channels[ch];
  }

  copyToChannel(source: Float32Array, ch: number): void {
    this.channels[ch].set(source);
  }
}

// OfflineAudioContext is only referenced inside function bodies (not at
// module load), so stubbing before test execution is sufficient.
vi.stubGlobal(
  "OfflineAudioContext",
  class {
    createBuffer(channels: number, length: number, sampleRate: number) {
      return new MockAudioBuffer(channels, length, sampleRate);
    }
  },
);

import { cutRegion, insertSegment, insertSilence } from "./buffer-utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createBuffer(channelData: Float32Array[], sampleRate = 100): AudioBuffer {
  const buf = new MockAudioBuffer(channelData.length, channelData[0].length, sampleRate);
  for (let ch = 0; ch < channelData.length; ch++) {
    buf.getChannelData(ch).set(channelData[ch]);
  }
  return buf as unknown as AudioBuffer;
}

function snapshotChannels(buffer: AudioBuffer): Float32Array[] {
  const result: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    result.push(new Float32Array(buffer.getChannelData(ch)));
  }
  return result;
}

function expectUnmutated(buffer: AudioBuffer, snap: Float32Array[]) {
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    expect(buffer.getChannelData(ch)).toEqual(snap[ch]);
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buffer-utils — source buffer immutability", () => {
  describe("insertSilence", () => {
    test("source buffer is not mutated", () => {
      const source = createBuffer([new Float32Array([1, 2, 3, 4, 5])]);
      const snap = snapshotChannels(source);

      insertSilence(source, 0.02, 0.03);

      expectUnmutated(source, snap);
    });

    test("returns a new buffer (different reference)", () => {
      const source = createBuffer([new Float32Array([1, 2, 3])]);
      const result = insertSilence(source, 0.01, 0.02);

      expect(result).not.toBe(source);
    });

    test("multi-channel: no channel is mutated", () => {
      const source = createBuffer([new Float32Array([1, 2, 3, 4]), new Float32Array([5, 6, 7, 8])]);
      const snap = snapshotChannels(source);

      insertSilence(source, 0.02, 0.02);

      expectUnmutated(source, snap);
    });
  });

  describe("cutRegion", () => {
    test("source buffer is not mutated", () => {
      const source = createBuffer([new Float32Array([1, 2, 3, 4, 5])]);
      const snap = snapshotChannels(source);

      cutRegion(source, 0.01, 0.03);

      expectUnmutated(source, snap);
    });

    test("returns a new buffer (different reference)", () => {
      const source = createBuffer([new Float32Array([1, 2, 3, 4, 5])]);
      const result = cutRegion(source, 0.01, 0.03);

      expect(result).not.toBe(source);
      expect(result).not.toBeNull();
    });

    test("cutting entire buffer returns null, source untouched", () => {
      const source = createBuffer([new Float32Array([1, 2, 3])]);
      const snap = snapshotChannels(source);

      const result = cutRegion(source, 0, 1);

      expect(result).toBeNull();
      expectUnmutated(source, snap);
    });

    test("multi-channel: no channel is mutated", () => {
      const source = createBuffer([
        new Float32Array([1, 2, 3, 4, 5]),
        new Float32Array([6, 7, 8, 9, 10]),
      ]);
      const snap = snapshotChannels(source);

      cutRegion(source, 0.01, 0.03);

      expectUnmutated(source, snap);
    });
  });

  describe("insertSegment", () => {
    test("source buffer is not mutated", () => {
      const source = createBuffer([new Float32Array([1, 2, 3, 4, 5])]);
      const segment = createBuffer([new Float32Array([10, 20])]);
      const snap = snapshotChannels(source);

      insertSegment(source, segment, 0.02);

      expectUnmutated(source, snap);
    });

    test("segment buffer is not mutated either", () => {
      const source = createBuffer([new Float32Array([1, 2, 3, 4, 5])]);
      const segment = createBuffer([new Float32Array([10, 20])]);
      const segSnap = snapshotChannels(segment);

      insertSegment(source, segment, 0.02);

      expectUnmutated(segment, segSnap);
    });

    test("returns a new buffer (different from both source and segment)", () => {
      const source = createBuffer([new Float32Array([1, 2, 3])]);
      const segment = createBuffer([new Float32Array([10])]);

      const result = insertSegment(source, segment, 0.01);

      expect(result).not.toBe(source);
      expect(result).not.toBe(segment);
    });

    test("multi-channel with channel mismatch: no buffer is mutated", () => {
      // source has 1 channel, segment has 2 — result should have 2
      const source = createBuffer([new Float32Array([1, 2, 3])]);
      const segment = createBuffer([new Float32Array([10, 20]), new Float32Array([30, 40])]);
      const sourceSnap = snapshotChannels(source);
      const segSnap = snapshotChannels(segment);

      insertSegment(source, segment, 0.01);

      expectUnmutated(source, sourceSnap);
      expectUnmutated(segment, segSnap);
    });
  });
});
