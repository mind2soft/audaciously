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
  /** Unicode / text glyph shown in the UI */
  glyph: string;
}

export const NOTE_TYPE_LIST: NoteTypeInfo[] = [
  { id: "double-whole", label: "Double Whole", glyph: "𝅜" },
  { id: "whole",        label: "Whole",        glyph: "𝅝" },
  { id: "half",         label: "Half",         glyph: "𝅗𝅥" },
  { id: "quarter",      label: "Quarter",      glyph: "♩" },
  { id: "eighth",       label: "Eighth",       glyph: "♪" },
  { id: "sixteenth",    label: "Sixteenth",    glyph: "𝅘𝅥𝅯" },
  { id: "thirty-second", label: "32nd",        glyph: "𝅘𝅥𝅰" },
];

// ─── Instrument pitches ───────────────────────────────────────────────────────

export interface InstrumentPitch {
  /** Unique identifier within the instrument (e.g. "C4", "snare"). */
  id: string;
  /** Human-readable label shown in the pitch column. */
  label: string;
  /** Optional short abbreviation (≤ 4 chars) for narrow columns. */
  short?: string;
}

// ─── Instruments ─────────────────────────────────────────────────────────────

export type MusicInstrumentId = "piano" | "drums";

export interface MusicInstrument {
  id: MusicInstrumentId;
  label: string;
  icon: string;
  /** Ordered from top (highest pitch) to bottom (lowest pitch). */
  pitches: InstrumentPitch[];
  /** Height in pixels of each pitch row in the piano-roll view. */
  rowHeight: number;
}

// Piano: C2 – B6  (60 chromatic semitones, top = B6, bottom = C2)
function buildPianoPitches(): InstrumentPitch[] {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pitches: InstrumentPitch[] = [];
  for (let octave = 6; octave >= 2; octave--) {
    for (let n = 11; n >= 0; n--) {
      const name = noteNames[n];
      const id = `${name}${octave}`;
      pitches.push({ id, label: id, short: id });
    }
  }
  return pitches; // 60 entries: B6 … C2
}

export const PIANO_INSTRUMENT: MusicInstrument = {
  id: "piano",
  label: "Piano",
  icon: "mdi--piano",
  pitches: buildPianoPitches(),
  rowHeight: 14,
};

export const DRUMS_INSTRUMENT: MusicInstrument = {
  id: "drums",
  label: "Drums",
  icon: "mdi--drum",
  pitches: [
    { id: "crash",        label: "Crash",       short: "Csh"  },
    { id: "ride",         label: "Ride",        short: "Ride" },
    { id: "hihat-open",   label: "Hi-Hat Open", short: "HHO"  },
    { id: "hihat-closed", label: "Hi-Hat Cls.", short: "HHC"  },
    { id: "snare",        label: "Snare",       short: "Snr"  },
    { id: "tom-hi",       label: "Tom Hi",      short: "TmH"  },
    { id: "tom-mid",      label: "Tom Mid",     short: "TmM"  },
    { id: "tom-lo",       label: "Tom Lo",      short: "TmL"  },
    { id: "kick",         label: "Kick",        short: "Kck"  },
  ],
  rowHeight: 16,
};

export const MUSIC_INSTRUMENTS: Record<MusicInstrumentId, MusicInstrument> = {
  piano: PIANO_INSTRUMENT,
  drums: DRUMS_INSTRUMENT,
};

export const INSTRUMENT_LIST: MusicInstrument[] = [PIANO_INSTRUMENT, DRUMS_INSTRUMENT];
