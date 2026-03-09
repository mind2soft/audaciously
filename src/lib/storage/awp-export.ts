import { zip, type Zippable } from "fflate";
import {
  db,
  type TrackRecord,
  type SequenceRecord,
  type AudioBlobRecord,
} from "./db";
import {
  AWP_SCHEMA_VERSION,
  type AwpManifest,
  type AwpProjectInfo,
  type AwpTrackEntry,
  type AwpSequenceEntry,
  type AwpAudioMeta,
} from "./awp-manifest";
import { decompressBlobToFloat32Array } from "./compression";

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
 * - `manifest.json` — project metadata, track/sequence definitions
 * - `audio/<blobId>.pcm` — raw Float32 PCM data (interleaved channels)
 *
 * Audio blobs stored compressed in IndexedDB are decompressed first, then
 * written as raw PCM into the ZIP (fflate handles ZIP-level compression).
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

  const [trackRecords, sequenceRecords, audioBlobRecords] = await Promise.all([
    db.tracks.where("projectId").equals(projectId).toArray(),
    db.sequences.where("projectId").equals(projectId).toArray(),
    db.audioBlobs.where("projectId").equals(projectId).toArray(),
  ]);

  onProgress?.({ phase: "reading", progress: 1 });

  // ── Decompress audio blobs → raw PCM ────────────────────────────────────

  onProgress?.({ phase: "decompressing", progress: 0 });

  const audioBlobMap = new Map<string, AudioBlobRecord>();
  for (const rec of audioBlobRecords) {
    audioBlobMap.set(rec.id, rec);
  }

  /** blobId → raw PCM bytes (channels interleaved as consecutive Float32Arrays). */
  const rawPcmMap = new Map<string, Uint8Array>();
  const totalBlobs = audioBlobRecords.length;

  let blobsDone = 0;
  await Promise.all(
    audioBlobRecords.map(async (rec) => {
      const channels: Float32Array[] = [];
      for (const blob of rec.channelData) {
        channels.push(await decompressBlobToFloat32Array(blob));
      }
      rawPcmMap.set(rec.id, interleaveChannels(channels));
      blobsDone++;
      onProgress?.({
        phase: "decompressing",
        progress: totalBlobs > 0 ? blobsDone / totalBlobs : 1,
      });
    }),
  );

  // ── Build manifest ──────────────────────────────────────────────────────

  onProgress?.({ phase: "building", progress: 0 });

  const seqByTrack = groupBy(sequenceRecords, (s) => s.trackId);
  const sortedTracks = [...trackRecords].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const manifestTracks: AwpTrackEntry[] = sortedTracks.map((track) =>
    buildTrackEntry(track, seqByTrack.get(track.id) ?? [], audioBlobMap),
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

  // ── Build ZIP ───────────────────────────────────────────────────────────

  onProgress?.({ phase: "zipping", progress: 0 });

  const files: Zippable = {
    "manifest.json": new TextEncoder().encode(
      JSON.stringify(manifest, null, 2),
    ),
  };

  // Add raw PCM audio files — only blobs referenced by recorded-track sequences
  // in the manifest. Instrument track audio is never exported (it's synthesized
  // at runtime), so any orphaned blobs in the DB are intentionally excluded.
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

function buildTrackEntry(
  track: TrackRecord,
  sequences: SequenceRecord[],
  audioBlobMap: Map<string, AudioBlobRecord>,
): AwpTrackEntry {
  const entry: AwpTrackEntry = {
    kind: track.kind,
    name: track.name,
    volume: track.volume,
    balance: track.balance,
    muted: track.muted,
    locked: track.locked,
    sortOrder: track.sortOrder,
  };

  if (track.kind === "instrument") {
    entry.instrumentId = track.instrumentId;
    entry.bpm = track.bpm;
    entry.timeSignature = track.timeSignature;
    entry.notes = track.notes;
    entry.selectedNoteType = track.selectedNoteType;
    entry.pitchScrollTop = track.pitchScrollTop;
    entry.showWaveform = track.showWaveform;
  } else if (track.kind === "recorded") {
    entry.sequences = sequences.map((seq): AwpSequenceEntry => {
      const blobRec = seq.audioBlobId
        ? audioBlobMap.get(seq.audioBlobId)
        : undefined;

      const audioMeta: AwpAudioMeta = blobRec
        ? {
            sampleRate: blobRec.sampleRate,
            numberOfChannels: blobRec.numberOfChannels,
            lengthInFrames: blobRec.lengthInFrames,
          }
        : { sampleRate: 44100, numberOfChannels: 1, lengthInFrames: 0 };

      return {
        time: seq.time,
        playbackRate: seq.playbackRate,
        effects: seq.effects,
        audioFile: `audio/${seq.audioBlobId ?? "unknown"}.pcm`,
        audioMeta,
      };
    });
  }

  return entry;
}

/**
 * Interleave multiple Float32Array channels into a single Uint8Array
 * of raw bytes (channel 0 bytes, then channel 1 bytes, etc.).
 *
 * This keeps the PCM format simple: the reader knows numberOfChannels and
 * lengthInFrames from the manifest, so it can split the bytes back out.
 */
function interleaveChannels(channels: Float32Array[]): Uint8Array {
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
