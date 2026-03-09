import type { MusicInstrumentId, NoteDuration } from "../music/instruments";
import type { PlacedNote, TimeSignature } from "../audio/track/instrument";
import type { AudioEffect } from "../audio/sequence";

// ─── Constants ────────────────────────────────────────────────────────────────

export const AWP_SCHEMA_VERSION = "1.0";

// ─── Validation Limits ────────────────────────────────────────────────────────

const MAX_AUDIO_CHANNELS = 32;
const MAX_AUDIO_FRAMES = 48_000 * 60 * 60 * 2; // 2 hours at 48 kHz

const MAX_TRACKS = 64;
const MAX_SEQUENCES_PER_TRACK = 512;
const MAX_NOTES_PER_TRACK = 10_000;

const MAX_PROJECT_NAME_LENGTH = 200;
const MAX_PROJECT_DESCRIPTION_LENGTH = 5_000;
const MAX_PROJECT_AUTHOR_LENGTH = 200;
const MAX_PROJECT_GENRE_LENGTH = 100;
const MAX_PROJECT_TAGS = 50;
const MAX_TAG_LENGTH = 50;

const ALLOWED_BEAT_UNITS: ReadonlyArray<number> = [1, 2, 4, 8, 16];

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
    if (manifest.tracks.length > MAX_TRACKS) {
      errors.push(
        `Manifest contains too many tracks (${manifest.tracks.length}). Maximum is ${MAX_TRACKS}.`,
      );
    }
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
  } else if (project.name.length > MAX_PROJECT_NAME_LENGTH) {
    errors.push(
      `Project name exceeds maximum length of ${MAX_PROJECT_NAME_LENGTH} characters.`,
    );
  }

  if (typeof project.description === "string") {
    if (project.description.length > MAX_PROJECT_DESCRIPTION_LENGTH) {
      errors.push(
        `Project description exceeds maximum length of ${MAX_PROJECT_DESCRIPTION_LENGTH} characters.`,
      );
    }
  }

  if (typeof project.author === "string") {
    if (project.author.length > MAX_PROJECT_AUTHOR_LENGTH) {
      errors.push(
        `Project author exceeds maximum length of ${MAX_PROJECT_AUTHOR_LENGTH} characters.`,
      );
    }
  }

  if (typeof project.genre === "string") {
    if (project.genre.length > MAX_PROJECT_GENRE_LENGTH) {
      errors.push(
        `Project genre exceeds maximum length of ${MAX_PROJECT_GENRE_LENGTH} characters.`,
      );
    }
  }

  if (Array.isArray(project.tags)) {
    if (project.tags.length > MAX_PROJECT_TAGS) {
      errors.push(`Project tags exceed maximum count of ${MAX_PROJECT_TAGS}.`);
    }
    for (let i = 0; i < project.tags.length; i++) {
      const tag = project.tags[i];
      if (typeof tag === "string" && tag.length > MAX_TAG_LENGTH) {
        errors.push(
          `Project tag ${i} exceeds maximum length of ${MAX_TAG_LENGTH} characters.`,
        );
      }
    }
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

  // ── Instrument-specific validations ─────────────────────────────────────
  if (track.kind === "instrument") {
    if (
      Array.isArray(track.notes) &&
      track.notes.length > MAX_NOTES_PER_TRACK
    ) {
      errors.push(
        `${prefix}: too many notes (${track.notes.length}). Maximum is ${MAX_NOTES_PER_TRACK}.`,
      );
    }

    if (track.timeSignature && typeof track.timeSignature === "object") {
      const ts = track.timeSignature as Record<string, unknown>;
      if (
        typeof ts.beatUnit !== "number" ||
        !ALLOWED_BEAT_UNITS.includes(ts.beatUnit)
      ) {
        errors.push(
          `${prefix}: timeSignature.beatUnit must be one of ${ALLOWED_BEAT_UNITS.join(", ")}.`,
        );
      }
      if (
        typeof ts.beatsPerMeasure !== "number" ||
        !Number.isInteger(ts.beatsPerMeasure) ||
        ts.beatsPerMeasure < 1 ||
        ts.beatsPerMeasure > 32
      ) {
        errors.push(
          `${prefix}: timeSignature.beatsPerMeasure must be an integer between 1 and 32.`,
        );
      }
    }
  }

  if (track.kind === "recorded" && Array.isArray(track.sequences)) {
    if (track.sequences.length > MAX_SEQUENCES_PER_TRACK) {
      errors.push(
        `${prefix}: too many sequences (${track.sequences.length}). Maximum is ${MAX_SEQUENCES_PER_TRACK}.`,
      );
    }
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
  } else {
    // Normalise backslashes then apply path-traversal and prefix guards.
    const normalisedAudioFile = seq.audioFile.replace(/\\/g, "/");
    if (normalisedAudioFile.includes("\0")) {
      errors.push(`${prefix}: audioFile path contains null bytes.`);
    } else if (
      normalisedAudioFile.includes("../") ||
      normalisedAudioFile.includes("./")
    ) {
      errors.push(`${prefix}: audioFile path must not contain path traversal.`);
    } else if (!normalisedAudioFile.startsWith("audio/")) {
      errors.push(`${prefix}: audioFile path must start with "audio/".`);
    }
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
      meta.numberOfChannels < 1 ||
      meta.numberOfChannels > MAX_AUDIO_CHANNELS
    ) {
      errors.push(`${prefix}: invalid audioMeta.numberOfChannels.`);
    }
    if (
      typeof meta.lengthInFrames !== "number" ||
      meta.lengthInFrames < 1 ||
      meta.lengthInFrames > MAX_AUDIO_FRAMES
    ) {
      errors.push(`${prefix}: invalid audioMeta.lengthInFrames.`);
    }
  }
}
