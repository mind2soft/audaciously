import { nanoid } from "nanoid";
import type { InstrumentNode, RecordedNode } from "../../features/nodes";
import type { FolderNode } from "../../features/nodes/folder/folder-node";
import { createFolderNode } from "../../features/nodes/folder/folder-node";
import { createInstrumentNode } from "../../features/nodes/instrument/instrument-node";
import { createRecordedNode } from "../../features/nodes/recorded/recorded-node";
import { createSegment } from "../../features/sequence/segment";
import { createTrack } from "../../features/sequence/track";
import type { NodeTreeJSON } from "../../stores/nodes";
import type { SequenceJSON } from "../../stores/sequence";
import type { NodeRecord, SegmentRecord, TrackRecord } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Reference to an AudioBuffer that needs to be stored as an AudioBlobRecord. */
export interface AudioBlobRef {
  id: string;
  buffer: AudioBuffer;
}

/** Flat DB-ready records produced by serialization. */
export interface SerializedProjectData {
  nodes: NodeRecord[];
  tracks: TrackRecord[];
  segments: SegmentRecord[];
  /** AudioBuffers to be compressed and stored in the audioBlobs table. */
  audioBlobs: AudioBlobRef[];
}

/** Live store JSON produced by deserialization. */
export interface DeserializedProjectData {
  nodesJSON: NodeTreeJSON;
  sequenceJSON: SequenceJSON;
}

// ─── Serialize nodes ──────────────────────────────────────────────────────────

/**
 * Convert the node store's JSON snapshot into flat DB records.
 *
 * - FolderNodes: store childIds array.
 * - RecordedNodes: extract the AudioBuffer into a separate AudioBlobRef; the
 *   buffer is NOT stored in the NodeRecord itself.
 * - InstrumentNodes: store note data / settings only. The synthesised buffer is
 *   NOT stored because it is regenerable from notes + bpm + instrumentId.
 */
export function serializeNodes(
  projectId: string,
  nodesJSON: NodeTreeJSON,
): { nodeRecords: NodeRecord[]; audioBlobs: AudioBlobRef[] } {
  const nodeRecords: NodeRecord[] = [];
  const audioBlobs: AudioBlobRef[] = [];

  for (const node of Object.values(nodesJSON.nodesById)) {
    if (node.kind === "folder") {
      const folder = node as FolderNode;
      nodeRecords.push({
        id: folder.id,
        projectId,
        kind: "folder",
        name: folder.name,
        childIds: [...folder.childIds],
      });
    } else if (node.kind === "recorded") {
      const recorded = node as RecordedNode;
      let audioBlobId: string | undefined;

      if (recorded.sourceBuffer) {
        audioBlobId = nanoid();
        audioBlobs.push({ id: audioBlobId, buffer: recorded.sourceBuffer });
      }

      nodeRecords.push({
        id: recorded.id,
        projectId,
        kind: "recorded",
        name: recorded.name,
        effects: recorded.effects.length > 0 ? [...recorded.effects] : undefined,
        audioBlobId,
        isRecording: recorded.isRecording || undefined,
      });
    } else if (node.kind === "instrument") {
      const instr = node as InstrumentNode;
      nodeRecords.push({
        id: instr.id,
        projectId,
        kind: "instrument",
        name: instr.name,
        effects: instr.effects.length > 0 ? [...instr.effects] : undefined,
        instrumentId: instr.instrumentType,
        bpm: instr.bpm,
        timeSignature: { ...instr.timeSignature },
        notes: instr.notes.length > 0 ? [...instr.notes] : undefined,
        selectedNoteType: instr.selectedNoteType,
        pitchScrollTop: instr.pitchScrollTop,
        showWaveform: instr.showWaveform || undefined,
        octaveRange: { ...instr.octaveRange },
      });
    }
  }

  return { nodeRecords, audioBlobs };
}

// ─── Serialize sequence ───────────────────────────────────────────────────────

/**
 * Convert the sequence store's JSON snapshot into flat DB records.
 *
 * Produces TrackRecords (timeline rows) and SegmentRecords (node placements).
 * The timelineEffects are NOT stored here; they live in the ProjectRecord.
 */
export function serializeSequence(
  projectId: string,
  sequenceJSON: SequenceJSON,
): { trackRecords: TrackRecord[]; segmentRecords: SegmentRecord[] } {
  const trackRecords: TrackRecord[] = [];
  const segmentRecords: SegmentRecord[] = [];

  for (const track of sequenceJSON.tracks) {
    trackRecords.push({
      id: track.id,
      projectId,
      name: track.name,
      height: track.height,
      muted: track.muted,
      locked: track.locked,
      volume: track.volume,
      balance: track.balance,
      sortOrder: track.sortOrder,
    });

    for (const seg of track.segments) {
      segmentRecords.push({
        id: seg.id,
        trackId: track.id,
        projectId,
        nodeId: seg.nodeId,
        time: seg.time,
        trimStart: seg.trimStart,
        trimEnd: seg.trimEnd,
      });
    }
  }

  return { trackRecords, segmentRecords };
}

// ─── Deserialize nodes ────────────────────────────────────────────────────────

/**
 * Reconstruct the NodeTreeJSON from DB records and pre-deserialized AudioBuffers.
 *
 * @param nodeRecords   - NodeRecord rows from the DB (any order).
 * @param rootIds       - Ordered root-level node IDs (from ProjectRecord.rootIds).
 * @param audioBuffers  - Map of audioBlobId → AudioBuffer (pre-decompressed).
 */
export function deserializeNodes(
  nodeRecords: NodeRecord[],
  rootIds: string[],
  audioBuffers: Map<string, AudioBuffer>,
): Pick<NodeTreeJSON, "nodesById" | "rootIds"> {
  const nodesById: Record<string, import("../../features/nodes").ProjectNode> = {};

  for (const record of nodeRecords) {
    if (record.kind === "folder") {
      const node = createFolderNode(record.name, record.id);
      if (record.childIds) {
        node.childIds.push(...record.childIds);
      }
      nodesById[record.id] = node;
    } else if (record.kind === "recorded") {
      const node = createRecordedNode(record.name, record.id);
      if (record.effects) node.effects = [...record.effects];
      if (record.audioBlobId) {
        node.sourceBuffer = audioBuffers.get(record.audioBlobId) ?? null;
      }
      nodesById[record.id] = node;
    } else if (record.kind === "instrument") {
      if (!record.instrumentId) continue; // Corrupt record — skip.

      const node = createInstrumentNode(record.name, record.instrumentId, record.id);
      if (record.effects) node.effects = [...record.effects];
      if (record.bpm !== undefined) node.bpm = record.bpm;
      if (record.timeSignature) node.timeSignature = { ...record.timeSignature };
      if (record.notes) node.notes = [...record.notes];
      if (record.selectedNoteType) node.selectedNoteType = record.selectedNoteType;
      if (record.pitchScrollTop !== undefined) node.pitchScrollTop = record.pitchScrollTop;
      if (record.showWaveform !== undefined) node.showWaveform = record.showWaveform;
      if (record.octaveRange) node.octaveRange = { ...record.octaveRange };
      nodesById[record.id] = node;
    }
  }

  return {
    nodesById,
    rootIds: rootIds.length > 0 ? rootIds : Object.keys(nodesById),
  };
}

// ─── Deserialize sequence ─────────────────────────────────────────────────────

/**
 * Reconstruct SequenceJSON tracks from DB records.
 *
 * @param trackRecords   - TrackRecord rows from the DB (any order).
 * @param segmentRecords - SegmentRecord rows from the DB.
 */
export function deserializeSequence(
  trackRecords: TrackRecord[],
  segmentRecords: SegmentRecord[],
): Pick<SequenceJSON, "tracks"> {
  // Sort tracks by sortOrder for consistent display order.
  const sorted = [...trackRecords].sort((a, b) => a.sortOrder - b.sortOrder);

  // Group segments by track ID for efficient lookup.
  const segsByTrack = new Map<string, SegmentRecord[]>();
  for (const seg of segmentRecords) {
    const list = segsByTrack.get(seg.trackId);
    if (list) {
      list.push(seg);
    } else {
      segsByTrack.set(seg.trackId, [seg]);
    }
  }

  const tracks = sorted.map((record) => {
    const track = createTrack(record.name, record.id);
    track.height = record.height;
    track.muted = record.muted;
    track.locked = record.locked;
    track.volume = record.volume;
    track.balance = record.balance;
    track.sortOrder = record.sortOrder;

    const segs = segsByTrack.get(record.id) ?? [];
    // Sort segments by time for consistent rendering order.
    segs.sort((a, b) => a.time - b.time);
    track.segments = segs.map((s) => {
      const seg = createSegment(s.nodeId, s.time, s.id);
      seg.trimStart = s.trimStart;
      seg.trimEnd = s.trimEnd;
      return seg;
    });

    return track;
  });

  return { tracks };
}
