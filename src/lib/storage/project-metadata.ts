// ─── Types ────────────────────────────────────────────────────────────────────

/** User-editable project metadata (subset of ProjectRecord). */
export interface ProjectMetadata {
  name: string;
  author: string;
  genre: string;
  tags: string[];
  description: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

/** Create a fresh metadata object with sensible defaults. */
export function createDefaultMetadata(): ProjectMetadata {
  return {
    name: "Untitled Project",
    author: "",
    genre: "",
    tags: [],
    description: "",
  };
}

// ─── Field Validation ─────────────────────────────────────────────────────────

const MAX_NAME_LENGTH = 100;
const MAX_AUTHOR_LENGTH = 100;
const MAX_GENRE_LENGTH = 50;
const MAX_TAG_LENGTH = 30;
const MAX_TAGS = 20;
const MAX_DESCRIPTION_LENGTH = 1000;

/** Returns an error message or `null` if valid. */
export function validateProjectName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Project name is required.";
  if (trimmed.length > MAX_NAME_LENGTH) return `Project name must be at most ${MAX_NAME_LENGTH} characters.`;
  return null;
}

/** Returns an error message or `null` if valid. */
export function validateAuthor(author: string): string | null {
  if (author.length > MAX_AUTHOR_LENGTH) return `Author must be at most ${MAX_AUTHOR_LENGTH} characters.`;
  return null;
}

/** Returns an error message or `null` if valid. */
export function validateGenre(genre: string): string | null {
  if (genre.length > MAX_GENRE_LENGTH) return `Genre must be at most ${MAX_GENRE_LENGTH} characters.`;
  return null;
}

/** Returns an error message or `null` if valid. */
export function validateTags(tags: string[]): string | null {
  if (tags.length > MAX_TAGS) return `At most ${MAX_TAGS} tags allowed.`;
  for (const tag of tags) {
    if (tag.trim().length === 0) return "Tags must not be empty.";
    if (tag.length > MAX_TAG_LENGTH) return `Each tag must be at most ${MAX_TAG_LENGTH} characters.`;
  }
  return null;
}

/** Returns an error message or `null` if valid. */
export function validateDescription(description: string): string | null {
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`;
  }
  return null;
}

// ─── Full Validation ──────────────────────────────────────────────────────────

export interface MetadataValidationResult {
  valid: boolean;
  /** Field name → error message (only includes fields with errors). */
  errors: Partial<Record<keyof ProjectMetadata, string>>;
}

/** Validate all metadata fields at once. */
export function validateMetadata(metadata: ProjectMetadata): MetadataValidationResult {
  const errors: Partial<Record<keyof ProjectMetadata, string>> = {};

  const nameErr = validateProjectName(metadata.name);
  if (nameErr) errors.name = nameErr;

  const authorErr = validateAuthor(metadata.author);
  if (authorErr) errors.author = authorErr;

  const genreErr = validateGenre(metadata.genre);
  if (genreErr) errors.genre = genreErr;

  const tagsErr = validateTags(metadata.tags);
  if (tagsErr) errors.tags = tagsErr;

  const descErr = validateDescription(metadata.description);
  if (descErr) errors.description = descErr;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

export const GENRE_SUGGESTIONS: readonly string[] = [
  "Ambient",
  "Classical",
  "Country",
  "Dance / EDM",
  "Drum & Bass",
  "Dubstep",
  "Electronic",
  "Folk",
  "Funk",
  "Hip-Hop / Rap",
  "House",
  "Indie",
  "Jazz",
  "Lo-Fi",
  "Metal",
  "Pop",
  "Punk",
  "R&B / Soul",
  "Reggae",
  "Rock",
  "Soundtrack / Score",
  "Synthwave",
  "Techno",
  "World",
];

export const TAG_SUGGESTIONS: readonly string[] = [
  "acoustic",
  "bass-heavy",
  "beat",
  "chill",
  "dark",
  "demo",
  "dreamy",
  "energetic",
  "experiment",
  "fast",
  "groove",
  "instrumental",
  "loop",
  "melody",
  "minimal",
  "mix",
  "mood",
  "piano",
  "remix",
  "sample",
  "sketch",
  "slow",
  "synth",
  "upbeat",
  "vocal",
  "wip",
];
