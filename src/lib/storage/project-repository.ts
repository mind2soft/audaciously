import { nanoid } from "nanoid";
import type { NodeTreeJSON } from "../../stores/nodes";
import type { SequenceJSON } from "../../stores/sequence";
import { compressFloat32Array, decompressBlobToFloat32Array } from "./compression";
import {
  type AudioBlobRecord,
  db,
  type NodeRecord,
  type ProjectRecord,
  type SegmentRecord,
  type TrackRecord,
} from "./db";
import { type ProjectMetadata, serializeMetadata } from "./project-metadata";
import {
  type DeserializedProjectData,
  deserializeNodes,
  deserializeSequence,
  serializeNodes,
  serializeSequence,
} from "./project-serialization";

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
  nodeCount: number;
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
 * Audio buffers from recorded nodes are DEFLATE-compressed via fflate's worker
 * pool before storage. Instrument node buffers are NOT stored (regenerable from
 * notes + bpm + instrumentId).
 *
 * The operation is a full replace: old data for this projectId is deleted and
 * rewritten inside a single Dexie transaction.
 */
export async function saveProject(
  projectId: string,
  nodesJSON: NodeTreeJSON,
  sequenceJSON: SequenceJSON,
  metadata: ProjectMetadata,
  totalDuration: number,
): Promise<void> {
  const { nodeRecords, audioBlobs } = serializeNodes(projectId, nodesJSON);
  const { trackRecords, segmentRecords } = serializeSequence(projectId, sequenceJSON);

  // Compress audio buffers in parallel (fflate worker pool).
  const audioBlobRecords: AudioBlobRecord[] = await Promise.all(
    audioBlobs.map(async (ref) => {
      const { sampleRate, numberOfChannels, length } = ref.buffer;
      const channelData: Blob[] = [];

      for (let ch = 0; ch < numberOfChannels; ch++) {
        channelData.push(await compressFloat32Array(ref.buffer.getChannelData(ch)));
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

  // Derive project-level bpm from first instrument node, or default.
  const bpm = nodeRecords.find((n) => n.kind === "instrument")?.bpm ?? 120;

  // Derive sampleRate from first audio blob, or default.
  const sampleRate = audioBlobRecords[0]?.sampleRate ?? 44100;

  // Compute total compressed size.
  const sizeBytes = audioBlobRecords.reduce(
    (sum, rec) => sum + rec.channelData.reduce((s, blob) => s + blob.size, 0),
    0,
  );

  const now = new Date();

  // Full replace inside a single transaction.
  await db.transaction(
    "rw",
    [db.projects, db.nodes, db.tracks, db.segments, db.audioBlobs],
    async () => {
      // Preserve createdAt from existing record; null means brand-new project.
      const existing = await db.projects.get(projectId);

      const metadataSnapshot = serializeMetadata(metadata);
      const projectRecord: ProjectRecord = {
        id: projectId,
        ...metadataSnapshot,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        sizeBytes,
        durationSeconds: totalDuration,
        bpm,
        sampleRate,
        rootIds: [...nodesJSON.rootIds],
        timelineEffects: JSON.parse(JSON.stringify(sequenceJSON.timelineEffects ?? [])),
      };

      // Delete old data for this project.
      await Promise.all([
        db.nodes.where("projectId").equals(projectId).delete(),
        db.tracks.where("projectId").equals(projectId).delete(),
        db.segments.where("projectId").equals(projectId).delete(),
        db.audioBlobs.where("projectId").equals(projectId).delete(),
      ]);

      // Write new data.
      await db.projects.put(projectRecord);

      if (nodeRecords.length > 0) await db.nodes.bulkPut(nodeRecords);
      if (trackRecords.length > 0) await db.tracks.bulkPut(trackRecords);
      if (segmentRecords.length > 0) await db.segments.bulkPut(segmentRecords);
      if (audioBlobRecords.length > 0) await db.audioBlobs.bulkPut(audioBlobRecords);
    },
  );
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load a project from IndexedDB and reconstruct live store JSON.
 *
 * Compressed audio blobs are decompressed via fflate's worker pool and
 * converted to AudioBuffers using the provided audio context.
 *
 * Returns `null` if no project with the given ID exists.
 */
export async function loadProject(
  id: string,
  audioContext: BaseAudioContext,
): Promise<LoadedProject | null> {
  const record = await db.projects.get(id);
  if (!record) return null;

  const [nodeRecords, trackRecords, segmentRecords, audioBlobRecords] = await Promise.all([
    db.nodes.where("projectId").equals(id).toArray(),
    db.tracks.where("projectId").equals(id).toArray(),
    db.segments.where("projectId").equals(id).toArray(),
    db.audioBlobs.where("projectId").equals(id).toArray(),
  ]);

  // Decompress audio blobs → AudioBuffers (parallel, worker pool).
  const audioBuffers = new Map<string, AudioBuffer>();

  await Promise.all(
    audioBlobRecords.map(async (rec) => {
      const channels = await Promise.all(rec.channelData.map(decompressBlobToFloat32Array));

      const buffer = audioContext.createBuffer(
        rec.numberOfChannels,
        rec.lengthInFrames,
        rec.sampleRate,
      );

      for (let ch = 0; ch < rec.numberOfChannels; ch++) {
        buffer.copyToChannel(channels[ch] as Float32Array<ArrayBuffer>, ch);
      }

      audioBuffers.set(rec.id, buffer);
    }),
  );

  // Reconstruct store JSON.
  const { nodesById, rootIds } = deserializeNodes(nodeRecords, record.rootIds ?? [], audioBuffers);

  const { tracks } = deserializeSequence(trackRecords, segmentRecords);

  const nodesJSON: NodeTreeJSON = {
    nodesById,
    rootIds,
    selectedNodeId: null, // Selection is transient UI state — not persisted.
  };

  const sequenceJSON: SequenceJSON = {
    tracks,
    timelineEffects: record.timelineEffects ?? [],
    selectedSegmentId: null, // Selection is transient UI state — not persisted.
  };

  return { record, data: { nodesJSON, sequenceJSON } };
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
        nodeCount: await db.nodes.where("projectId").equals(p.id).count(),
      }),
    ),
  );
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a project and all related nodes, tracks, segments, and audio blobs.
 *
 * Idempotent — succeeds silently if the project does not exist.
 */
export async function deleteProject(id: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.projects, db.nodes, db.tracks, db.segments, db.audioBlobs],
    async () => {
      await Promise.all([
        db.nodes.where("projectId").equals(id).delete(),
        db.tracks.where("projectId").equals(id).delete(),
        db.segments.where("projectId").equals(id).delete(),
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

  const [nodes, tracks, segments, audioBlobs] = await Promise.all([
    db.nodes.where("projectId").equals(id).toArray(),
    db.tracks.where("projectId").equals(id).toArray(),
    db.segments.where("projectId").equals(id).toArray(),
    db.audioBlobs.where("projectId").equals(id).toArray(),
  ]);

  const newProjectId = nanoid();
  const nodeIdMap = new Map<string, string>();
  const trackIdMap = new Map<string, string>();
  const blobIdMap = new Map<string, string>();

  const newNodes: NodeRecord[] = nodes.map((n) => {
    const newId = nanoid();
    nodeIdMap.set(n.id, newId);
    return { ...n, id: newId, projectId: newProjectId };
  });

  const newTracks: TrackRecord[] = tracks.map((t) => {
    const newId = nanoid();
    trackIdMap.set(t.id, newId);
    return { ...t, id: newId, projectId: newProjectId };
  });

  const newBlobs: AudioBlobRecord[] = audioBlobs.map((b) => {
    const newId = nanoid();
    blobIdMap.set(b.id, newId);
    return { ...b, id: newId, projectId: newProjectId };
  });

  // Remap nodeId references in segments, and update audioBlobId in node records.
  const newSegments: SegmentRecord[] = segments.map((s) => ({
    ...s,
    id: nanoid(),
    projectId: newProjectId,
    trackId: trackIdMap.get(s.trackId) ?? s.trackId,
    nodeId: nodeIdMap.get(s.nodeId) ?? s.nodeId,
  }));

  // Remap audioBlobId references in node records.
  for (const node of newNodes) {
    if (node.audioBlobId) {
      node.audioBlobId = blobIdMap.get(node.audioBlobId) ?? node.audioBlobId;
    }
  }

  // Remap rootIds to new IDs.
  const newRootIds = (project.rootIds ?? []).map((rid) => nodeIdMap.get(rid) ?? rid);

  const now = new Date();
  const newProject: ProjectRecord = {
    ...project,
    id: newProjectId,
    name: `${project.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    rootIds: newRootIds,
  };

  await db.transaction(
    "rw",
    [db.projects, db.nodes, db.tracks, db.segments, db.audioBlobs],
    async () => {
      await db.projects.put(newProject);
      if (newNodes.length > 0) await db.nodes.bulkPut(newNodes);
      if (newTracks.length > 0) await db.tracks.bulkPut(newTracks);
      if (newSegments.length > 0) await db.segments.bulkPut(newSegments);
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
 * Update only the user-editable metadata fields of a project without touching
 * nodes, tracks, segments, or audio blobs.
 */
export async function updateProjectMetadata(id: string, metadata: ProjectMetadata): Promise<void> {
  // @ts-expect-error — Dexie's KeyPaths<ProjectRecord> hits a circular type from
  // SplitEffect.left/right: AudioEffect[] (recursive). The update is safe at runtime.
  await db.projects.update(id, {
    ...serializeMetadata(metadata),
    updatedAt: new Date(),
  } as any);
}

// ─── Granular node / track / segment ops ─────────────────────────────────────
//
// Used by the auto-save path when only part of a project has changed,
// avoiding the expensive full-replace (and re-compression) of saveProject().

/**
 * Insert or replace a single node record (no audio blob).
 * Also bumps `projects.updatedAt` in the same transaction.
 */
export async function upsertNodeRecord(record: NodeRecord): Promise<void> {
  await db.transaction("rw", db.projects, db.nodes, async () => {
    await db.nodes.put(record);
    await db.projects.update(record.projectId, { updatedAt: new Date() });
  });
}

/**
 * Delete a single node record.
 * Also removes any associated audio blob and bumps `projects.updatedAt`.
 */
export async function deleteNodeRecord(projectId: string, nodeId: string): Promise<void> {
  await db.transaction("rw", db.projects, db.nodes, db.audioBlobs, async () => {
    const node = await db.nodes.get(nodeId);

    await db.nodes.delete(nodeId);

    if (node?.audioBlobId) {
      await db.audioBlobs.delete(node.audioBlobId);
    }

    await db.projects.update(projectId, { updatedAt: new Date() });
  });
}

/**
 * Insert or replace a single track record.
 * Also bumps `projects.updatedAt` in the same transaction.
 */
export async function upsertTrackRecord(record: TrackRecord): Promise<void> {
  await db.transaction("rw", db.projects, db.tracks, async () => {
    await db.tracks.put(record);
    await db.projects.update(record.projectId, { updatedAt: new Date() });
  });
}

/**
 * Delete a single track record and all its segments.
 * Also bumps `projects.updatedAt`.
 */
export async function deleteTrackRecord(projectId: string, trackId: string): Promise<void> {
  await db.transaction("rw", db.projects, db.tracks, db.segments, async () => {
    await Promise.all([
      db.tracks.delete(trackId),
      db.segments.where("trackId").equals(trackId).delete(),
    ]);
    await db.projects.update(projectId, { updatedAt: new Date() });
  });
}

/**
 * Insert or replace a single segment record.
 * Also bumps `projects.updatedAt`.
 */
export async function upsertSegmentRecord(record: SegmentRecord): Promise<void> {
  await db.transaction("rw", db.projects, db.segments, async () => {
    await db.segments.put(record);
    await db.projects.update(record.projectId, { updatedAt: new Date() });
  });
}

/**
 * Delete a single segment record.
 * Also bumps `projects.updatedAt`.
 */
export async function deleteSegmentRecord(projectId: string, segmentId: string): Promise<void> {
  await db.transaction("rw", db.projects, db.segments, async () => {
    await db.segments.delete(segmentId);
    await db.projects.update(projectId, { updatedAt: new Date() });
  });
}

/**
 * Compress and store the AudioBuffer for a recorded node.
 *
 * If a blob already exists for this node it is replaced in-place (same
 * `audioBlobId`). Otherwise a new blob ID is minted and the node record is
 * updated to reference it.
 *
 * This is the slow path — called only when the buffer has actually changed.
 */
export async function upsertAudioBlob(
  projectId: string,
  nodeId: string,
  buffer: AudioBuffer,
): Promise<void> {
  const { sampleRate, numberOfChannels, length } = buffer;
  const channelData: Blob[] = await Promise.all(
    Array.from({ length: numberOfChannels }, (_, ch) =>
      compressFloat32Array(buffer.getChannelData(ch)),
    ),
  );

  await db.transaction("rw", db.projects, db.nodes, db.audioBlobs, async () => {
    const existing = await db.nodes.get(nodeId);
    const audioBlobId = existing?.audioBlobId ?? nanoid();

    const blobRecord: AudioBlobRecord = {
      id: audioBlobId,
      projectId,
      sampleRate,
      numberOfChannels,
      lengthInFrames: length,
      channelData,
    };

    await db.audioBlobs.put(blobRecord);
    await db.nodes.update(nodeId, { audioBlobId });
    await db.projects.update(projectId, { updatedAt: new Date() });
  });
}
