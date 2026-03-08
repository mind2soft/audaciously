import type { Emitter } from "../../emitter";
import type { AudioSequence } from "../sequence/index";

export interface AudioTrackEvent<Kind, EventType extends string> {
  type: EventType;
  track: AudioTrack<Kind>;
}

export type AudioTrackEventMap<Kind> = {
  play: (event: AudioTrackEvent<Kind, "play">) => void;
  stop: (event: AudioTrackEvent<Kind, "stop">) => void;
  change: (event: AudioTrackEvent<Kind, "change">) => void;
};

export type AudioTrackDispatch<Kind> = (event: {
  type: keyof AudioTrackEventMap<Kind>;
}) => void;

export type AudioTrackPlayOptions = {
  output?: AudioNode;
  currentTime?: number;
  startTime?: number;
};

export interface AudioTrack<Kind> extends Emitter<AudioTrackEventMap<Kind>> {
  readonly id: string;
  readonly kind: Kind;
  readonly isPlaying: boolean;

  name: string;
  readonly duration: number;

  locked: boolean;
  muted: boolean;
  volume: number;
  balance: number;

  addSequence<Type extends string>(sequence: AudioSequence<Kind, Type>): void;
  countSequences(): number;
  getSequence<Type extends string>(
    id: string,
  ): AudioSequence<Kind, Type> | void;
  getSequences<Type extends string>(): Iterable<AudioSequence<Kind, Type>>;
  removeSequence<Type extends string>(
    sequence: AudioSequence<Kind, Type> | string,
  ): boolean;

  /**
   * Start track playback, resolve when ended
   */
  play(context: AudioContext, options?: AudioTrackPlayOptions): Promise<void>;
  seek(time: number): void;
  stop(): void;
}
