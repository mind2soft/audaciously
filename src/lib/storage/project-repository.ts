import { nanoid } from "nanoid";
import type { AudioPlayer } from "../audio/player";
import type { ProjectMetadata } from "./project-metadata";
import type { AudioTrackJSON } from "../audio/track";
import type { AudioSequenceJSON } from "../audio/sequence";
import {
  db,
  type ProjectRecord,
  type AudioBlobRecord,
  type TrackRecord,
  type SequenceRecord,
} from "./db";
import {
  serializeProject,
  deserializeProject,
  type DeserializedProjectData,
} from "./project-serialization";
import {
  compressFloat32Array,
  decompressBlobToFloat32Array,
} from "./compression";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Lightweight project info for list display (no audio data). */
export interface ProjectSummary {
  id: string;
  name: string;
  author: string;
  genre: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  sizeBytes: number;
  durationSeconds: number;
  trackCount: number;
}

/** Result of loading a project from IndexedDB. */
export interface LoadedProject {
  record: ProjectRecord;
  data: DeserializedProjectData;
}

// ─── Save ─────────────────────────────────────────────────────────────────────

/**
 * Serialize and persist a project to IndexedDB.
 *
 * Audio buffers from recorded tracks are DEFLATE-compressed via fflate's
 * worker pool before storage. Instrument track buffers are NOT stored
 * (regenerable from notes + bpm + instrumentId).
 *
 * The operation is a full replace: old data for this projectId is deleted
 * and rewritten inside a single Dexie transaction.
 */
export async function saveProject(
  projectId: string,
  player: AudioPlayer,
  metadata: ProjectMetadata,
): Promise<void> {
  const tracks = [...player.getTracks()];
  const serialized = serializeProject(projectId, tracks);

  // Compress audio buffers in parallel (fflate worker pool).
  const audioBlobRecords: AudioBlobRecord[] = await Promise.all(
    serialized.audioBlobs.map(async (ref) => {
      const { sampleRate, numberOfChannels, length } = ref.buffer;
      const channelData: Blob[] = [];

      for (let ch = 0; ch < numberOfChannels; ch++) {
        channelData.push(
          await compressFloat32Array(ref.buffer.getChannelData(ch)),
        );
      }

      return {
        id: ref.id,
        projectId,
        sampleRate,
        numberOfChannels,
        lengthInFrames: length,
        channelData,
      } satisfies AudioBlobRecord;
    }),
  );

  // Derive project-level bpm from first instrument track, or default.
  const bpm =
    serialized.tracks.find((t) => t.kind === "instrument")?.bpm ?? 120;

  // Derive sampleRate from first audio blob, or default.
  const sampleRate = audioBlobRecords[0]?.sampleRate ?? 44100;

  // Compute total compressed size.
  const sizeBytes = audioBlobRecords.reduce(
    (sum, rec) =>
      sum + rec.channelData.reduce((s, blob) => s + blob.size, 0),
    0,
  );

  const now = new Date();

  // Full replace inside a single transaction.
  await db.transaction(
    "rw",
    db.projects,
    db.tracks,
    db.sequences,
    db.audioBlobs,
    async () => {
      // Preserve createdAt from existing record (if updating).
      const existing = await db.projects.get(projectId);

      const projectRecord: ProjectRecord = {
        id: projectId,
        name: metadata.name,
        author: metadata.author,
        genre: metadata.genre,
        tags: [...metadata.tags],
        description: metadata.description,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        sizeBytes,
        durationSeconds: player.totalDuration,
        bpm,
        sampleRate,
      };

      // Delete old data for this project.
      await Promise.all([
        db.tracks.where("projectId").equals(projectId).delete(),
        db.sequences.where("projectId").equals(projectId).delete(),
        db.audioBlobs.where("projectId").equals(projectId).delete(),
      ]);

      // Write new data.
      await db.projects.put(projectRecord);

      if (serialized.tracks.length > 0) {
        await db.tracks.bulkPut(serialized.tracks);
      }
      if (serialized.sequences.length > 0) {
        await db.sequences.bulkPut(serialized.sequences);
      }
      if (audioBlobRecords.length > 0) {
        await db.audioBlobs.bulkPut(audioBlobRecords);
      }
    },
  );
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load a project from IndexedDB and reconstruct live domain objects.
 *
 * Compressed audio blobs are decompressed via fflate's worker pool and
 * converted to AudioBuffers using the provided audio context.
 *
 * **Must be called from a Vue `effectScope()` or component `setup()`**
 * because `deserializeProject` creates instrument tracks that use Vue
 * reactivity internally.
 *
 * Returns `null` if no project with the given ID exists.
 */
export async function loadProject(
  id: string,
  audioContext: BaseAudioContext,
): Promise<LoadedProject | null> {
  const record = await db.projects.get(id);
  if (!record) return null;

  const [trackRecords, sequenceRecords, audioBlobRecords] = await Promise.all([
    db.tracks.where("projectId").equals(id).toArray(),
    db.sequences.where("projectId").equals(id).toArray(),
    db.audioBlobs.where("projectId").equals(id).toArray(),
  ]);

  // Decompress audio blobs → AudioBuffers (parallel, worker pool).
  const audioBuffers = new Map<string, AudioBuffer>();

  await Promise.all(
    audioBlobRecords.map(async (rec) => {
      const channels = await Promise.all(
        rec.channelData.map(decompressBlobToFloat32Array),
      );

      const buffer = audioContext.createBuffer(
        rec.numberOfChannels,
        rec.lengthInFrames,
        rec.sampleRate,
      );

      for (let ch = 0; ch < rec.numberOfChannels; ch++) {
        buffer.copyToChannel(
          channels[ch] as Float32Array<ArrayBuffer>,
          ch,
        );
      }

      audioBuffers.set(rec.id, buffer);
    }),
  );

  const data = deserializeProject(trackRecords, sequenceRecords, audioBuffers);

  return { record, data };
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * List all projects as lightweight summaries (no audio data loaded).
 *
 * Returns most-recently-updated first.
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = await db.projects.orderBy("updatedAt").reverse().toArray();

  return Promise.all(
    projects.map(
      async (p): Promise<ProjectSummary> => ({
        id: p.id,
        name: p.name,
        author: p.author,
        genre: p.genre,
        tags: p.tags,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        sizeBytes: p.sizeBytes,
        durationSeconds: p.durationSeconds,
        trackCount: await db.tracks
          .where("projectId")
          .equals(p.id)
          .count(),
      }),
    ),
  );
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a project and all related tracks, sequences, and audio blobs.
 *
 * Idempotent — succeeds silently if the project does not exist.
 */
export async function deleteProject(id: string): Promise<void> {
  await db.transaction(
    "rw",
    db.projects,
    db.tracks,
    db.sequences,
    db.audioBlobs,
    async () => {
      await Promise.all([
        db.tracks.where("projectId").equals(id).delete(),
        db.sequences.where("projectId").equals(id).delete(),
        db.audioBlobs.where("projectId").equals(id).delete(),
        db.projects.delete(id),
      ]);
    },
  );
}

// ─── Duplicate ────────────────────────────────────────────────────────────────

/**
 * Create a deep copy of a project with fresh IDs.
 *
 * Audio blobs are copied as-is (no decompression / recompression needed).
 * Returns the new project ID, or `null` if the source does not exist.
 */
export async function duplicateProject(id: string): Promise<string | null> {
  const project = await db.projects.get(id);
  if (!project) return null;

  const [tracks, sequences, audioBlobs] = await Promise.all([
    db.tracks.where("projectId").equals(id).toArray(),
    db.sequences.where("projectId").equals(id).toArray(),
    db.audioBlobs.where("projectId").equals(id).toArray(),
  ]);

  const newProjectId = nanoid();
  const trackIdMap = new Map<string, string>();
  const blobIdMap = new Map<string, string>();

  const newTracks = tracks.map((t) => {
    const newId = nanoid();
    trackIdMap.set(t.id, newId);
    return { ...t, id: newId, projectId: newProjectId };
  });

  const newBlobs = audioBlobs.map((b) => {
    const newId = nanoid();
    blobIdMap.set(b.id, newId);
    return { ...b, id: newId, projectId: newProjectId };
  });

  const newSequences = sequences.map((s) => ({
    ...s,
    id: nanoid(),
    projectId: newProjectId,
    trackId: trackIdMap.get(s.trackId) ?? s.trackId,
    audioBlobId: s.audioBlobId
      ? (blobIdMap.get(s.audioBlobId) ?? s.audioBlobId)
      : undefined,
  }));

  const now = new Date();
  const newProject: ProjectRecord = {
    ...project,
    id: newProjectId,
    name: `${project.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction(
    "rw",
    db.projects,
    db.tracks,
    db.sequences,
    db.audioBlobs,
    async () => {
      await db.projects.put(newProject);
      if (newTracks.length > 0) await db.tracks.bulkPut(newTracks);
      if (newSequences.length > 0) await db.sequences.bulkPut(newSequences);
      if (newBlobs.length > 0) await db.audioBlobs.bulkPut(newBlobs);
    },
  );

  return newProjectId;
}

// ─── Size ─────────────────────────────────────────────────────────────────────

/**
 * Calculate the total size (in bytes) of all compressed audio blobs for a
 * project.
 */
export async function getProjectSize(id: string): Promise<number> {
  const blobs = await db.audioBlobs.where("projectId").equals(id).toArray();
  let total = 0;

  for (const rec of blobs) {
    for (const blob of rec.channelData) {
      total += blob.size;
    }
  }

  return total;
}

// ─── Metadata Update ──────────────────────────────────────────────────────────

/**
 * Update only the user-editable metadata fields of a project without
 * touching tracks, sequences, or audio blobs.
 */
export async function updateProjectMetadata(
  id: string,
  metadata: Partial<ProjectMetadata>,
): Promise<void> {
  await db.projects.update(id, {
    ...metadata,
    updatedAt: new Date(),
  });
}

// ─── Granular track / sequence ops ───────────────────────────────────────────
//
// These are used by the auto-save path when only part of a project has changed,
// avoiding the expensive full-replace (and re-compression) of saveProject().

/**
 * Insert or replace a single track record.
 * Also bumps `projects.updatedAt` in the same transaction.
 */
export async function upsertTrackRecord(
  projectId: string,
  trackJSON: AudioTrackJSON,
  sortOrder: number,
): Promise<void> {
  const record: TrackRecord = {
    ...(trackJSON as unknown as TrackRecord),
    projectId,
    sortOrder,
  };

  await db.transaction("rw", db.projects, db.tracks, async () => {
    await db.tracks.put(record);
    await db.projects.update(projectId, { updatedAt: new Date() });
  });
}

/**
 * Delete a single track record (and its sequences) for a project.
 * Also bumps `projects.updatedAt`.
 */
export async function deleteTrackRecord(
  projectId: string,
  trackId: string,
): Promise<void> {
  await db.transaction(
    "rw",
    db.projects,
    db.tracks,
    db.sequences,
    db.audioBlobs,
    async () => {
      // Collect sequence IDs so we can delete their audio blobs too.
      const seqs = await db.sequences.where("trackId").equals(trackId).toArray();
      const blobIds = seqs
        .map((s) => s.audioBlobId)
        .filter((id): id is string => !!id);

      await Promise.all([
        db.tracks.delete(trackId),
        db.sequences.where("trackId").equals(trackId).delete(),
        ...(blobIds.length > 0
          ? [db.audioBlobs.bulkDelete(blobIds)]
          : []),
      ]);

      await db.projects.update(projectId, { updatedAt: new Date() });
    },
  );
}

/**
 * Insert or replace a single sequence record (properties only, no audio blob).
 * Use `upsertAudioBlob` when the buffer itself has changed.
 * Also bumps `projects.updatedAt`.
 */
export async function upsertSequenceRecord(
  projectId: string,
  trackId: string,
  seqJSON: AudioSequenceJSON,
): Promise<void> {
  const record: SequenceRecord = {
    id: seqJSON.id,
    trackId,
    projectId,
    time: seqJSON.time,
    playbackRate: seqJSON.playbackRate,
  };

  await db.transaction("rw", db.projects, db.sequences, async () => {
    await db.sequences.put(record);
    await db.projects.update(projectId, { updatedAt: new Date() });
  });
}

/**
 * Delete a single sequence record (and its audio blob if any).
 * Also bumps `projects.updatedAt`.
 */
export async function deleteSequenceRecord(
  projectId: string,
  sequenceId: string,
): Promise<void> {
  await db.transaction(
    "rw",
    db.projects,
    db.sequences,
    db.audioBlobs,
    async () => {
      const seq = await db.sequences.get(sequenceId);

      await db.sequences.delete(sequenceId);

      if (seq?.audioBlobId) {
        await db.audioBlobs.delete(seq.audioBlobId);
      }

      await db.projects.update(projectId, { updatedAt: new Date() });
    },
  );
}

/**
 * Compress and store the AudioBuffer for a recorded sequence.
 *
 * If a blob already exists for this sequence it is replaced in-place (same
 * `audioBlobId`).  Otherwise a new blob ID is minted and the sequence record
 * is updated to reference it.
 *
 * This is the slow path — called only when `DirtySequence.buffer === true`.
 */
export async function upsertAudioBlob(
  projectId: string,
  trackId: string,
  seqJSON: AudioSequenceJSON,
  buffer: AudioBuffer,
): Promise<void> {
  // Compress all channels in parallel.
  const { sampleRate, numberOfChannels, length } = buffer;
  const channelData: Blob[] = await Promise.all(
    Array.from({ length: numberOfChannels }, (_, ch) =>
      compressFloat32Array(buffer.getChannelData(ch)),
    ),
  );

  await db.transaction(
    "rw",
    db.projects,
    db.sequences,
    db.audioBlobs,
    async () => {
      // Re-use existing audioBlobId or mint a new one.
      const existing = await db.sequences.get(seqJSON.id);
      const audioBlobId = existing?.audioBlobId ?? nanoid();

      const blobRecord: AudioBlobRecord = {
        id: audioBlobId,
        projectId,
        sampleRate,
        numberOfChannels,
        lengthInFrames: length,
        channelData,
      };

      const seqRecord: SequenceRecord = {
        id: seqJSON.id,
        trackId,
        projectId,
        time: seqJSON.time,
        playbackRate: seqJSON.playbackRate,
        audioBlobId,
      };

      await Promise.all([
        db.audioBlobs.put(blobRecord),
        db.sequences.put(seqRecord),
      ]);

      await db.projects.update(projectId, { updatedAt: new Date() });
    },
  );
}
