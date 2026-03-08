import type { MusicInstrumentId, NoteDuration } from "../music/instruments";
import type { PlacedNote, TimeSignature } from "../audio/track/instrument";
import type { AudioEffect } from "../audio/sequence";

// ─── Constants ────────────────────────────────────────────────────────────────

export const AWP_SCHEMA_VERSION = "1.0";

// ─── Manifest Types ───────────────────────────────────────────────────────────

/** Top-level manifest structure (manifest.json inside the .awp ZIP). */
export interface AwpManifest {
  version: string;
  project: AwpProjectInfo;
  tracks: AwpTrackEntry[];
}

/** Project-level metadata embedded in the manifest. */
export interface AwpProjectInfo {
  name: string;
  author: string;
  genre: string;
  tags: string[];
  description: string;
  bpm: number;
  sampleRate: number;
  durationSeconds: number;
  createdAt: string;
  updatedAt: string;
}

/** Per-track entry in the manifest. */
export interface AwpTrackEntry {
  kind: "recorded" | "instrument";
  name: string;
  volume: number;
  balance: number;
  muted: boolean;
  locked: boolean;
  sortOrder: number;
  // ── Instrument-specific ───────────────────────────────────────────────────
  instrumentId?: MusicInstrumentId;
  bpm?: number;
  timeSignature?: TimeSignature;
  notes?: PlacedNote[];
  selectedNoteType?: NoteDuration;
  pitchScrollTop?: number;
  showWaveform?: boolean;
  // ── Recorded-specific ─────────────────────────────────────────────────────
  sequences?: AwpSequenceEntry[];
}

/** Per-sequence entry for recorded tracks. */
export interface AwpSequenceEntry {
  time: number;
  playbackRate: number;
  effects?: AudioEffect[];
  /** Path to the raw PCM file within the ZIP (e.g. "audio/abc123.pcm"). */
  audioFile: string;
  /** Metadata required to decode the raw PCM data. */
  audioMeta: AwpAudioMeta;
}

/** Describes the format of a raw PCM audio file in the ZIP. */
export interface AwpAudioMeta {
  sampleRate: number;
  numberOfChannels: number;
  /** Total sample frames (samples per channel). */
  lengthInFrames: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a parsed manifest object.
 *
 * Checks structural integrity and version compatibility. Does NOT verify
 * that referenced audio files actually exist in the ZIP — that is the
 * importer's responsibility.
 */
export function validateManifest(data: unknown): ManifestValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Manifest is not an object."] };
  }

  const manifest = data as Record<string, unknown>;

  // ── Version ───────────────────────────────────────────────────────────────
  if (typeof manifest.version !== "string") {
    errors.push("Missing or invalid 'version' field.");
  } else if (!isVersionCompatible(manifest.version)) {
    errors.push(
      `Unsupported manifest version "${manifest.version}" (expected ${AWP_SCHEMA_VERSION}).`,
    );
  }

  // ── Project info ──────────────────────────────────────────────────────────
  if (!manifest.project || typeof manifest.project !== "object") {
    errors.push("Missing or invalid 'project' field.");
  } else {
    validateProjectInfo(manifest.project as Record<string, unknown>, errors);
  }

  // ── Tracks ────────────────────────────────────────────────────────────────
  if (Array.isArray(manifest.tracks)) {
    for (let i = 0; i < manifest.tracks.length; i++) {
      validateTrackEntry(manifest.tracks[i], i, errors);
    }
  } else {
    errors.push("Missing or invalid 'tracks' array.");
  }

  return { valid: errors.length === 0, errors };
}

// ─── Version Helpers ──────────────────────────────────────────────────────────

/**
 * Check whether a manifest version is compatible with the current reader.
 * Currently accepts exact match on major version (e.g. "1.x" matches "1.0").
 */
function isVersionCompatible(version: string): boolean {
  const [major] = version.split(".");
  const [currentMajor] = AWP_SCHEMA_VERSION.split(".");
  return major === currentMajor;
}

// ─── Field Validators ─────────────────────────────────────────────────────────

function validateProjectInfo(
  project: Record<string, unknown>,
  errors: string[],
): void {
  if (typeof project.name !== "string" || project.name.trim().length === 0) {
    errors.push("Project name is required.");
  }
  if (typeof project.bpm !== "number" || project.bpm <= 0) {
    errors.push("Project bpm must be a positive number.");
  }
  if (typeof project.sampleRate !== "number" || project.sampleRate <= 0) {
    errors.push("Project sampleRate must be a positive number.");
  }
}

function validateTrackEntry(
  entry: unknown,
  index: number,
  errors: string[],
): void {
  if (!entry || typeof entry !== "object") {
    errors.push(`Track ${index}: not an object.`);
    return;
  }

  const track = entry as Record<string, unknown>;
  const prefix = `Track ${index}`;

  if (track.kind !== "recorded" && track.kind !== "instrument") {
    errors.push(`${prefix}: invalid kind "${String(track.kind)}".`);
  }

  if (typeof track.name !== "string") {
    errors.push(`${prefix}: missing name.`);
  }

  if (track.kind === "instrument" && typeof track.instrumentId !== "string") {
    errors.push(`${prefix}: instrument track missing instrumentId.`);
  }

  if (track.kind === "recorded" && Array.isArray(track.sequences)) {
    for (let i = 0; i < track.sequences.length; i++) {
      validateSequenceEntry(track.sequences[i], index, i, errors);
    }
  }
}

function validateSequenceEntry(
  entry: unknown,
  trackIndex: number,
  seqIndex: number,
  errors: string[],
): void {
  if (!entry || typeof entry !== "object") {
    errors.push(`Track ${trackIndex}, Sequence ${seqIndex}: not an object.`);
    return;
  }

  const seq = entry as Record<string, unknown>;
  const prefix = `Track ${trackIndex}, Sequence ${seqIndex}`;

  if (typeof seq.time !== "number") {
    errors.push(`${prefix}: missing or invalid time.`);
  }

  if (typeof seq.audioFile !== "string" || seq.audioFile.length === 0) {
    errors.push(`${prefix}: missing audioFile path.`);
  }

  if (!seq.audioMeta || typeof seq.audioMeta !== "object") {
    errors.push(`${prefix}: missing audioMeta.`);
  } else {
    const meta = seq.audioMeta as Record<string, unknown>;
    if (typeof meta.sampleRate !== "number" || meta.sampleRate <= 0) {
      errors.push(`${prefix}: invalid audioMeta.sampleRate.`);
    }
    if (
      typeof meta.numberOfChannels !== "number" ||
      meta.numberOfChannels < 1
    ) {
      errors.push(`${prefix}: invalid audioMeta.numberOfChannels.`);
    }
    if (typeof meta.lengthInFrames !== "number" || meta.lengthInFrames < 1) {
      errors.push(`${prefix}: invalid audioMeta.lengthInFrames.`);
    }
  }
}
