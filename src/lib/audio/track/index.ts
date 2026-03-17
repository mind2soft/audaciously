import type { Emitter } from "../../emitter";
import type { AudioSequence } from "../sequence/index";

// ─── Serialization ────────────────────────────────────────────────────────────

/**
 * Plain JSON representation of the base track properties.
 * Specialised track types extend this with their own extra fields.
 */
export interface AudioTrackJSON {
  id: string;
  kind: string;
  name: string;
  volume: number;
  balance: number;
  muted: boolean;
  locked: boolean;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface AudioTrackEvent<TrackKind extends string, EventType extends string> {
  type: EventType;
  track: AudioTrack<TrackKind>;
}

export type AudioTrackEventMap<TrackKind extends string> = {
  play: (event: AudioTrackEvent<TrackKind, "play">) => void;
  stop: (event: AudioTrackEvent<TrackKind, "stop">) => void;
  change: (event: AudioTrackEvent<TrackKind, "change">) => void;
};

export type AudioTrackDispatch<TrackKind extends string> = (event: {
  type: keyof AudioTrackEventMap<TrackKind>;
}) => void;

export type AudioTrackPlayOptions = {
  output?: AudioNode;
  currentTime?: number;
  startTime?: number;
};

export interface AudioTrack<TrackKind extends string>
  extends Emitter<AudioTrackEventMap<TrackKind>> {
  readonly id: string;
  readonly kind: TrackKind;
  readonly isPlaying: boolean;

  name: string;
  readonly duration: number;

  locked: boolean;
  muted: boolean;
  volume: number;
  balance: number;

  addSequence<SequenceVariant extends string>(
    sequence: AudioSequence<TrackKind, SequenceVariant>,
  ): void;
  countSequences(): number;
  getSequence<SequenceVariant extends string>(
    id: string,
  ): AudioSequence<TrackKind, SequenceVariant> | undefined;
  getSequences<SequenceVariant extends string>(): Iterable<
    AudioSequence<TrackKind, SequenceVariant>
  >;
  removeSequence<SequenceVariant extends string>(
    sequence: AudioSequence<TrackKind, SequenceVariant> | string,
  ): boolean;

  /**
   * Start track playback, resolve when ended
   */
  play(context: AudioContext, options?: AudioTrackPlayOptions): Promise<void>;
  seek(time: number): void;
  stop(): void;

  /**
   * Return a plain JSON-serialisable snapshot of this track.
   *
   * Called automatically by `JSON.stringify`.  Specialised track types
   * (instrument, recorded) override this to include their own extra fields.
   */
  toJSON(): AudioTrackJSON;
}
