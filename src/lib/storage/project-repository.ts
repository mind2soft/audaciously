import { nanoid } from "nanoid";
import type { AudioPlayer } from "../audio/player";
import type { ProjectMetadata } from "./project-metadata";
import {
  db,
  type ProjectRecord,
  type AudioBlobRecord,
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
