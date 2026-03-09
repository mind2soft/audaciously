import { unzip } from "fflate";
import { nanoid } from "nanoid";
import {
  db,
  type ProjectRecord,
  type TrackRecord,
  type SequenceRecord,
  type AudioBlobRecord,
} from "./db";
import {
  validateManifest,
  type AwpManifest,
  type AwpTrackEntry,
} from "./awp-manifest";
import { checkAvailableSpace } from "./storage-quota";
import { compressFloat32Array } from "./compression";

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
 * Returns the new project ID on success, or an error message on failure.
 */
export async function importProject(file: File): Promise<ImportOutcome> {
  try {
    const entries = await unzipFile(file);
    const manifest = parseManifest(entries);

    await estimateSizeAndCheckQuota(entries);

    const { projectRecord, trackRecords, sequenceRecords, audioBlobRecords } =
      await buildRecordsWithFreshIds(manifest, entries);

    await writeToDatabase(
      projectRecord,
      trackRecords,
      sequenceRecords,
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

// ─── Import Helpers ──────────────────────────────────────────────────────────────────

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

async function estimateSizeAndCheckQuota(
  entries: Record<string, Uint8Array>,
): Promise<boolean> {
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
  trackRecords: TrackRecord[];
  sequenceRecords: SequenceRecord[];
  audioBlobRecords: AudioBlobRecord[];
}> {
  const projectId = nanoid();
  const now = new Date();

  const trackRecords: TrackRecord[] = [];
  const sequenceRecords: SequenceRecord[] = [];
  const audioBlobRecords: AudioBlobRecord[] = [];

  for (const trackEntry of manifest.tracks) {
    const trackId = nanoid();

    trackRecords.push(buildTrackRecord(projectId, trackId, trackEntry));

    if (trackEntry.kind === "recorded" && trackEntry.sequences) {
      for (const seqEntry of trackEntry.sequences) {
        const seqId = nanoid();
        const audioBlobId = nanoid();

        // Defence-in-depth: assert audioFile path is safe even after manifest validation.
        if (!/^audio\/[^/]+\.pcm$/.test(seqEntry.audioFile)) {
          throw new Error(`Invalid audioFile path "${seqEntry.audioFile}".`);
        }

        const pcmBytes = entries[seqEntry.audioFile];
        if (!pcmBytes) {
          throw new Error(
            `Missing audio file "${seqEntry.audioFile}" referenced in manifest.`,
          );
        }

        // Split raw PCM bytes back into per-channel Float32Arrays and compress.
        const { numberOfChannels, lengthInFrames, sampleRate } =
          seqEntry.audioMeta;

        if (sampleRate < 8000 || sampleRate > 384_000) {
          throw new Error(`Invalid sampleRate ${sampleRate}.`);
        }

        const channelData = await compressChannels(
          pcmBytes,
          numberOfChannels,
          lengthInFrames,
        );

        audioBlobRecords.push({
          id: audioBlobId,
          projectId,
          sampleRate,
          numberOfChannels,
          lengthInFrames,
          channelData,
        });

        sequenceRecords.push({
          id: seqId,
          trackId,
          projectId,
          time: seqEntry.time,
          playbackRate: seqEntry.playbackRate,
          effects: seqEntry.effects,
          audioBlobId,
        });
      }
    }
  }

  // Compute compressed size.
  const sizeBytes = audioBlobRecords.reduce(
    (sum, rec) => sum + rec.channelData.reduce((s, blob) => s + blob.size, 0),
    0,
  );

  return {
    trackRecords,
    sequenceRecords,
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
    },
  };
}

async function writeToDatabase(
  projectRecord: ProjectRecord,
  trackRecords: TrackRecord[],
  sequenceRecords: SequenceRecord[],
  audioBlobRecords: AudioBlobRecord[],
): Promise<void> {
  try {
    await db.transaction(
      "rw",
      db.projects,
      db.tracks,
      db.sequences,
      db.audioBlobs,
      async () => {
        await db.projects.put(projectRecord);
        if (trackRecords.length > 0) await db.tracks.bulkPut(trackRecords);
        if (sequenceRecords.length > 0)
          await db.sequences.bulkPut(sequenceRecords);
        if (audioBlobRecords.length > 0)
          await db.audioBlobs.bulkPut(audioBlobRecords);
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

function buildTrackRecord(
  projectId: string,
  trackId: string,
  entry: AwpTrackEntry,
): TrackRecord {
  const record: TrackRecord = {
    id: trackId,
    projectId,
    kind: entry.kind,
    name: entry.name,
    volume: entry.volume ?? 1,
    balance: entry.balance ?? 0,
    muted: entry.muted ?? false,
    locked: entry.locked ?? false,
    sortOrder: entry.sortOrder ?? 0,
  };

  if (entry.kind === "instrument") {
    record.instrumentId = entry.instrumentId;
    record.bpm = entry.bpm;
    record.timeSignature = entry.timeSignature;
    record.notes = entry.notes;
    record.selectedNoteType = entry.selectedNoteType;
    record.pitchScrollTop = entry.pitchScrollTop;
    record.showWaveform = entry.showWaveform;
  }

  return record;
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
