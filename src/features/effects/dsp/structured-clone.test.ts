// features/effects/dsp/structured-clone.test.ts
// Verifies that a VolumeEffect survives structuredClone() — the same
// serialization mechanism used by postMessage() to send data to the worker.

import { describe, expect, test } from "vitest";
import type { AudioEffect, VolumeEffect } from "../types";

describe("structuredClone of VolumeEffect", () => {
  test("single keyframe survives clone", () => {
    const original: VolumeEffect = {
      id: "vol-1",
      type: "volume",
      enabled: true,
      keyframes: [{ time: 0, value: 1, curve: "linear" }],
    };

    const cloned = structuredClone(original);

    expect(cloned.id).toBe("vol-1");
    expect(cloned.type).toBe("volume");
    expect(cloned.enabled).toBe(true);
    expect(cloned.keyframes).toHaveLength(1);
    expect(cloned.keyframes[0]).toEqual({ time: 0, value: 1, curve: "linear" });
    // Must be a deep copy, not the same reference
    expect(cloned.keyframes).not.toBe(original.keyframes);
  });

  test("multi-keyframe envelope with mixed curves survives clone", () => {
    const original: VolumeEffect = {
      id: "vol-2",
      type: "volume",
      enabled: true,
      keyframes: [
        { time: 0, value: 0, curve: "linear" },
        { time: 0.5, value: 1, curve: "ease-in" },
        { time: 1.2, value: 1.3, curve: "ease-out" },
        { time: 2, value: 0, curve: "ease-in-out" },
      ],
    };

    const cloned = structuredClone(original);

    expect(cloned.keyframes).toHaveLength(4);
    expect(cloned.keyframes[0]).toEqual({ time: 0, value: 0, curve: "linear" });
    expect(cloned.keyframes[1]).toEqual({ time: 0.5, value: 1, curve: "ease-in" });
    expect(cloned.keyframes[2]).toEqual({ time: 1.2, value: 1.3, curve: "ease-out" });
    expect(cloned.keyframes[3]).toEqual({ time: 2, value: 0, curve: "ease-in-out" });
  });

  test("disabled effect preserves enabled=false", () => {
    const original: VolumeEffect = {
      id: "vol-3",
      type: "volume",
      enabled: false,
      keyframes: [{ time: 0, value: 0.5, curve: "linear" }],
    };

    const cloned = structuredClone(original);

    expect(cloned.enabled).toBe(false);
  });

  test("effect inside an array survives clone (simulates effects list)", () => {
    const effects: AudioEffect[] = [
      { id: "g1", type: "gain", enabled: true, value: 0.8 },
      {
        id: "vol-4",
        type: "volume",
        enabled: true,
        keyframes: [
          { time: 0, value: 1, curve: "linear" },
          { time: 1, value: 0, curve: "ease-out" },
        ],
      },
    ];

    const cloned = structuredClone(effects);

    expect(cloned).toHaveLength(2);
    const vol = cloned[1] as VolumeEffect;
    expect(vol.type).toBe("volume");
    expect(vol.keyframes).toHaveLength(2);
    expect(vol.keyframes[0]).toEqual({ time: 0, value: 1, curve: "linear" });
    expect(vol.keyframes[1]).toEqual({ time: 1, value: 0, curve: "ease-out" });
  });

  test("shallow-spread then clone (simulates watcher snapshot path)", () => {
    // This is the exact pattern used in useInstrumentAudioNode.ts:
    //   effects: node.effects.map((e) => ({ ...e }))
    // The spread copies keyframes as a reference, then postMessage clones it.
    const storeEffect: VolumeEffect = {
      id: "vol-5",
      type: "volume",
      enabled: true,
      keyframes: [
        { time: 0, value: 0, curve: "linear" },
        { time: 1, value: 1.3, curve: "ease-in" },
        { time: 2, value: 0, curve: "ease-out" },
      ],
    };

    // Step 1: shallow spread (same as watcher source)
    const snapshot = { ...storeEffect };

    // Step 2: structuredClone (same as postMessage)
    const cloned = structuredClone(snapshot);

    expect(cloned.type).toBe("volume");
    expect(cloned.enabled).toBe(true);
    expect(cloned.keyframes).toHaveLength(3);
    expect(cloned.keyframes[0]).toEqual({ time: 0, value: 0, curve: "linear" });
    expect(cloned.keyframes[1]).toEqual({ time: 1, value: 1.3, curve: "ease-in" });
    expect(cloned.keyframes[2]).toEqual({ time: 2, value: 0, curve: "ease-out" });
    // Must be distinct from the original
    expect(cloned.keyframes).not.toBe(storeEffect.keyframes);
    expect(cloned.keyframes[0]).not.toBe(storeEffect.keyframes[0]);
  });
});
