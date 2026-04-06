// lib/storage/audio-buffer-serialization.test.ts
// Verifies that serializeAudioBuffer exposes aliased references to the source
// buffer's internal channel data. This documents a known risk: anything that
// mutates the serialized channelData arrays WILL corrupt the source buffer.
//
// The source buffer is immutable — this test proves that the serialization
// layer does NOT create a defensive copy, so callers must be careful.

import { describe, expect, test } from "vitest";
import { serializeAudioBuffer } from "./audio-buffer-serialization";

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

// ── Tests ────────────────────────────────────────────────────────────────────

describe("serializeAudioBuffer — source aliasing documentation", () => {
  test("serialized channelData shares references with source (aliasing)", () => {
    const ch0 = new Float32Array([1, 2, 3]);
    const ch1 = new Float32Array([4, 5, 6]);
    const buffer = createStubBuffer([ch0, ch1]);

    const serialized = serializeAudioBuffer(buffer);

    // getChannelData() references are pushed directly — same reference
    expect(serialized.channelData[0]).toBe(ch0);
    expect(serialized.channelData[1]).toBe(ch1);
  });

  test("mutating serialized channelData WOULD corrupt source (proving the risk)", () => {
    const ch0 = new Float32Array([1, 2, 3]);
    const original0 = ch0[0];
    const buffer = createStubBuffer([ch0]);

    const serialized = serializeAudioBuffer(buffer);

    // Prove aliasing: writing to serialized data mutates the source
    serialized.channelData[0][0] = 999;
    expect(buffer.getChannelData(0)[0]).toBe(999);

    // Restore
    ch0[0] = original0;
  });

  test("multi-channel: all channels are aliased (none are copies)", () => {
    const channels = [
      new Float32Array([0.1, 0.2]),
      new Float32Array([0.3, 0.4]),
      new Float32Array([0.5, 0.6]),
    ];
    const buffer = createStubBuffer(channels);

    const serialized = serializeAudioBuffer(buffer);

    for (let ch = 0; ch < channels.length; ch++) {
      expect(serialized.channelData[ch]).toBe(channels[ch]);
    }
  });
});
