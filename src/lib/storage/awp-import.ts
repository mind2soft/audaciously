import { unzip } from "fflate";
import { nanoid } from "nanoid";
import { type AwpManifest, type AwpTrackEntry, validateManifest } from "./awp-manifest";
import { compressFloat32Array } from "./compression";
import {
  type AudioBlobRecord,
  db,
  type NodeRecord,
  type ProjectRecord,
  type SegmentRecord,
  type TrackRecord,
} from "./db";
import { checkAvailableSpace } from "./storage-quota";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  success: true;
  projectId: string;
}

export interface ImportError {
  success: false;
  error: string;
}

export type ImportOutcome = ImportResult | ImportError;

// ─── Import ───────────────────────────────────────────────────────────────────

/**
 * Import an `.awp` file into IndexedDB.
 *
 * 1. Unzips the file using fflate.
 * 2. Validates `manifest.json` structure and version.
 * 3. Checks available storage space before writing.
 * 4. Generates fresh IDs (nanoid) for all records to avoid collisions.
 * 5. Compresses audio channel data via fflate worker pool before storage.
 * 6. Writes everything in a single Dexie transaction.
 *
 * For each manifest track entry:
 * - Instrument entry → one NodeRecord (instrument kind) + one TrackRecord +
 *   one SegmentRecord at time=0.
 * - Recorded entry → one TrackRecord, and for each sequence entry: one
 *   NodeRecord (recorded kind) + one AudioBlobRecord + one SegmentRecord.
 *
 * Returns the new project ID on success, or an error message on failure.
 */
export async function importProject(file: File): Promise<ImportOutcome> {
  try {
    const entries = await unzipFile(file);
    const manifest = parseManifest(entries);

    await estimateSizeAndCheckQuota(entries);

    const { projectRecord, nodeRecords, trackRecords, segmentRecords, audioBlobRecords } =
      await buildRecordsWithFreshIds(manifest, entries);

    await writeToDatabase(
      projectRecord,
      nodeRecords,
      trackRecords,
      segmentRecords,
      audioBlobRecords,
    );

    return { success: true, projectId: projectRecord.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Import Helpers ───────────────────────────────────────────────────────────

async function unzipFile(file: File): Promise<Record<string, Uint8Array>> {
  const MAX_AWP_FILE_SIZE = 512 * 1024 * 1024; // 512 MB
  if (file.size > MAX_AWP_FILE_SIZE) {
    throw new Error(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 512 MB.`,
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    return await unzipAsync(new Uint8Array(arrayBuffer));
  } catch {
    throw new Error("Failed to read ZIP file. The file may be corrupt.");
  }
}

function parseManifest(entries: Record<string, Uint8Array>): AwpManifest {
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) {
    throw new Error("Missing manifest.json in the .awp file.");
  }

  let manifestData: unknown;
  try {
    manifestData = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error("manifest.json is not valid JSON.");
  }

  const validation = validateManifest(manifestData);
  if (!validation.valid) {
    throw new Error(`Invalid manifest: ${validation.errors.join("; ")}`);
  }

  return manifestData as AwpManifest;
}

async function estimateSizeAndCheckQuota(entries: Record<string, Uint8Array>): Promise<boolean> {
  let totalRawBytes = 0;
  for (const key of Object.keys(entries)) {
    if (key.startsWith("audio/")) {
      totalRawBytes += entries[key].byteLength;
    }
  }

  const hasSpace = await checkAvailableSpace(totalRawBytes);
  if (!hasSpace) {
    throw new Error("Insufficient storage space to import this project.");
  }

  return hasSpace;
}

async function buildRecordsWithFreshIds(
  manifest: AwpManifest,
  entries: Record<string, Uint8Array>,
): Promise<{
  projectRecord: ProjectRecord;
  nodeRecords: NodeRecord[];
  trackRecords: TrackRecord[];
  segmentRecords: SegmentRecord[];
  audioBlobRecords: AudioBlobRecord[];
}> {
  const projectId = nanoid();
  const now = new Date();

  const nodeRecords: NodeRecord[] = [];
  const trackRecords: TrackRecord[] = [];
  const segmentRecords: SegmentRecord[] = [];
  const audioBlobRecords: AudioBlobRecord[] = [];

  for (const trackEntry of manifest.tracks) {
    const trackId = nanoid();

    trackRecords.push(buildTrackRecord(projectId, trackId, trackEntry));

    if (trackEntry.kind === "instrument") {
      // One instrument node + one segment at time=0.
      const nodeId = nanoid();

      nodeRecords.push({
        id: nodeId,
        projectId,
        kind: "instrument",
        name: trackEntry.name,
        instrumentId: trackEntry.instrumentId,
        bpm: trackEntry.bpm,
        timeSignature: trackEntry.timeSignature,
        notes: trackEntry.notes,
        selectedNoteType: trackEntry.selectedNoteType,
        pitchScrollTop: trackEntry.pitchScrollTop,
        showWaveform: trackEntry.showWaveform,
      });

      segmentRecords.push({
        id: nanoid(),
        trackId,
        projectId,
        nodeId,
        time: 0,
        trimStart: 0,
        trimEnd: 0,
      });
    } else if (trackEntry.kind === "recorded" && trackEntry.sequences) {
      // One NodeRecord + AudioBlobRecord + SegmentRecord per sequence entry.
      for (const seqEntry of trackEntry.sequences) {
        const nodeId = nanoid();
        const audioBlobId = nanoid();

        // Defence-in-depth: assert audioFile path is safe even after manifest validation.
        if (!/^audio\/[^/]+\.pcm$/.test(seqEntry.audioFile)) {
          throw new Error(`Invalid audioFile path "${seqEntry.audioFile}".`);
        }

        const pcmBytes = entries[seqEntry.audioFile];
        if (!pcmBytes) {
          throw new Error(`Missing audio file "${seqEntry.audioFile}" referenced in manifest.`);
        }

        const { numberOfChannels, lengthInFrames, sampleRate } = seqEntry.audioMeta;

        if (sampleRate < 8000 || sampleRate > 384_000) {
          throw new Error(`Invalid sampleRate ${sampleRate}.`);
        }

        const channelData = await compressChannels(pcmBytes, numberOfChannels, lengthInFrames);

        audioBlobRecords.push({
          id: audioBlobId,
          projectId,
          sampleRate,
          numberOfChannels,
          lengthInFrames,
          channelData,
        });

        nodeRecords.push({
          id: nodeId,
          projectId,
          kind: "recorded",
          name: trackEntry.name,
          audioBlobId,
          effects: seqEntry.effects,
        });

        segmentRecords.push({
          id: nanoid(),
          trackId,
          projectId,
          nodeId,
          time: seqEntry.time,
          trimStart: 0,
          trimEnd: 0,
        });
      }
    }
  }

  // Compute compressed size.
  const sizeBytes = audioBlobRecords.reduce(
    (sum, rec) => sum + rec.channelData.reduce((s, blob) => s + blob.size, 0),
    0,
  );

  // rootIds = all top-level nodeRecords (no folder nesting in AWP format).
  const rootIds = nodeRecords.map((n) => n.id);

  return {
    nodeRecords,
    trackRecords,
    segmentRecords,
    audioBlobRecords,
    projectRecord: {
      id: projectId,
      name: manifest.project.name,
      author: manifest.project.author,
      genre: manifest.project.genre,
      tags: manifest.project.tags ?? [],
      description: manifest.project.description ?? "",
      createdAt: safeParseDate(manifest.project.createdAt) ?? now,
      updatedAt: now,
      sizeBytes,
      durationSeconds: manifest.project.durationSeconds ?? 0,
      bpm: manifest.project.bpm,
      sampleRate: manifest.project.sampleRate,
      rootIds,
      timelineEffects: [],
    },
  };
}

async function writeToDatabase(
  projectRecord: ProjectRecord,
  nodeRecords: NodeRecord[],
  trackRecords: TrackRecord[],
  segmentRecords: SegmentRecord[],
  audioBlobRecords: AudioBlobRecord[],
): Promise<void> {
  try {
    await db.transaction(
      "rw",
      [db.projects, db.nodes, db.tracks, db.segments, db.audioBlobs],
      async () => {
        await db.projects.put(projectRecord);
        if (nodeRecords.length > 0) await db.nodes.bulkPut(nodeRecords);
        if (trackRecords.length > 0) await db.tracks.bulkPut(trackRecords);
        if (segmentRecords.length > 0) await db.segments.bulkPut(segmentRecords);
        if (audioBlobRecords.length > 0) await db.audioBlobs.bulkPut(audioBlobRecords);
      },
    );
  } catch (err) {
    throw new Error(
      err instanceof DOMException && err.name === "QuotaExceededError"
        ? "Storage quota exceeded while writing project data."
        : `Failed to write project to database: ${String(err)}`,
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTrackRecord(projectId: string, trackId: string, entry: AwpTrackEntry): TrackRecord {
  return {
    id: trackId,
    projectId,
    name: entry.name,
    height: 64, // default track height
    volume: entry.volume ?? 1,
    balance: entry.balance ?? 0,
    muted: entry.muted ?? false,
    locked: entry.locked ?? false,
    sortOrder: entry.sortOrder ?? 0,
  };
}

/**
 * Split concatenated raw PCM bytes into per-channel Float32Arrays and
 * compress each channel for IndexedDB storage.
 *
 * The PCM layout is sequential: all bytes for channel 0, then channel 1, etc.
 * Each channel has `lengthInFrames` float32 samples = `lengthInFrames * 4` bytes.
 */
async function compressChannels(
  pcmBytes: Uint8Array,
  numberOfChannels: number,
  lengthInFrames: number,
): Promise<Blob[]> {
  const bytesPerChannel = lengthInFrames * 4;
  const blobs: Blob[] = [];

  for (let ch = 0; ch < numberOfChannels; ch++) {
    const offset = ch * bytesPerChannel;
    const channelBytes = pcmBytes.slice(offset, offset + bytesPerChannel);

    // Create a properly-aligned Float32Array from the raw bytes.
    const float32 = new Float32Array(lengthInFrames);
    new Uint8Array(float32.buffer).set(channelBytes);

    blobs.push(await compressFloat32Array(float32));
  }

  return blobs;
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function safeParseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
