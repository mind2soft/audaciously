// composables/useRecordedAudioNode.test.ts
// Tests for the typed reactive accessor composable for RecordedNode.
//
// Uses setActivePinia(createPinia()) per test to get a fresh store.
// AudioBuffer is stubbed since Vitest runs in Node (no Web Audio API).

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock Worker-dependent modules — these tests exercise reads + mutations only,
// not the pipeline (which is tested in sync-watch-store.test.ts).
vi.mock("../features/nodes/compute-target-buffer", () => ({
  computeTargetBuffer: vi.fn(),
}));

import { nextTick } from "vue";
import { createRecordedNode } from "../features/nodes";
import { useNodesStore } from "../stores/nodes";
import { useRecordedAudioNode } from "./useRecordedAudioNode";

// ── AudioBuffer stub ────────────────────────────────────────────────────────

interface FakeAudioBuffer {
  _tag: string;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  getChannelData(ch: number): Float32Array;
}

function fakeBuffer(tag: string): FakeAudioBuffer {
  const channel = new Float32Array([0.1, 0.2, 0.3]);
  return {
    _tag: tag,
    duration: 1,
    sampleRate: 44100,
    numberOfChannels: 1,
    getChannelData: () => channel,
  };
}

// ── Setup ───────────────────────────────────────────────────────────────────

let store: ReturnType<typeof useNodesStore>;

beforeEach(() => {
  setActivePinia(createPinia());
  store = useNodesStore();
});

// ── Reactive reads ──────────────────────────────────────────────────────────

describe("useRecordedAudioNode — reactive reads", () => {
  test("returns initial property values from the store node", () => {
    const node = createRecordedNode("My Recording", "rec-1");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-1");

    expect(composable.name.value).toBe("My Recording");
    expect(composable.sourceBuffer.value).toBeNull();
    expect(composable.targetBuffer.value).toBeNull();
    expect(composable.isRecording.value).toBe(false);
    expect(composable.effects.value).toEqual([]);
  });

  test("computed properties react to store mutations", async () => {
    const node = createRecordedNode("Rec", "rec-2");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-2");
    expect(composable.name.value).toBe("Rec");

    // Mutate via store
    store.renameNode("rec-2", "Renamed");
    await nextTick();
    expect(composable.name.value).toBe("Renamed");
  });

  test("throws when node does not exist", () => {
    const composable = useRecordedAudioNode("nonexistent");
    expect(() => composable.name.value).toThrow('Node "nonexistent" not found');
  });

  test("throws when node is wrong kind", () => {
    store.addFolderNode("Folder");
    const folderId = [...store.nodesById.keys()][0];

    const composable = useRecordedAudioNode(folderId);
    expect(() => composable.name.value).toThrow('expected "recorded"');
  });
});

// ── Mutations ───────────────────────────────────────────────────────────────

describe("useRecordedAudioNode — mutations", () => {
  test("rename updates the store node", async () => {
    const node = createRecordedNode("Original", "rec-3");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-3");
    composable.rename("New Name");

    await nextTick();
    expect(composable.name.value).toBe("New Name");
    expect(store.nodesById.get("rec-3")?.name).toBe("New Name");
  });

  test("setSourceBuffer registers buffer in repo and stores ID on node", () => {
    const node = createRecordedNode("Rec", "rec-4");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-4");
    const buf = fakeBuffer("recorded-audio") as unknown as AudioBuffer;
    composable.setSourceBuffer(buf);

    const storeNode = store.nodesById.get("rec-4");
    expect(storeNode?.kind === "recorded" && storeNode.sourceBufferId).not.toBeNull();
  });

  test("setSourceBuffer with null clears the buffer", () => {
    const node = createRecordedNode("Rec", "rec-5");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-5");
    composable.setSourceBuffer(fakeBuffer("audio") as unknown as AudioBuffer);
    composable.setSourceBuffer(null);

    const storeNode = store.nodesById.get("rec-5");
    expect(storeNode?.kind === "recorded" && storeNode.sourceBufferId).toBeNull();
  });

  test("setRecordingState toggles isRecording", async () => {
    const node = createRecordedNode("Rec", "rec-6");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-6");
    expect(composable.isRecording.value).toBe(false);

    composable.setRecordingState(true);
    await nextTick();
    expect(composable.isRecording.value).toBe(true);

    composable.setRecordingState(false);
    await nextTick();
    expect(composable.isRecording.value).toBe(false);
  });

  test("setEffects replaces the effects array", async () => {
    const node = createRecordedNode("Rec", "rec-7");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-7");
    composable.setEffects([{ id: "e1", type: "gain", enabled: true, value: 0.5 }]);

    await nextTick();
    expect(composable.effects.value).toHaveLength(1);
    expect(composable.effects.value[0].type).toBe("gain");
  });
});

// ── Effect operations ───────────────────────────────────────────────────────

describe("useRecordedAudioNode — effect operations", () => {
  test("addEffect creates a new effect on the node", async () => {
    const node = createRecordedNode("Rec", "rec-8");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-8");
    composable.addEffect("gain");

    await nextTick();
    expect(composable.effects.value).toHaveLength(1);
    expect(composable.effects.value[0].type).toBe("gain");
  });

  test("addEffect enforces one instance per type", async () => {
    const node = createRecordedNode("Rec", "rec-9");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-9");
    composable.addEffect("gain");
    composable.addEffect("gain"); // duplicate — should be ignored

    await nextTick();
    expect(composable.effects.value).toHaveLength(1);
  });

  test("addEffect allows different types", async () => {
    const node = createRecordedNode("Rec", "rec-10");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-10");
    composable.addEffect("gain");
    composable.addEffect("fadeIn");
    composable.addEffect("volume");

    await nextTick();
    expect(composable.effects.value).toHaveLength(3);
    expect(composable.effects.value.map((e) => e.type)).toEqual(["gain", "fadeIn", "volume"]);
  });

  test("removeEffect removes by effectId", async () => {
    const node = createRecordedNode("Rec", "rec-11");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-11");
    composable.addEffect("gain");
    composable.addEffect("fadeIn");

    await nextTick();
    const gainId = composable.effects.value[0].id;
    composable.removeEffect(gainId);

    await nextTick();
    expect(composable.effects.value).toHaveLength(1);
    expect(composable.effects.value[0].type).toBe("fadeIn");
  });

  test("removeEffect with unknown id is a no-op", async () => {
    const node = createRecordedNode("Rec", "rec-12");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-12");
    composable.addEffect("gain");
    composable.removeEffect("nonexistent");

    await nextTick();
    expect(composable.effects.value).toHaveLength(1);
  });

  test("reorderEffects swaps positions", async () => {
    const node = createRecordedNode("Rec", "rec-13");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-13");
    composable.addEffect("gain");
    composable.addEffect("fadeIn");
    composable.addEffect("volume");

    await nextTick();
    // Move gain (index 0) to index 2
    composable.reorderEffects(0, 2);

    await nextTick();
    expect(composable.effects.value.map((e) => e.type)).toEqual(["fadeIn", "volume", "gain"]);
  });

  test("reorderEffects with out-of-bounds indices is a no-op", async () => {
    const node = createRecordedNode("Rec", "rec-14");
    store.nodesById.set(node.id, node);

    const composable = useRecordedAudioNode("rec-14");
    composable.addEffect("gain");

    await nextTick();
    composable.reorderEffects(-1, 0);
    composable.reorderEffects(0, 5);

    await nextTick();
    expect(composable.effects.value).toHaveLength(1);
    expect(composable.effects.value[0].type).toBe("gain");
  });
});
