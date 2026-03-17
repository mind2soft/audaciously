import { type Zippable, zip } from "fflate";
import {
  AWP_SCHEMA_VERSION,
  type AwpAudioMeta,
  type AwpManifest,
  type AwpProjectInfo,
  type AwpSequenceEntry,
  type AwpTrackEntry,
} from "./awp-manifest";
import { decompressBlobToFloat32Array } from "./compression";
import {
  type AudioBlobRecord,
  db,
  type NodeRecord,
  type SegmentRecord,
  type TrackRecord,
} from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExportProgress {
  phase: "reading" | "decompressing" | "building" | "zipping";
  /** 0–1 fraction. */
  progress: number;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Export a project from IndexedDB as an `.awp` ZIP Blob.
 *
 * The ZIP contains:
 * - `manifest.json` — project metadata, track/node/segment definitions
 * - `audio/<blobId>.pcm` — raw Float32 PCM data (sequential channels)
 *
 * Audio blobs stored compressed in IndexedDB are decompressed first, then
 * written as raw PCM into the ZIP (fflate handles ZIP-level compression).
 *
 * Manifest track entries correspond to DB tracks. Each track entry's `kind`
 * and instrument/sequence data come from the nodes referenced by that track's
 * segments. If a track has segments referencing nodes of different kinds, all
 * recorded segments are exported as sequences and instrument data is taken
 * from the first instrument node found.
 *
 * Returns `null` if the project does not exist.
 */
export async function exportProject(
  projectId: string,
  onProgress?: ExportProgressCallback,
): Promise<Blob | null> {
  onProgress?.({ phase: "reading", progress: 0 });

  const project = await db.projects.get(projectId);
  if (!project) return null;

  const [trackRecords, segmentRecords, nodeRecords, audioBlobRecords] = await Promise.all([
    db.tracks.where("projectId").equals(projectId).toArray(),
    db.segments.where("projectId").equals(projectId).toArray(),
    db.nodes.where("projectId").equals(projectId).toArray(),
    db.audioBlobs.where("projectId").equals(projectId).toArray(),
  ]);

  onProgress?.({ phase: "reading", progress: 1 });

  // ── Build lookup maps ────────────────────────────────────────────────────

  const nodeMap = new Map<string, NodeRecord>();
  for (const node of nodeRecords) {
    nodeMap.set(node.id, node);
  }

  const audioBlobMap = new Map<string, AudioBlobRecord>();
  for (const rec of audioBlobRecords) {
    audioBlobMap.set(rec.id, rec);
  }

  /** segments grouped by trackId */
  const segsByTrack = groupBy(segmentRecords, (s) => s.trackId);

  // ── Decompress audio blobs → raw PCM ────────────────────────────────────

  onProgress?.({ phase: "decompressing", progress: 0 });

  /** blobId → raw PCM bytes (channels sequential as consecutive Float32Arrays). */
  const rawPcmMap = new Map<string, Uint8Array>();
  const totalBlobs = audioBlobRecords.length;
  let blobsDone = 0;

  await Promise.all(
    audioBlobRecords.map(async (rec) => {
      const channels: Float32Array[] = [];
      for (const blob of rec.channelData) {
        channels.push(await decompressBlobToFloat32Array(blob));
      }
      rawPcmMap.set(rec.id, sequentialChannels(channels));
      blobsDone++;
      onProgress?.({
        phase: "decompressing",
        progress: totalBlobs > 0 ? blobsDone / totalBlobs : 1,
      });
    }),
  );

  // ── Build manifest ───────────────────────────────────────────────────────

  onProgress?.({ phase: "building", progress: 0 });

  const sortedTracks = [...trackRecords].sort((a, b) => a.sortOrder - b.sortOrder);

  const manifestTracks: AwpTrackEntry[] = sortedTracks.flatMap((track) =>
    buildTrackEntries(track, segsByTrack.get(track.id) ?? [], nodeMap, audioBlobMap),
  );

  const projectInfo: AwpProjectInfo = {
    name: project.name,
    author: project.author,
    genre: project.genre,
    tags: project.tags,
    description: project.description,
    bpm: project.bpm,
    sampleRate: project.sampleRate,
    durationSeconds: project.durationSeconds,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };

  const manifest: AwpManifest = {
    version: AWP_SCHEMA_VERSION,
    project: projectInfo,
    tracks: manifestTracks,
  };

  onProgress?.({ phase: "building", progress: 1 });

  // ── Build ZIP ────────────────────────────────────────────────────────────

  onProgress?.({ phase: "zipping", progress: 0 });

  const files: Zippable = {
    "manifest.json": new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  };

  // Add raw PCM audio files — only blobs referenced in the manifest.
  const referencedBlobIds = new Set<string>();
  for (const trackEntry of manifestTracks) {
    for (const seq of trackEntry.sequences ?? []) {
      const match = seq.audioFile?.match(/^audio\/(.+)\.pcm$/);
      if (match) referencedBlobIds.add(match[1]);
    }
  }

  for (const [blobId, pcm] of rawPcmMap) {
    if (referencedBlobIds.has(blobId)) {
      files[`audio/${blobId}.pcm`] = pcm;
    }
  }

  const zipBlob = await zipAsync(files);

  onProgress?.({ phase: "zipping", progress: 1 });

  return zipBlob;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build one or more `AwpTrackEntry` objects for a DB track.
 *
 * In the v2 model, a single DB track can hold segments referencing different
 * nodes. Since the AWP manifest format is kind-typed per entry, we group
 * segments by their referenced node kind and emit one entry per kind group
 * within the track.  In practice, most tracks will produce exactly one entry.
 */
function buildTrackEntries(
  track: TrackRecord,
  segments: SegmentRecord[],
  nodeMap: Map<string, NodeRecord>,
  audioBlobMap: Map<string, AudioBlobRecord>,
): AwpTrackEntry[] {
  // Partition segments by kind.
  const recordedSegs: SegmentRecord[] = [];
  const instrumentSegs: SegmentRecord[] = [];

  for (const seg of segments) {
    const node = nodeMap.get(seg.nodeId);
    if (!node) continue; // orphaned segment — skip

    if (node.kind === "recorded") {
      recordedSegs.push(seg);
    } else if (node.kind === "instrument") {
      instrumentSegs.push(seg);
    }
    // folder nodes cannot be segments per spec; skip silently
  }

  const entries: AwpTrackEntry[] = [];

  const baseFields = {
    name: track.name,
    volume: track.volume,
    balance: track.balance,
    muted: track.muted,
    locked: track.locked,
    sortOrder: track.sortOrder,
  };

  // Recorded entry — one entry combining all recorded segments on this track.
  if (recordedSegs.length > 0) {
    const seqEntries: AwpSequenceEntry[] = recordedSegs.map((seg) => {
      const node = nodeMap.get(seg.nodeId)!;
      const blobRec = node.audioBlobId ? audioBlobMap.get(node.audioBlobId) : undefined;

      const audioMeta: AwpAudioMeta = blobRec
        ? {
            sampleRate: blobRec.sampleRate,
            numberOfChannels: blobRec.numberOfChannels,
            lengthInFrames: blobRec.lengthInFrames,
          }
        : { sampleRate: 44100, numberOfChannels: 1, lengthInFrames: 0 };

      return {
        time: seg.time,
        playbackRate: 1,
        effects: node.effects,
        audioFile: `audio/${node.audioBlobId ?? "unknown"}.pcm`,
        audioMeta,
      };
    });

    entries.push({
      ...baseFields,
      kind: "recorded",
      sequences: seqEntries,
    });
  }

  // Instrument entries — one entry per unique instrument node on this track.
  // (Multiple instrument segments on one track would be rare, but handle it.)
  const seenInstrumentNodes = new Set<string>();
  for (const seg of instrumentSegs) {
    const node = nodeMap.get(seg.nodeId);
    if (!node || seenInstrumentNodes.has(node.id)) continue;
    seenInstrumentNodes.add(node.id);

    entries.push({
      ...baseFields,
      kind: "instrument",
      instrumentId: node.instrumentId,
      bpm: node.bpm,
      timeSignature: node.timeSignature,
      notes: node.notes,
      selectedNoteType: node.selectedNoteType,
      pitchScrollTop: node.pitchScrollTop,
      showWaveform: node.showWaveform,
    });
  }

  // If the track has no exportable segments, emit a minimal recorded entry so
  // the track is preserved in the manifest.
  if (entries.length === 0) {
    entries.push({
      ...baseFields,
      kind: "recorded",
      sequences: [],
    });
  }

  return entries;
}

/**
 * Lay out multiple Float32Array channels as sequential byte runs into a single
 * Uint8Array: all bytes for channel 0, then all bytes for channel 1, etc.
 *
 * The reader reconstructs channels using `numberOfChannels` and
 * `lengthInFrames` from the manifest.
 */
function sequentialChannels(channels: Float32Array[]): Uint8Array {
  let totalBytes = 0;
  for (const ch of channels) {
    totalBytes += ch.byteLength;
  }

  const result = new Uint8Array(totalBytes);
  let offset = 0;

  for (const ch of channels) {
    result.set(new Uint8Array(ch.buffer, ch.byteOffset, ch.byteLength), offset);
    offset += ch.byteLength;
  }

  return result;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function zipAsync(files: Zippable): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    zip(files, { level: 6 }, (err, data) => {
      if (err) reject(err);
      else
        resolve(
          new Blob([data as Uint8Array<ArrayBuffer>], {
            type: "application/zip",
          }),
        );
    });
  });
}
