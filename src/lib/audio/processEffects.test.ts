// lib/audio/processEffects.test.ts
// Tests the copy+transfer pattern used by singleShot and chunked paths
// in processEffects.ts. Verifies that:
//   1. `new Float32Array(source.getChannelData(ch))` creates a true COPY
//   2. Transferring the copy's ArrayBuffer does NOT affect the source
//   3. The extractChunk pattern (copyFromChannel) is read-only
//
// These tests simulate the exact code patterns without spinning up a real
// Web Worker — the goal is to prove the copy/transfer mechanics are safe.

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
    copyFromChannel(destination: Float32Array, ch: number, startInChannel = 0) {
      const source = channelData[ch];
      for (let i = 0; i < destination.length; i++) {
        destination[i] = source[startInChannel + i] ?? 0;
      }
    },
  } as unknown as AudioBuffer;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── singleShot copy pattern ─────────────────────────────────────────────────

describe("processEffects — singleShot copy pattern", () => {
  test("new Float32Array(getChannelData(ch)) creates a true copy, not a view", () => {
    const sourceData = new Float32Array([0.25, 0.5, -0.75, 0.125]);
    const buffer = createStubBuffer([sourceData]);

    // This is the exact pattern from singleShot (line 85):
    //   channels.push(new Float32Array(source.getChannelData(ch)));
    const copy = new Float32Array(buffer.getChannelData(0));

    // Verify it's a DIFFERENT ArrayBuffer
    expect(copy.buffer).not.toBe(sourceData.buffer);

    // Verify values are equal
    expect(copy).toEqual(sourceData);

    // Mutating the copy must NOT affect the source
    copy[0] = 999;
    expect(sourceData[0]).toBe(0.25);
  });

  test("copy constructor does not share ArrayBuffer with source", () => {
    // This tests whether Float32Array copy constructor could possibly
    // create a view instead of a copy (it shouldn't, but let's prove it)
    const sourceData = new Float32Array(1024);
    for (let i = 0; i < sourceData.length; i++) sourceData[i] = Math.sin(i * 0.05);
    const snap = new Float32Array(sourceData);

    const copy = new Float32Array(sourceData);

    // Different buffer identity
    expect(copy.buffer).not.toBe(sourceData.buffer);

    // Same data
    expect(copy).toEqual(sourceData);

    // Zero out the copy entirely — source must survive
    copy.fill(0);
    expect(sourceData).toEqual(snap);
  });

  test("source survives after simulated transfer of copied channels", () => {
    const ch0 = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const ch1 = new Float32Array([-0.1, -0.2, -0.3, -0.4, -0.5]);
    const buffer = createStubBuffer([ch0, ch1]);
    const snapCh0 = new Float32Array(ch0);
    const snapCh1 = new Float32Array(ch1);

    // Simulate singleShot: copy channels
    const copies: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      copies.push(new Float32Array(buffer.getChannelData(ch)));
    }

    // Simulate postMessage transfer: the copies' ArrayBuffers would be
    // detached by transfer. In Node/Vitest we can't actually transfer,
    // but we can verify the source is independent by zeroing copies.
    for (const copy of copies) {
      copy.fill(0);
    }

    // Source channels must be completely untouched
    expect(ch0).toEqual(snapCh0);
    expect(ch1).toEqual(snapCh1);
  });

  test("multi-channel copy+destroy simulation preserves source (large buffer)", () => {
    const sampleRate = 44100;
    const duration = 5; // 5 seconds
    const length = sampleRate * duration;
    const ch0 = new Float32Array(length);
    const ch1 = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      ch0[i] = Math.sin(i * 0.01) * 0.9;
      ch1[i] = Math.cos(i * 0.01) * 0.7;
    }
    const buffer = createStubBuffer([ch0, ch1], sampleRate);
    const snapCh0 = new Float32Array(ch0);
    const snapCh1 = new Float32Array(ch1);

    // Simulate singleShot copy pattern
    const copies: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      copies.push(new Float32Array(buffer.getChannelData(ch)));
    }

    // Simulate what the worker does: process in-place on copies
    for (const copy of copies) {
      for (let i = 0; i < copy.length; i++) {
        copy[i] *= 0.5; // volume effect simulation
      }
    }

    // Source must be untouched
    expect(ch0).toEqual(snapCh0);
    expect(ch1).toEqual(snapCh1);
  });

  test("repeated singleShot simulations never corrupt source", () => {
    const ch0 = new Float32Array(2048);
    for (let i = 0; i < ch0.length; i++) ch0[i] = Math.sin(i * 0.03);
    const buffer = createStubBuffer([ch0]);
    const snap = new Float32Array(ch0);

    // Simulate 10 consecutive effect bake cycles
    for (let cycle = 0; cycle < 10; cycle++) {
      const copy = new Float32Array(buffer.getChannelData(0));
      // Simulate in-place processing with varying gain
      const gain = 0.1 * (cycle + 1);
      for (let i = 0; i < copy.length; i++) {
        copy[i] *= gain;
      }
    }

    expect(ch0).toEqual(snap);
  });
});

// ── chunked extractChunk pattern ────────────────────────────────────────────

describe("processEffects — chunked extractChunk pattern", () => {
  test("copyFromChannel into new Float32Array does not mutate source", () => {
    const ch0 = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    const buffer = createStubBuffer([ch0]);
    const snap = new Float32Array(ch0);

    // Simulate extractChunk: copyFromChannel into a new slice
    const chunkSize = 4;
    const slice = new Float32Array(chunkSize);
    buffer.copyFromChannel(slice, 0, 0);

    // Mutate the slice (simulating worker processing)
    slice.fill(0);

    // Source must be untouched
    expect(ch0).toEqual(snap);
  });

  test("multiple chunks extracted from same buffer — source survives", () => {
    const length = 1000;
    const ch0 = new Float32Array(length);
    for (let i = 0; i < length; i++) ch0[i] = Math.sin(i * 0.1);
    const buffer = createStubBuffer([ch0]);
    const snap = new Float32Array(ch0);

    const chunkSize = 250;
    const numChunks = Math.ceil(length / chunkSize);

    for (let ci = 0; ci < numChunks; ci++) {
      const start = ci * chunkSize;
      const end = Math.min(start + chunkSize, length);
      const len = end - start;
      const slice = new Float32Array(len);
      buffer.copyFromChannel(slice, 0, start);

      // Simulate in-place processing + transfer
      for (let i = 0; i < slice.length; i++) slice[i] *= 0.3;
    }

    expect(ch0).toEqual(snap);
  });

  test("concurrent chunk extraction + singleShot copy — source survives both", () => {
    const ch0 = new Float32Array(500);
    for (let i = 0; i < ch0.length; i++) ch0[i] = i / 500;
    const buffer = createStubBuffer([ch0]);
    const snap = new Float32Array(ch0);

    // singleShot copy
    const fullCopy = new Float32Array(buffer.getChannelData(0));
    fullCopy.fill(0);

    // chunked extraction
    const slice = new Float32Array(100);
    buffer.copyFromChannel(slice, 0, 200);
    slice.fill(0);

    expect(ch0).toEqual(snap);
  });
});

// ── ArrayBuffer identity and subarray aliasing ──────────────────────────────

describe("processEffects — ArrayBuffer sharing risks", () => {
  test("subarray creates a VIEW (shares ArrayBuffer) — mutation propagates", () => {
    // This documents the RISK: subarray shares memory.
    // processEffects.ts correctly avoids subarray for copies.
    const source = new Float32Array([1, 2, 3, 4, 5]);
    const view = source.subarray(1, 4); // [2, 3, 4] — SHARES ArrayBuffer

    expect(view.buffer).toBe(source.buffer); // same ArrayBuffer!

    view[0] = 999;
    expect(source[1]).toBe(999); // mutation propagated!

    // Restore
    source[1] = 2;
  });

  test("slice creates a COPY (independent ArrayBuffer) — mutation isolated", () => {
    const source = new Float32Array([1, 2, 3, 4, 5]);
    const copy = source.slice(1, 4); // [2, 3, 4] — INDEPENDENT

    expect(copy.buffer).not.toBe(source.buffer); // different ArrayBuffer

    copy[0] = 999;
    expect(source[1]).toBe(2); // source untouched
  });

  test("new Float32Array(typedArray) creates a COPY — mutation isolated", () => {
    const source = new Float32Array([1, 2, 3, 4, 5]);
    const copy = new Float32Array(source); // COPY

    expect(copy.buffer).not.toBe(source.buffer);

    copy[0] = 999;
    expect(source[0]).toBe(1); // source untouched
  });

  test("new Uint8Array(float32.buffer) creates a VIEW — this is the compression risk", () => {
    // This is the EXACT pattern used by compression.ts:
    //   new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    // It creates a view on the SAME ArrayBuffer.
    const source = new Float32Array([1.0, 2.0, 3.0]);
    const view = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);

    expect(view.buffer).toBe(source.buffer); // SAME ArrayBuffer!

    // If anything detaches or modifies this ArrayBuffer, source is affected.
    // fflate's deflate receives this view — if it TRANSFERS, source is detached.
    // In practice fflate copies internally, but this documents the risk.
  });
});
