// composables/useAudioPipeline.test.ts
// Tests for the reactive effect-baking pipeline composable.
//
// Uses a mock processFn (injected via options) so tests are synchronous,
// deterministic, and independent of the Web Worker / Web Audio API.

import { describe, expect, test, vi } from "vitest";
import { nextTick, ref, shallowRef } from "vue";
import type { AudioEffect, VolumeEffect } from "../features/effects/types";
import { useAudioPipeline } from "./useAudioPipeline";

// ── AudioBuffer stub ─────────────────────────────────────────────────────────
// Vitest runs in Node — no Web Audio API. A minimal stub with an identity
// marker lets us track which buffer is which without the real API.

interface FakeAudioBuffer {
  /** Marker so we can identify buffers in assertions. */
  _tag: string;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
}

function fakeBuffer(tag: string, duration = 1): FakeAudioBuffer {
  return { _tag: tag, duration, sampleRate: 44100, numberOfChannels: 2 };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A processFn that returns a new buffer tagged with the effect ids applied. */
function mockProcessFn(
  source: AudioBuffer,
  effects: AudioEffect[],
  _nodeId: string,
): Promise<AudioBuffer> {
  const enabled = effects.filter((e) => e.enabled);
  if (enabled.length === 0) return Promise.resolve(source);
  const tag = `processed(${(source as unknown as FakeAudioBuffer)._tag}+${enabled.map((e) => e.id).join(",")})`;
  return Promise.resolve(fakeBuffer(tag) as unknown as AudioBuffer);
}

function volumeEffect(id: string, value: number, enabled = true): VolumeEffect {
  return {
    id,
    type: "volume",
    enabled,
    keyframes: [{ time: 0, value, curve: "linear" }],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useAudioPipeline", () => {
  test("null source → targetBuffer is null", async () => {
    const source = shallowRef<AudioBuffer | null>(null);
    const effects = ref<AudioEffect[]>([]);
    const nodeId = ref("n1");

    const { targetBuffer } = useAudioPipeline(source, effects, nodeId, {
      processFn: mockProcessFn,
    });

    await nextTick();
    expect(targetBuffer.value).toBeNull();
  });

  test("source with no effects → targetBuffer is the source (zero-copy)", async () => {
    const buf = fakeBuffer("raw") as unknown as AudioBuffer;
    const source = shallowRef<AudioBuffer | null>(buf);
    const effects = ref<AudioEffect[]>([]);
    const nodeId = ref("n1");

    const { targetBuffer } = useAudioPipeline(source, effects, nodeId, {
      processFn: mockProcessFn,
    });

    await nextTick();
    expect(targetBuffer.value).toBe(buf); // same reference
  });

  test("source with enabled effect → targetBuffer is processed", async () => {
    const buf = fakeBuffer("raw") as unknown as AudioBuffer;
    const source = shallowRef<AudioBuffer | null>(buf);
    const effects = ref<AudioEffect[]>([volumeEffect("v1", 0.5)]);
    const nodeId = ref("n1");

    const { targetBuffer } = useAudioPipeline(source, effects, nodeId, {
      processFn: mockProcessFn,
    });

    await nextTick();
    const result = targetBuffer.value as unknown as FakeAudioBuffer;
    expect(result).not.toBeNull();
    expect(result._tag).toBe("processed(raw+v1)");
  });

  test("disabled effect → targetBuffer is the source (skipped)", async () => {
    const buf = fakeBuffer("raw") as unknown as AudioBuffer;
    const source = shallowRef<AudioBuffer | null>(buf);
    const effects = ref<AudioEffect[]>([volumeEffect("v1", 0, false)]);
    const nodeId = ref("n1");

    const { targetBuffer } = useAudioPipeline(source, effects, nodeId, {
      processFn: mockProcessFn,
    });

    await nextTick();
    expect(targetBuffer.value).toBe(buf);
  });

  test("effect change re-triggers processing without source change", async () => {
    const buf = fakeBuffer("raw") as unknown as AudioBuffer;
    const source = shallowRef<AudioBuffer | null>(buf);
    const effects = ref<AudioEffect[]>([volumeEffect("v1", 1)]);
    const nodeId = ref("n1");
    const spy = vi.fn(mockProcessFn);

    const { targetBuffer } = useAudioPipeline(source, effects, nodeId, {
      processFn: spy,
    });

    // Initial bake.
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
    const first = targetBuffer.value;

    // Change effects only — should trigger a new bake.
    effects.value = [volumeEffect("v2", 0.3)];
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(2);
    const second = targetBuffer.value as unknown as FakeAudioBuffer;
    expect(second._tag).toBe("processed(raw+v2)");
    expect(second).not.toBe(first);
  });

  test("source change re-triggers processing without effect change", async () => {
    const buf1 = fakeBuffer("buf1") as unknown as AudioBuffer;
    const source = shallowRef<AudioBuffer | null>(buf1);
    const effects = ref<AudioEffect[]>([volumeEffect("v1", 0.5)]);
    const nodeId = ref("n1");
    const spy = vi.fn(mockProcessFn);

    const { targetBuffer } = useAudioPipeline(source, effects, nodeId, {
      processFn: spy,
    });

    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);

    // Change source only.
    const buf2 = fakeBuffer("buf2") as unknown as AudioBuffer;
    source.value = buf2;
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(2);
    const result = targetBuffer.value as unknown as FakeAudioBuffer;
    expect(result._tag).toBe("processed(buf2+v1)");
  });

  test("source set to null clears targetBuffer", async () => {
    const buf = fakeBuffer("raw") as unknown as AudioBuffer;
    const source = shallowRef<AudioBuffer | null>(buf);
    const effects = ref<AudioEffect[]>([volumeEffect("v1", 0.5)]);
    const nodeId = ref("n1");

    const { targetBuffer } = useAudioPipeline(source, effects, nodeId, {
      processFn: mockProcessFn,
    });

    await nextTick();
    expect(targetBuffer.value).not.toBeNull();

    source.value = null;
    await nextTick();
    expect(targetBuffer.value).toBeNull();
  });

  test("isProcessing reflects async state", async () => {
    let resolveProcess!: (buf: AudioBuffer) => void;
    const slowProcess: typeof mockProcessFn = () =>
      new Promise((resolve) => {
        resolveProcess = resolve;
      });

    const buf = fakeBuffer("raw") as unknown as AudioBuffer;
    const source = shallowRef<AudioBuffer | null>(buf);
    const effects = ref<AudioEffect[]>([volumeEffect("v1", 0.5)]);
    const nodeId = ref("n1");

    const { isProcessing, targetBuffer } = useAudioPipeline(source, effects, nodeId, {
      processFn: slowProcess,
    });

    await nextTick();
    // Processing should be in progress (promise not yet resolved).
    expect(isProcessing.value).toBe(true);

    // Resolve the promise.
    resolveProcess(fakeBuffer("done") as unknown as AudioBuffer);
    await nextTick();
    // Need an extra tick for the async handler to complete.
    await nextTick();
    expect(isProcessing.value).toBe(false);
    expect((targetBuffer.value as unknown as FakeAudioBuffer)._tag).toBe("done");
  });

  test("stale result is discarded when a newer change arrives", async () => {
    const resolvers: Array<(buf: AudioBuffer) => void> = [];
    const slowProcess: typeof mockProcessFn = () =>
      new Promise((resolve) => {
        resolvers.push((buf) => resolve(buf));
      });

    const buf = fakeBuffer("raw") as unknown as AudioBuffer;
    const source = shallowRef<AudioBuffer | null>(buf);
    const effects = ref<AudioEffect[]>([volumeEffect("v1", 0.5)]);
    const nodeId = ref("n1");

    const { targetBuffer } = useAudioPipeline(source, effects, nodeId, {
      processFn: slowProcess,
    });

    // First bake starts.
    await nextTick();
    expect(resolvers).toHaveLength(1);

    // Second change before first completes.
    effects.value = [volumeEffect("v2", 0.3)];
    await nextTick();
    expect(resolvers).toHaveLength(2);

    // Resolve the FIRST (stale) bake.
    resolvers[0](fakeBuffer("stale") as unknown as AudioBuffer);
    await nextTick();
    await nextTick();
    // Stale result should be discarded — targetBuffer still null or from initial.
    expect((targetBuffer.value as unknown as FakeAudioBuffer | null)?._tag).not.toBe("stale");

    // Resolve the SECOND (current) bake.
    resolvers[1](fakeBuffer("current") as unknown as AudioBuffer);
    await nextTick();
    await nextTick();
    expect((targetBuffer.value as unknown as FakeAudioBuffer)._tag).toBe("current");
  });

  test("processFn error does not crash — retains previous buffer", async () => {
    const failingProcess: typeof mockProcessFn = () => Promise.reject(new Error("worker exploded"));

    const buf = fakeBuffer("raw") as unknown as AudioBuffer;
    const source = shallowRef<AudioBuffer | null>(buf);
    const effects = ref<AudioEffect[]>([volumeEffect("v1", 0.5)]);
    const nodeId = ref("n1");

    const { targetBuffer, isProcessing } = useAudioPipeline(source, effects, nodeId, {
      processFn: failingProcess,
    });

    await nextTick();
    // Should not crash, targetBuffer stays null (no previous value).
    expect(targetBuffer.value).toBeNull();
    expect(isProcessing.value).toBe(false);
  });

  test("multiple effects are passed to processFn", async () => {
    const buf = fakeBuffer("raw") as unknown as AudioBuffer;
    const source = shallowRef<AudioBuffer | null>(buf);
    const effects = ref<AudioEffect[]>([volumeEffect("v1", 0.5), volumeEffect("v2", 0.8)]);
    const nodeId = ref("n1");

    const { targetBuffer } = useAudioPipeline(source, effects, nodeId, {
      processFn: mockProcessFn,
    });

    await nextTick();
    const result = targetBuffer.value as unknown as FakeAudioBuffer;
    expect(result._tag).toBe("processed(raw+v1,v2)");
  });
});
