import Dexie, { type Table } from "dexie";
import type { MusicInstrumentId, NoteDuration, OctaveRange } from "../music/instruments";
import type { PlacedNote, TimeSignature } from "../audio/track/instrument";
import type { AudioEffect } from "../audio/sequence";

// ─── Record interfaces ────────────────────────────────────────────────────────

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
}

/** Per-project track record. Instrument-specific fields are present only when kind === "instrument". */
export interface TrackRecord {
  id: string;
  projectId: string;
  kind: "recorded" | "instrument";
  name: string;
  volume: number;
  balance: number;
  muted: boolean;
  locked: boolean;
  /** Ordering index within the project. */
  sortOrder: number;
  // ── Instrument-specific ───────────────────────────────────────────────────
  instrumentId?: MusicInstrumentId;
  bpm?: number;
  timeSignature?: TimeSignature;
  notes?: PlacedNote[];
  selectedNoteType?: NoteDuration;
  pitchScrollTop?: number;
  showWaveform?: boolean;
  octaveRange?: OctaveRange;
}

/** Per-track sequence record. Only recorded sequences reference an audio blob. */
export interface SequenceRecord {
  id: string;
  trackId: string;
  projectId: string;
  time: number;
  playbackRate: number;
  effects?: AudioEffect[];
  /** Reference to AudioBlobRecord.id — present only for recorded sequences. */
  audioBlobId?: string;
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
  tracks!: Table<TrackRecord, string>;
  sequences!: Table<SequenceRecord, string>;
  audioBlobs!: Table<AudioBlobRecord, string>;

  constructor() {
    super("audaciously");

    this.version(1).stores({
      projects: "id, updatedAt",
      tracks: "id, projectId",
      sequences: "id, trackId, projectId",
      audioBlobs: "id, projectId",
    });
  }
}

/** Singleton database instance. */
export const db = new AudaciouslyDB();
