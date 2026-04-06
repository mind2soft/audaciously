// composables/useInstrumentAudioNode.test.ts
// Tests for the typed reactive accessor composable for InstrumentNode.
//
// Uses setActivePinia(createPinia()) per test to get a fresh store.

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock Worker-dependent modules — these tests exercise reads + mutations only,
// not the pipeline (which is tested in sync-watch-store.test.ts).
vi.mock("../features/nodes/compute-target-buffer", () => ({
  computeTargetBuffer: vi.fn(),
}));
vi.mock("../lib/music/synthWorker", () => ({
  createSynthWorkerClient: vi.fn(() => ({ renderTrack: vi.fn() })),
  SynthEmptyTrackSignal: class SynthEmptyTrackSignal {},
}));

import { nextTick } from "vue";
import type { InstrumentNode } from "../features/nodes";
import { createInstrumentNode } from "../features/nodes";
import type { PlacedNote } from "../features/nodes/instrument/instrument-node";
import { useNodesStore } from "../stores/nodes";
import { useInstrumentAudioNode } from "./useInstrumentAudioNode";

// ── Setup ───────────────────────────────────────────────────────────────────

let store: ReturnType<typeof useNodesStore>;

beforeEach(() => {
  setActivePinia(createPinia());
  store = useNodesStore();
});

// ── Reactive reads ──────────────────────────────────────────────────────────

describe("useInstrumentAudioNode — reactive reads", () => {
  test("returns initial property values from the store node", () => {
    const node = createInstrumentNode("My Piano", "piano", "inst-1");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-1");

    expect(composable.name.value).toBe("My Piano");
    expect(composable.instrumentType.value).toBe("piano");
    expect(composable.bpm.value).toBe(120);
    expect(composable.notes.value).toEqual([]);
    expect(composable.timeSignature.value).toEqual({ beatsPerMeasure: 4, beatUnit: 4 });
    expect(composable.selectedNoteType.value).toBe("quarter");
    expect(composable.octaveRange.value).toEqual({ low: 3, high: 5 });
    expect(composable.pitchScrollTop.value).toBe(0);
    expect(composable.showWaveform.value).toBe(false);
    expect(composable.targetBuffer.value).toBeNull();
    expect(composable.effects.value).toEqual([]);
  });

  test("computed properties react to store mutations", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-2");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-2");
    expect(composable.bpm.value).toBe(120);

    (store.nodesById.get("inst-2") as InstrumentNode).bpm = 140;
    await nextTick();
    expect(composable.bpm.value).toBe(140);
  });

  test("throws when node does not exist", () => {
    const composable = useInstrumentAudioNode("nonexistent");
    expect(() => composable.name.value).toThrow('Node "nonexistent" not found');
  });

  test("throws when node is wrong kind", () => {
    const folder = store.addFolderNode("Folder");

    const composable = useInstrumentAudioNode(folder.id);
    expect(() => composable.name.value).toThrow('expected "instrument"');
  });
});

// ── Mutations ───────────────────────────────────────────────────────────────

describe("useInstrumentAudioNode — mutations", () => {
  test("rename updates the store node", async () => {
    const node = createInstrumentNode("Original", "piano", "inst-3");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-3");
    composable.rename("Renamed Piano");

    await nextTick();
    expect(composable.name.value).toBe("Renamed Piano");
    expect(store.nodesById.get("inst-3")?.name).toBe("Renamed Piano");
  });

  test("setBpm updates bpm", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-4");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-4");
    composable.setBpm(180);

    await nextTick();
    expect(composable.bpm.value).toBe(180);
  });

  test("setNotes replaces the notes array", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-5");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-5");
    const notes: PlacedNote[] = [
      { id: "n1", startBeat: 0, durationBeats: 1, pitchKey: "C4" },
      { id: "n2", startBeat: 1, durationBeats: 0.5, pitchKey: "E4" },
    ];
    composable.setNotes(notes);

    await nextTick();
    expect(composable.notes.value).toHaveLength(2);
    expect(composable.notes.value[0].pitchKey).toBe("C4");
  });

  test("setTimeSignature copies the value", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-6");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-6");
    const ts = { beatsPerMeasure: 3, beatUnit: 8 };
    composable.setTimeSignature(ts);

    await nextTick();
    expect(composable.timeSignature.value).toEqual({ beatsPerMeasure: 3, beatUnit: 8 });

    // Mutating the original object should not affect the stored value
    ts.beatsPerMeasure = 999;
    expect(composable.timeSignature.value.beatsPerMeasure).toBe(3);
  });

  test("setSelectedNoteType updates note type", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-7");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-7");
    composable.setSelectedNoteType("eighth");

    await nextTick();
    expect(composable.selectedNoteType.value).toBe("eighth");
  });

  test("setOctaveRange copies the value", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-8");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-8");
    const range = { low: 2, high: 6 };
    composable.setOctaveRange(range);

    await nextTick();
    expect(composable.octaveRange.value).toEqual({ low: 2, high: 6 });

    // Mutating the original object should not affect the stored value
    range.low = 0;
    expect(composable.octaveRange.value.low).toBe(2);
  });

  test("setPitchScrollTop updates scroll position", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-9");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-9");
    composable.setPitchScrollTop(42);

    await nextTick();
    expect(composable.pitchScrollTop.value).toBe(42);
  });

  test("setShowWaveform toggles the flag", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-10");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-10");
    composable.setShowWaveform(true);

    await nextTick();
    expect(composable.showWaveform.value).toBe(true);
  });
});

// ── Effect operations ───────────────────────────────────────────────────────

describe("useInstrumentAudioNode — effect operations", () => {
  test("addEffect creates a new effect on the node", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-11");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-11");
    composable.addEffect("balance");

    await nextTick();
    expect(composable.effects.value).toHaveLength(1);
    expect(composable.effects.value[0].type).toBe("balance");
  });

  test("addEffect enforces one instance per type", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-12");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-12");
    composable.addEffect("fadeOut");
    composable.addEffect("fadeOut");

    await nextTick();
    expect(composable.effects.value).toHaveLength(1);
  });

  test("removeEffect removes by effectId", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-13");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-13");
    composable.addEffect("gain");
    composable.addEffect("balance");

    await nextTick();
    const gainId = composable.effects.value[0].id;
    composable.removeEffect(gainId);

    await nextTick();
    expect(composable.effects.value).toHaveLength(1);
    expect(composable.effects.value[0].type).toBe("balance");
  });

  test("reorderEffects swaps positions", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-14");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-14");
    composable.addEffect("gain");
    composable.addEffect("fadeIn");
    composable.addEffect("fadeOut");

    await nextTick();
    composable.reorderEffects(0, 2);

    await nextTick();
    expect(composable.effects.value.map((e) => e.type)).toEqual(["fadeIn", "fadeOut", "gain"]);
  });

  test("setEffects replaces all effects", async () => {
    const node = createInstrumentNode("Piano", "piano", "inst-15");
    store.nodesById.set(node.id, node);

    const composable = useInstrumentAudioNode("inst-15");
    composable.addEffect("gain");
    composable.setEffects([{ id: "custom-1", type: "balance", enabled: true, value: -0.5 }]);

    await nextTick();
    expect(composable.effects.value).toHaveLength(1);
    expect(composable.effects.value[0].id).toBe("custom-1");
  });
});
