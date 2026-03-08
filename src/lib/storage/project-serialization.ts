import { nanoid } from "nanoid";
import type { AudioTrack } from "../audio/track";
import type { InstrumentAudioTrack } from "../audio/track/instrument";
import type { BufferedAudioSequence } from "../audio/sequence";
import { createRecordedTrack } from "../audio/track/recorded/recorded-track";
import { createRecordedSequence } from "../audio/sequence/recorded/recorded-sequence";
import { createInstrumentTrack } from "../audio/track/instrument/instrument-track";
import type { TrackRecord, SequenceRecord } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Reference to an AudioBuffer that needs to be stored as an AudioBlobRecord. */
export interface AudioBlobRef {
  id: string;
  buffer: AudioBuffer;
}

/** Flat DB-ready records produced by serialization. */
export interface SerializedProjectData {
  tracks: TrackRecord[];
  sequences: SequenceRecord[];
  /** AudioBuffers to be stored in the audioBlobs table. */
  audioBlobs: AudioBlobRef[];
}

/** Live domain objects produced by deserialization. */
export interface DeserializedProjectData {
  tracks: AudioTrack<any>[];
}

// ─── Serialize ────────────────────────────────────────────────────────────────

/**
 * Convert the player's live domain objects into flat DB records.
 *
 * - Recorded tracks: each sequence's AudioBuffer is extracted with a fresh
 *   `audioBlobId` so the caller can persist it to the audioBlobs table.
 * - Instrument tracks: only note data / settings are stored. Sequences are
 *   NOT serialized because they are regenerable from notes + bpm + instrumentId.
 */
export function serializeProject(
  projectId: string,
  tracks: Iterable<AudioTrack<any>>,
): SerializedProjectData {
  const trackRecords: TrackRecord[] = [];
  const sequenceRecords: SequenceRecord[] = [];
  const audioBlobs: AudioBlobRef[] = [];
  let sortOrder = 0;

  for (const track of tracks) {
    const trackRecord: TrackRecord = {
      id: track.id,
      projectId,
      kind: track.kind as "recorded" | "instrument",
      name: track.name,
      volume: track.volume,
      balance: track.balance,
      muted: track.muted,
      locked: track.locked,
      sortOrder: sortOrder++,
    };

    if (track.kind === "instrument") {
      const instr = track as InstrumentAudioTrack;
      trackRecord.instrumentId = instr.instrumentId;
      trackRecord.bpm = instr.bpm;
      trackRecord.timeSignature = { ...instr.timeSignature };
      trackRecord.notes = instr.notes.map((n) => ({ ...n }));
      trackRecord.selectedNoteType = instr.selectedNoteType;
      trackRecord.pitchScrollTop = instr.pitchScrollTop;
      trackRecord.showWaveform = instr.showWaveform;
      trackRecord.octaveRange = { ...instr.octaveRange };
    } else if (track.kind === "recorded") {
      for (const seq of track.getSequences()) {
        const buffered = seq as BufferedAudioSequence<any>;
        const audioBlobId = nanoid();

        sequenceRecords.push({
          id: seq.id,
          trackId: track.id,
          projectId,
          time: seq.time,
          playbackRate: seq.playbackRate,
          audioBlobId,
        });

        audioBlobs.push({ id: audioBlobId, buffer: buffered.buffer });
      }
    }

    trackRecords.push(trackRecord);
  }

  return { tracks: trackRecords, sequences: sequenceRecords, audioBlobs };
}

// ─── Deserialize ──────────────────────────────────────────────────────────────

/**
 * Reconstruct live domain objects from DB records.
 *
 * **Must be called from within a Vue `effectScope()` or component `setup()`**
 * because `createInstrumentTrack` uses Vue reactivity internally.
 *
 * @param trackRecords  - Track rows from the DB, any order.
 * @param sequenceRecords - Sequence rows from the DB.
 * @param audioBuffers  - Map of `audioBlobId → AudioBuffer` (pre-deserialized).
 */
export function deserializeProject(
  trackRecords: TrackRecord[],
  sequenceRecords: SequenceRecord[],
  audioBuffers: Map<string, AudioBuffer>,
): DeserializedProjectData {
  const sorted = [...trackRecords].sort((a, b) => a.sortOrder - b.sortOrder);

  // Group sequences by track ID for efficient lookup.
  const seqByTrack = new Map<string, SequenceRecord[]>();
  for (const seq of sequenceRecords) {
    const list = seqByTrack.get(seq.trackId);
    if (list) {
      list.push(seq);
    } else {
      seqByTrack.set(seq.trackId, [seq]);
    }
  }

  const tracks: AudioTrack<any>[] = [];

  for (const record of sorted) {
    const track = deserializeTrack(record, seqByTrack, audioBuffers);
    if (track) {
      tracks.push(track);
    }
  }

  return { tracks };
}

// ─── Internals ────────────────────────────────────────────────────────────────

function deserializeTrack(
  record: TrackRecord,
  seqByTrack: Map<string, SequenceRecord[]>,
  audioBuffers: Map<string, AudioBuffer>,
): AudioTrack<any> | null {
  if (record.kind === "recorded") {
    return deserializeRecordedTrack(record, seqByTrack, audioBuffers);
  }

  if (record.kind === "instrument") {
    return deserializeInstrumentTrack(record);
  }

  return null;
}

function deserializeRecordedTrack(
  record: TrackRecord,
  seqByTrack: Map<string, SequenceRecord[]>,
  audioBuffers: Map<string, AudioBuffer>,
): AudioTrack<any> {
  const track = createRecordedTrack(record.name);
  applyCommonTrackProps(track, record);

  const seqs = seqByTrack.get(record.id) ?? [];
  for (const seqRecord of seqs) {
    if (!seqRecord.audioBlobId) continue;

    const buffer = audioBuffers.get(seqRecord.audioBlobId);
    if (!buffer) continue;

    const seq = createRecordedSequence(buffer, seqRecord.time);
    seq.playbackRate = seqRecord.playbackRate ?? 1;
    track.addSequence(seq);
  }

  return track;
}

function deserializeInstrumentTrack(
  record: TrackRecord,
): AudioTrack<any> | null {
  if (!record.instrumentId) return null;

  const track = createInstrumentTrack(record.name, record.instrumentId);
  applyCommonTrackProps(track, record);

  // Apply instrument-specific state. Setting these synchronously ensures
  // Vue batches the reactive updates into a single synth render.
  if (record.bpm !== undefined) track.bpm = record.bpm;
  if (record.timeSignature) track.timeSignature = record.timeSignature;
  if (record.notes) track.notes = record.notes;
  if (record.selectedNoteType) track.selectedNoteType = record.selectedNoteType;
  if (record.pitchScrollTop !== undefined) track.pitchScrollTop = record.pitchScrollTop;
  if (record.showWaveform !== undefined) track.showWaveform = record.showWaveform;

  return track;
}

function applyCommonTrackProps(track: AudioTrack<any>, record: TrackRecord): void {
  track.volume = record.volume;
  track.balance = record.balance;
  track.muted = record.muted;
  track.locked = record.locked;
}
