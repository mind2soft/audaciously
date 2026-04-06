// lib/storage/compression.test.ts
// Verifies that compressFloat32Array does NOT corrupt the source Float32Array.
//
// This is a documented latent risk: compressFloat32Array creates a Uint8Array
// VIEW on the same ArrayBuffer as the input, meaning fflate's async deflate
// could potentially detach or mutate the underlying memory. These tests prove
// the source data survives intact.

import { describe, expect, test } from "vitest";
import { compressFloat32Array, decompressBlobToFloat32Array } from "./compression";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("compression — source data immutability", () => {
  test("compressFloat32Array does not corrupt source Float32Array", async () => {
    const source = new Float32Array(1024);
    for (let i = 0; i < source.length; i++) source[i] = Math.sin(i * 0.05);
    const snap = new Float32Array(source);

    await compressFloat32Array(source);

    expect(source).toEqual(snap);
  });

  test("source intact after full compress → decompress round-trip", async () => {
    const source = new Float32Array(2048);
    for (let i = 0; i < source.length; i++) source[i] = Math.sin(i * 0.1) * 0.8;
    const snap = new Float32Array(source);

    const blob = await compressFloat32Array(source);
    await decompressBlobToFloat32Array(blob);

    expect(source).toEqual(snap);
  });

  test("repeated compression of same source does not corrupt it", async () => {
    const source = new Float32Array(512);
    for (let i = 0; i < source.length; i++) source[i] = i % 2 === 0 ? 0.5 : -0.5;
    const snap = new Float32Array(source);

    // Multiple save cycles
    for (let i = 0; i < 5; i++) {
      await compressFloat32Array(source);
    }

    expect(source).toEqual(snap);
  });
});
