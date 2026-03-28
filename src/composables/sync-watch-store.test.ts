// composables/sync-watch-store.test.ts
// Tests proving whether the sync watch pattern used in useInstrumentNode and
// useRecordedNode correctly propagates useAudioPipeline.targetBuffer → store.
//
// This exercises the EXACT reactive chain:
//   useAudioPipeline.targetBuffer (shallowRef)
//     → watch(targetBuffer, ...) — the sync watch
//       → store.setTargetBuffer
//
// Mocks the pipeline via useAudioPipeline with a mock processFn to avoid
// web worker instantiation.

import { createPinia, setActivePinia } from "pinia";
import { describe, expect, test } from "vitest";
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import type { AudioEffect, VolumeEffect } from "../features/effects/types";
import { createInstrumentNode } from "../features/nodes";
import { useNodesStore } from "../stores/nodes";
import { useAudioPipeline } from "./useAudioPipeline";

// ── AudioBuffer stub ────────────────────────────────────────────────────────

interface FakeAudioBuffer {
  _tag: string;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
}

function fakeBuffer(tag: string, duration = 1): FakeAudioBuffer {
  return { _tag: tag, duration, sampleRate: 44100, numberOfChannels: 2 };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockProcessFn(
  source: AudioBuffer,
  effects: AudioEffect[],
  _signal: AbortSignal,
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe("sync watch → store (instrument node pattern)", () => {
  test("pipeline targetBuffer propagates to store via sync watch", async () => {
    // Arrange — fresh Pinia + store + instrument node with a known id
    setActivePinia(createPinia());
    const nodesStore = useNodesStore();
    const node = createInstrumentNode("Test Piano", "piano", "test-node-1");
    nodesStore.nodesById.set(node.id, node);

    // Replicate the exact pattern from useRecordedNode:
    //   const rawBuffer = shallowRef(...)
    //   const effects = computed(() => nodeRef.value?.effects ?? [])
    //   const { targetBuffer } = useAudioPipeline(rawBuffer, effects, { processFn })
    //   watch(targetBuffer, (buffer) => { nodesStore.setTargetBuffer(id, buffer) })

    const rawBuffer = shallowRef<AudioBuffer | null>(null);
    const effects = computed(() => {
      const n = nodesStore.nodesById.get("test-node-1");
      return n?.kind === "instrument" ? ((n as any).effects ?? []) : [];
    });

    const { targetBuffer } = useAudioPipeline(rawBuffer, effects, {
      processFn: mockProcessFn,
    });

    // This is the sync watch pattern from useRecordedNode
    watch(targetBuffer, (buffer) => {
      nodesStore.setTargetBuffer("test-node-1", buffer);
    });

    // Act — simulate synth render producing a raw buffer (no effects)
    const buf = fakeBuffer("synth-output") as unknown as AudioBuffer;
    rawBuffer.value = buf;

    await nextTick();
    await nextTick(); // extra tick for async processFn resolution

    // Assert — store should have the processed buffer
    const storeNode = nodesStore.nodesById.get("test-node-1") as any;
    expect(storeNode.targetBuffer).not.toBeNull();
    // Vue reactive proxy wraps the buffer inside the store, so reference
    // equality (toBe) won't hold. Use deep equality to verify content.
    expect(storeNode.targetBuffer).toStrictEqual(buf);
  });

  test("pipeline targetBuffer with effects propagates to store", async () => {
    // Arrange
    setActivePinia(createPinia());
    const nodesStore = useNodesStore();
    const node = createInstrumentNode("Test Piano", "piano", "test-node-2");
    node.effects = [volumeEffect("v1", 0.5)];
    nodesStore.nodesById.set(node.id, node);

    const rawBuffer = shallowRef<AudioBuffer | null>(null);
    const effects = computed(() => {
      const n = nodesStore.nodesById.get("test-node-2");
      return n?.kind === "instrument" ? ((n as any).effects ?? []) : [];
    });

    const { targetBuffer } = useAudioPipeline(rawBuffer, effects, {
      processFn: mockProcessFn,
    });

    // Sync watch
    watch(targetBuffer, (buffer) => {
      nodesStore.setTargetBuffer("test-node-2", buffer);
    });

    // Act — simulate synth render
    rawBuffer.value = fakeBuffer("synth-output") as unknown as AudioBuffer;
    await nextTick();
    await nextTick();

    // Assert — store should have the PROCESSED buffer (with effect baked in)
    const storeNode = nodesStore.nodesById.get("test-node-2") as any;
    expect(storeNode.targetBuffer).not.toBeNull();
    expect((storeNode.targetBuffer as unknown as FakeAudioBuffer)._tag).toBe(
      "processed(synth-output+v1)",
    );
  });

  test("effect change updates store targetBuffer without source change", async () => {
    // Arrange
    setActivePinia(createPinia());
    const nodesStore = useNodesStore();
    const node = createInstrumentNode("Test Piano", "piano", "test-node-3");
    node.effects = [volumeEffect("v1", 1.0)];
    nodesStore.nodesById.set(node.id, node);

    const rawBuffer = shallowRef<AudioBuffer | null>(fakeBuffer("raw") as unknown as AudioBuffer);
    const effects = computed(() => {
      const n = nodesStore.nodesById.get("test-node-3");
      return n?.kind === "instrument" ? ((n as any).effects ?? []) : [];
    });

    const { targetBuffer } = useAudioPipeline(rawBuffer, effects, {
      processFn: mockProcessFn,
    });

    // Sync watch
    watch(targetBuffer, (buffer) => {
      nodesStore.setTargetBuffer("test-node-3", buffer);
    });

    // Wait for initial pipeline bake
    await nextTick();
    await nextTick();

    const storeNode = nodesStore.nodesById.get("test-node-3") as any;
    expect(storeNode.targetBuffer).not.toBeNull();
    expect((storeNode.targetBuffer as unknown as FakeAudioBuffer)._tag).toBe("processed(raw+v1)");

    // Act — change effects via the store (same path as UI edits)
    nodesStore.setNodeEffects("test-node-3", [volumeEffect("v2", 0.3)]);
    await nextTick();
    await nextTick();

    // Assert — store should have the NEW processed buffer
    const updated = nodesStore.nodesById.get("test-node-3") as any;
    expect((updated.targetBuffer as unknown as FakeAudioBuffer)._tag).toBe("processed(raw+v2)");
  });

  test("initial pipeline output reaches store (immediate behavior)", async () => {
    // This test checks whether the VERY FIRST pipeline output reaches the store.
    // The pipeline watch has immediate:true, but the sync watch does NOT.
    // If the pipeline sets targetBuffer during its immediate invocation,
    // does the sync watch pick it up?

    setActivePinia(createPinia());
    const nodesStore = useNodesStore();
    const node = createInstrumentNode("Test Piano", "piano", "test-node-4");
    nodesStore.nodesById.set(node.id, node);

    // Source buffer is available from the START (not set later)
    const rawBuffer = shallowRef<AudioBuffer | null>(
      fakeBuffer("initial-raw") as unknown as AudioBuffer,
    );
    const effects = ref<AudioEffect[]>([]); // no effects

    const { targetBuffer } = useAudioPipeline(rawBuffer, effects, {
      processFn: mockProcessFn,
    });

    // Sync watch — NO immediate:true (matches production code)
    watch(targetBuffer, (buffer) => {
      nodesStore.setTargetBuffer("test-node-4", buffer);
    });

    // Let Vue flush watchers
    await nextTick();
    await nextTick();

    // Assert — does the store have the buffer?
    const storeNode = nodesStore.nodesById.get("test-node-4") as any;
    expect(storeNode.targetBuffer).not.toBeNull();
    // Vue reactive proxy wraps the buffer, so use deep equality.
    expect(storeNode.targetBuffer).toStrictEqual(rawBuffer.value);
  });
});
