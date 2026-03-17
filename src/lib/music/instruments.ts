// ─── Note durations ──────────────────────────────────────────────────────────

/** Symbolic identifiers for all supported note lengths. */
export type NoteDuration =
  | "double-whole"
  | "whole"
  | "half"
  | "quarter"
  | "eighth"
  | "sixteenth"
  | "thirty-second";

/** How many beats each note duration occupies (in a 4/4 reference). */
export const NOTE_BEATS: Record<NoteDuration, number> = {
  "double-whole": 8,
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
  "thirty-second": 0.125,
};

export interface NoteTypeInfo {
  id: NoteDuration;
  label: string;
  /** Fraction label shown in the UI (e.g. "1/4") */
  fraction: string;
  /** Unicode / text glyph shown in the UI */
  glyph: string;
}

export const NOTE_TYPE_LIST: NoteTypeInfo[] = [
  { id: "double-whole", label: "Double Whole", fraction: "2/1", glyph: "𝅜" },
  { id: "whole", label: "Whole", fraction: "1/1", glyph: "𝅝" },
  { id: "half", label: "Half", fraction: "1/2", glyph: "𝅗𝅥" },
  { id: "quarter", label: "Quarter", fraction: "1/4", glyph: "♩" },
  { id: "eighth", label: "Eighth", fraction: "1/8", glyph: "♪" },
  { id: "sixteenth", label: "Sixteenth", fraction: "1/16", glyph: "𝅘𝅥𝅯" },
  { id: "thirty-second", label: "32nd", fraction: "1/32", glyph: "𝅘𝅥𝅰" },
];

// ─── Octave range ─────────────────────────────────────────────────────────────

export interface OctaveRange {
  low: number;
  high: number;
}

export const PIANO_OCTAVE_MIN = 1;
export const PIANO_OCTAVE_MAX = 8;
export const PIANO_DEFAULT_OCTAVE_RANGE: OctaveRange = { low: 3, high: 5 };

export const PIANO_OCTAVE_PRESETS: Array<{
  label: string;
  title: string;
  range: OctaveRange;
}> = [
  {
    label: "Standard",
    title: "C3 – B5 · 3 octaves",
    range: { low: 3, high: 5 },
  },
  {
    label: "Extended",
    title: "C2 – B6 · 5 octaves",
    range: { low: 2, high: 6 },
  },
  { label: "Full", title: "C1 – B8 · 8 octaves", range: { low: 1, high: 8 } },
];

/**
 * Filter a piano's pitches to only those whose octave falls within [range.low, range.high].
 * Drum pitches (no trailing digit) are never matched and pass through untouched when
 * guarded by an `id === "piano"` check at the call site.
 */
export function filterPitchesByOctaveRange(
  pitches: InstrumentPitch[],
  range: OctaveRange,
): InstrumentPitch[] {
  return pitches.filter((p) => {
    const match = p.key.match(/(\d+)$/);
    const oct = match ? Number(match[1]) : -1;
    return oct >= range.low && oct <= range.high;
  });
}

// ─── Instrument pitches ───────────────────────────────────────────────────────

export type InstrumentPitchKey = string;

export interface InstrumentPitch {
  /** Unique identifier within the instrument (e.g. "C4", "snare"). */
  key: InstrumentPitchKey;
  /** Human-readable label shown in the pitch column. */
  label: string;
  /** Optional short abbreviation (≤ 4 chars) for narrow columns. */
  short?: string;
}

// ─── Instruments ─────────────────────────────────────────────────────────────

export type MusicInstrumentType = "piano" | "drums";

export interface MusicInstrument<Type extends MusicInstrumentType> {
  type: Type;
  label: string;
  icon: string;
  /** Ordered from top (highest pitch) to bottom (lowest pitch). */
  pitches: InstrumentPitch[];
  /** Height in pixels of each pitch row in the piano-roll view. */
  rowHeight: number;
}

// Piano: C1 – B8 (96 chromatic semitones, top = B8, bottom = C1)
function buildPianoPitches(): InstrumentPitch[] {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitches: InstrumentPitch[] = [];
  for (let octave = 8; octave >= 1; octave--) {
    for (let n = 11; n >= 0; n--) {
      const name = noteNames[n];
      const key = `${name}${octave}`;
      pitches.push({ key, label: key, short: key });
    }
  }
  return pitches; // 96 entries: B8 … C1
}

export const PIANO_INSTRUMENT: MusicInstrument<"piano"> = {
  type: "piano",
  label: "Piano",
  icon: "mdi--piano",
  pitches: buildPianoPitches(),
  rowHeight: 14,
};

export const DRUMS_INSTRUMENT: MusicInstrument<"drums"> = {
  type: "drums",
  label: "Drums",
  icon: "mdi--drum",
  pitches: [
    { key: "crash", label: "Crash", short: "Csh" },
    { key: "ride", label: "Ride", short: "Ride" },
    { key: "hihat-open", label: "Hi-Hat Open", short: "HHO" },
    { key: "hihat-closed", label: "Hi-Hat Cls.", short: "HHC" },
    { key: "snare", label: "Snare", short: "Snr" },
    { key: "tom-hi", label: "Tom Hi", short: "TmH" },
    { key: "tom-mid", label: "Tom Mid", short: "TmM" },
    { key: "tom-lo", label: "Tom Lo", short: "TmL" },
    { key: "kick", label: "Kick", short: "Kck" },
  ],
  rowHeight: 16,
};

export const MUSIC_INSTRUMENTS = {
  piano: PIANO_INSTRUMENT,
  drums: DRUMS_INSTRUMENT,
} satisfies { [K in MusicInstrumentType]: MusicInstrument<K> };

export const INSTRUMENT_LIST = [PIANO_INSTRUMENT, DRUMS_INSTRUMENT];
