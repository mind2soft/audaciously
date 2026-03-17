import type { Emitter } from "../../emitter";
import type { AudioTrack } from "../track";

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Plain JSON representation of a sequence.  Specialised sequence types may
 * extend this with extra fields (e.g. `audioBlobId` for recorded sequences).
 */
export interface AudioSequenceJSON {
  id: string;
  time: number;
  playbackRate: number;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BufferedAudioSequenceType = typeof bufferedAudioSequenceType;

export type AudioEffectStep =
  | {
      endTime: number;
      value: number;
      interpolation?: "discrete" | "linear" | "exponential";
    }
  | {
      endTime: number;
      values: number[];
    };

export type AudioEffect = {
  type: "volume" | "balance";
  initialValue: number;
  steps: AudioEffectStep[];
};

export type AudioSequencePlayOptions = {
  output?: AudioNode;
  currentTime?: number;
  startTime?: number;
};

export interface AudioSequencePlayback {
  context: AudioContext;
  outputNode: AudioNode;
}

export interface AudioSequenceInternal<TrackKind extends string> {
  id: string;
  track?: AudioTrack<TrackKind>;
  playbackRate: number;
  selected: boolean;
  time: number;
}

export interface AudioSequenceEvent<
  EventType extends string,
  TrackKind extends string,
  SequenceVariant,
> {
  type: EventType;
  sequence: AudioSequence<TrackKind, SequenceVariant>;
}

export type AudioSequenceEventMap<TrackKind extends string, SequenceVariant> = {
  play: (event: AudioSequenceEvent<"play", TrackKind, SequenceVariant>) => void;
  seek: (event: AudioSequenceEvent<"seek", TrackKind, SequenceVariant>) => void;
  stop: (event: AudioSequenceEvent<"stop", TrackKind, SequenceVariant>) => void;
  change: (event: AudioSequenceEvent<"change", TrackKind, SequenceVariant>) => void;
};

export interface AudioSequence<TrackKind extends string, SequenceVariant>
  extends Emitter<AudioSequenceEventMap<TrackKind, SequenceVariant>> {
  [trackPropertySymbol]?: AudioTrack<TrackKind>;

  readonly type: SequenceVariant;
  readonly id: string;
  readonly duration: number;
  readonly playbackDuration: number;
  readonly isPlaying: boolean;
  readonly track?: AudioTrack<TrackKind>;

  time: number;
  playbackRate: number;
  selected: boolean;

  play(context: AudioContext, options?: AudioSequencePlayOptions): Promise<void>;
  seek(time: number): void;
  stop(): void;

  /**
   * Return a plain JSON-serialisable snapshot of this sequence.
   *
   * Called automatically by `JSON.stringify`.  Specialised sequence types
   * (recorded) override this to include their own extra fields.
   */
  toJSON(): AudioSequenceJSON;
}

export interface BufferedAudioSequence<TrackKind extends string>
  extends AudioSequence<TrackKind, BufferedAudioSequenceType> {
  readonly buffer: AudioBuffer;
}

export const trackPropertySymbol = Symbol.for("@@trackProperty");

export const bufferedAudioSequenceType = "audioBuffer" as const;
