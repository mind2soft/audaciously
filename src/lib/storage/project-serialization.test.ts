// lib/storage/project-serialization.test.ts
// Tests that serializeNodes correctly handles AudioBuffers resolved from the
// audio-buffer-repository, and that the serialization process does NOT mutate
// source buffer data.

import { afterEach, describe, expect, test } from "vitest";
import type { ProjectNode } from "../../features/nodes";
import type { NodeTreeJSON } from "../../stores/nodes";
import { clearAllBuffers, registerBuffer } from "../audio/audio-buffer-repository";
import { serializeNodes } from "./project-serialization";

// ── Stubs ────────────────────────────────────────────────────────────────────

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
    copyToChannel(source: Float32Array, ch: number) {
      channelData[ch].set(source);
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

function makeNodesJSON(nodesById: Record<string, ProjectNode>, rootIds: string[]): NodeTreeJSON {
  return { nodesById, rootIds, selectedNodeId: null } as NodeTreeJSON;
}

afterEach(() => {
  clearAllBuffers();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("serializeNodes — source buffer immutability", () => {
  test("serialization does not mutate recorded node sourceBuffer", () => {
    const ch0 = new Float32Array([0.1, 0.5, -0.3, 0.8]);
    const ch1 = new Float32Array([-0.1, -0.5, 0.3, -0.8]);
    const channels = [ch0, ch1];
    const snap = snapshot(channels);
    const buffer = createStubBuffer(channels);
    const sourceBufferId = registerBuffer(buffer, { pristine: true });

    const nodesJSON = makeNodesJSON(
      {
        "node-1": {
          id: "node-1",
          kind: "recorded",
          name: "Test Recording",
          sourceBufferId,
          targetBufferId: null,
          isRecording: false,
          effects: [],
        } as ProjectNode,
      },
      ["node-1"],
    );

    serializeNodes("project-1", nodesJSON);

    expectUnmutated(channels, snap);
  });

  test("serialized audioBlobs reference the SAME buffer object (aliasing)", () => {
    const ch0 = new Float32Array([1, 2, 3]);
    const buffer = createStubBuffer([ch0]);
    const sourceBufferId = registerBuffer(buffer, { pristine: true });

    const nodesJSON = makeNodesJSON(
      {
        "node-1": {
          id: "node-1",
          kind: "recorded",
          name: "Test",
          sourceBufferId,
          targetBufferId: null,
          isRecording: false,
          effects: [],
        } as ProjectNode,
      },
      ["node-1"],
    );

    const { audioBlobs } = serializeNodes("project-1", nodesJSON);

    // The audioBlobs entry references the SAME buffer — not a copy
    expect(audioBlobs).toHaveLength(1);
    expect(audioBlobs[0].buffer).toBe(buffer);
  });

  test("multiple recorded nodes: all source buffers survive serialization", () => {
    const ch0a = new Float32Array([0.1, 0.2, 0.3]);
    const ch0b = new Float32Array([0.4, 0.5, 0.6]);
    const bufferA = createStubBuffer([ch0a]);
    const bufferB = createStubBuffer([ch0b]);
    const snapA = new Float32Array(ch0a);
    const snapB = new Float32Array(ch0b);
    const idA = registerBuffer(bufferA, { pristine: true });
    const idB = registerBuffer(bufferB, { pristine: true });

    const nodesJSON = makeNodesJSON(
      {
        "node-a": {
          id: "node-a",
          kind: "recorded",
          name: "Recording A",
          sourceBufferId: idA,
          targetBufferId: null,
          isRecording: false,
          effects: [],
        } as ProjectNode,
        "node-b": {
          id: "node-b",
          kind: "recorded",
          name: "Recording B",
          sourceBufferId: idB,
          targetBufferId: null,
          isRecording: false,
          effects: [],
        } as ProjectNode,
      },
      ["node-a", "node-b"],
    );

    serializeNodes("project-1", nodesJSON);

    expect(ch0a).toEqual(snapA);
    expect(ch0b).toEqual(snapB);
  });

  test("recorded node with null sourceBufferId does not produce audioBlob", () => {
    const nodesJSON = makeNodesJSON(
      {
        "node-1": {
          id: "node-1",
          kind: "recorded",
          name: "Empty",
          sourceBufferId: null,
          targetBufferId: null,
          isRecording: false,
          effects: [],
        } as ProjectNode,
      },
      ["node-1"],
    );

    const { audioBlobs, nodeRecords } = serializeNodes("project-1", nodesJSON);

    expect(audioBlobs).toHaveLength(0);
    expect(nodeRecords[0].audioBlobId).toBeUndefined();
  });

  test("mixed node types: only recorded nodes produce audioBlobs, no mutation", () => {
    const ch0 = new Float32Array([0.7, 0.8, 0.9]);
    const snap = new Float32Array(ch0);
    const buffer = createStubBuffer([ch0]);
    const sourceBufferId = registerBuffer(buffer, { pristine: true });

    const nodesJSON = makeNodesJSON(
      {
        "folder-1": {
          id: "folder-1",
          kind: "folder",
          name: "Folder",
          childIds: ["node-rec"],
        } as ProjectNode,
        "node-rec": {
          id: "node-rec",
          kind: "recorded",
          name: "Recording",
          sourceBufferId,
          targetBufferId: null,
          isRecording: false,
          effects: [],
        } as ProjectNode,
        "node-inst": {
          id: "node-inst",
          kind: "instrument",
          name: "Instrument",
          instrumentType: "piano",
          targetBufferId: null,
          effects: [],
          bpm: 120,
          timeSignature: { beatsPerMeasure: 4, beatUnit: 4 },
          notes: [],
          selectedNoteType: "quarter",
          pitchScrollTop: 0,
          showWaveform: false,
          octaveRange: { low: 2, high: 6 },
        } as ProjectNode,
      },
      ["folder-1", "node-rec", "node-inst"],
    );

    const { audioBlobs } = serializeNodes("project-1", nodesJSON);

    expect(audioBlobs).toHaveLength(1);
    expect(ch0).toEqual(snap);
  });
});

// ── Compression aliasing risk ───────────────────────────────────────────────

describe("serializeNodes → compression aliasing risk", () => {
  test("audioBlob.buffer.getChannelData returns raw Float32Array (aliasing proof)", () => {
    const ch0 = new Float32Array([1, 2, 3, 4]);
    const buffer = createStubBuffer([ch0]);
    const sourceBufferId = registerBuffer(buffer, { pristine: true });

    const nodesJSON = makeNodesJSON(
      {
        "node-1": {
          id: "node-1",
          kind: "recorded",
          name: "Test",
          sourceBufferId,
          targetBufferId: null,
          isRecording: false,
          effects: [],
        } as ProjectNode,
      },
      ["node-1"],
    );

    const { audioBlobs } = serializeNodes("project-1", nodesJSON);

    // The compression path does: compressFloat32Array(ref.buffer.getChannelData(ch))
    // This returns the RAW Float32Array — same reference as ch0.
    const channelRef = audioBlobs[0].buffer.getChannelData(0);
    expect(channelRef).toBe(ch0); // same reference!

    // So compressFloat32Array receives the ACTUAL source data.
    // If compression modifies or detaches the ArrayBuffer, sourceBuffer is corrupted.
  });

  test("Uint8Array view on Float32Array shares ArrayBuffer (compression pattern)", () => {
    // Simulate what compressFloat32Array does:
    //   new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const sourceFloat = new Float32Array([1.0, 2.0, 3.0, 4.0]);
    const snapFloat = new Float32Array(sourceFloat);

    const uint8View = new Uint8Array(
      sourceFloat.buffer as ArrayBuffer,
      sourceFloat.byteOffset,
      sourceFloat.byteLength,
    );

    // Same ArrayBuffer
    expect(uint8View.buffer).toBe(sourceFloat.buffer);

    // Reading the Uint8Array doesn't mutate the Float32Array
    expect(uint8View.length).toBe(sourceFloat.byteLength);

    expect(sourceFloat).toEqual(snapFloat);
  });
});
