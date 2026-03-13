import Dexie, { type Table } from "dexie";
import type {
  MusicInstrumentId,
  NoteDuration,
  OctaveRange,
} from "../music/instruments";
import type { AudioEffect } from "../../features/effects/types";
import type { PlacedNote, TimeSignature } from "../../features/nodes/instrument/instrument-node";

// ─── Record interfaces (v2 schema) ───────────────────────────────────────────

/** Metadata-only project record (no binary data). */
export interface ProjectRecord {
  id: string;
  name: string;
  author: string;
  genre: string;
  tags: string[];
  description: string;
  createdAt: Date;
  updatedAt: Date;
  /** Approximate total size of all audio blobs for this project (bytes). */
  sizeBytes: number;
  /** Total project duration in seconds. */
  durationSeconds: number;
  bpm: number;
  sampleRate: number;
  /** Ordered root-level node IDs (top-level of the node tree). */
  rootIds: string[];
  /** Post-processing effects applied to the full timeline mix. */
  timelineEffects: AudioEffect[];
}

/**
 * Per-project node record.
 *
 * Covers all three node kinds (folder / recorded / instrument).
 * Kind-specific fields are present only for the appropriate kind.
 */
export interface NodeRecord {
  id: string;
  projectId: string;
  kind: "folder" | "recorded" | "instrument";
  name: string;

  // ── Folder-specific ──────────────────────────────────────────────────────
  /** Ordered child node IDs. Present only when kind === "folder". */
  childIds?: string[];

  // ── Recorded + Instrument common ─────────────────────────────────────────
  /** Effects applied during playback of this node. */
  effects?: AudioEffect[];

  // ── Recorded-specific ────────────────────────────────────────────────────
  /** Reference to AudioBlobRecord.id — present only for recorded nodes with a buffer. */
  audioBlobId?: string;
  /** True while actively recording (persisted so UI can show stale-recording warning). */
  isRecording?: boolean;

  // ── Instrument-specific ──────────────────────────────────────────────────
  instrumentId?: MusicInstrumentId;
  bpm?: number;
  timeSignature?: TimeSignature;
  notes?: PlacedNote[];
  selectedNoteType?: NoteDuration;
  pitchScrollTop?: number;
  showWaveform?: boolean;
  octaveRange?: OctaveRange;
}

/**
 * Per-project timeline track record.
 *
 * In the v2 model a Track is purely a timeline row; audio-source data lives in
 * NodeRecord.  The old v1 TrackRecord conflated the two — these records are
 * incompatible and old data is dropped on the first save with the new code.
 */
export interface TrackRecord {
  id: string;
  projectId: string;
  name: string;
  height: number;
  muted: boolean;
  locked: boolean;
  /** Track volume multiplier 0–3. Default: 1. */
  volume: number;
  /** Stereo balance -1 (left) to 1 (right). Default: 0. */
  balance: number;
  /** Ordering index within the project. */
  sortOrder: number;
}

/**
 * Per-track segment record (replaces the v1 SequenceRecord).
 *
 * A Segment is a node-instance placed at a specific time on a Track.
 */
export interface SegmentRecord {
  id: string;
  trackId: string;
  projectId: string;
  /** References NodeRecord.id — must be "recorded" or "instrument" kind. */
  nodeId: string;
  time: number;
  trimStart: number;
  trimEnd: number;
}

/** Binary audio data stored separately from metadata for fast project listing. */
export interface AudioBlobRecord {
  id: string;
  projectId: string;
  sampleRate: number;
  numberOfChannels: number;
  lengthInFrames: number;
  /** Each channel stored as a Blob (Float32Array converted to Blob). */
  channelData: Blob[];
}

// ─── Database ─────────────────────────────────────────────────────────────────

class AudaciouslyDB extends Dexie {
  projects!: Table<ProjectRecord, string>;
  nodes!: Table<NodeRecord, string>;
  tracks!: Table<TrackRecord, string>;
  segments!: Table<SegmentRecord, string>;
  audioBlobs!: Table<AudioBlobRecord, string>;

  constructor() {
    super("audaciously");

    // ── Version 1 (legacy) ──────────────────────────────────────────────────
    // Kept so Dexie can apply the v1→v2 upgrade without errors.
    this.version(1).stores({
      projects: "id, updatedAt",
      tracks: "id, projectId",
      sequences: "id, trackId, projectId",
      audioBlobs: "id, projectId",
    });

    // ── Version 2 (current) ──────────────────────────────────────────────────
    // Changes from v1:
    //   • Add `nodes`    table (audio sources — folder/recorded/instrument).
    //   • Repurpose `tracks` table to timeline rows only (new schema).
    //   • Add `segments` table (replaces `sequences`).
    //   • Drop `sequences` table (omitted → Dexie deletes it on upgrade).
    //   • `projects` table gains non-indexed `rootIds` and `timelineEffects` fields.
    //   • `audioBlobs` table is unchanged.
    this.version(2).stores({
      projects: "id, updatedAt",
      nodes: "id, projectId",
      tracks: "id, projectId",
      segments: "id, trackId, projectId, nodeId",
      audioBlobs: "id, projectId",
      // `sequences` intentionally omitted → Dexie drops it during upgrade.
    });
  }
}

/** Singleton database instance. */
export const db = new AudaciouslyDB();
