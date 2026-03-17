import type {
  InstrumentPitchKey,
  MusicInstrumentType,
  NoteDuration,
  OctaveRange,
} from "../../../music/instruments";
import type { AudioTrack, AudioTrackJSON } from "../index";

export type InstrumentTrackKind = typeof instrumentTrackKind;

export const instrumentTrackKind = "instrument" as const;

// ─── Serialization ─────────────────────────────────────────────────────────

/**
 * Plain JSON representation of an instrument track, extending the base
 * AudioTrackJSON with all instrument-specific fields.
 */
export interface InstrumentTrackJSON extends AudioTrackJSON {
  kind: "instrument";
  instrumentId: MusicInstrumentType;
  bpm: number;
  timeSignature: TimeSignature;
  notes: PlacedNote[];
  selectedNoteType: NoteDuration;
  pitchScrollTop: number;
  showWaveform: boolean;
  octaveRange: OctaveRange;
}

// ─── Time signature ───────────────────────────────────────────────────────────

export interface TimeSignature {
  /** Beats per measure (numerator). */
  beatsPerMeasure: number;
  /** Note value that receives one beat (denominator, e.g. 4 = quarter note). */
  beatUnit: number;
}

export const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  beatsPerMeasure: 4,
  beatUnit: 4,
};

// ─── Placed note ──────────────────────────────────────────────────────────────

export interface PlacedNote {
  id: string;
  /** Beat index from the start of the track (0-based, float allowed). */
  startBeat: number;
  /** Duration in beats. */
  durationBeats: number;
  /** Pitch key matching one of the instrument's pitches[].key values. */
  pitchKey: InstrumentPitchKey;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface InstrumentAudioTrack extends AudioTrack<InstrumentTrackKind> {
  readonly kind: InstrumentTrackKind;
  readonly instrumentId: MusicInstrumentType;
  timeSignature: TimeSignature;
  bpm: number;
  notes: PlacedNote[];
  selectedNoteType: NoteDuration;
  pitchScrollTop: number;
  showWaveform: boolean;
  octaveRange: OctaveRange;

  toJSON(): InstrumentTrackJSON;

  /**
   * Tear down this track's internal render loop and reactive scope.
   * Must be called when the track is deleted from the project.
   * The caller is responsible for removing the track from the player.
   */
  destroy(): void;
}
