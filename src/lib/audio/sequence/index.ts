import type { Emitter } from "../../emitter";
import type { AudioTrack } from "../track";

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

export interface AudioSequenceInternal<Kind> {
  id: string;
  track?: AudioTrack<Kind>;
  playbackRate: number;
  selected: boolean;
  time: number;
}

export interface AudioSequenceEvent<EventType extends string, Kind, Type> {
  type: EventType;
  sequence: AudioSequence<Kind, Type>;
}

export type AudioSequenceEventMap<Kind, Type> = {
  play: (event: AudioSequenceEvent<"play", Kind, Type>) => void;
  seek: (event: AudioSequenceEvent<"seek", Kind, Type>) => void;
  stop: (event: AudioSequenceEvent<"stop", Kind, Type>) => void;
  change: (event: AudioSequenceEvent<"change", Kind, Type>) => void;
};

export interface AudioSequence<Kind, Type> extends Emitter<
  AudioSequenceEventMap<Kind, Type>
> {
  [trackPropertySymbol]?: AudioTrack<Kind>;

  readonly type: Type;
  readonly id: string;
  readonly duration: number;
  readonly playbackDuration: number;
  readonly isPlaying: boolean;
  readonly track?: AudioTrack<Kind>;

  time: number;
  playbackRate: number;
  selected: boolean;

  play(
    context: AudioContext,
    options?: AudioSequencePlayOptions,
  ): Promise<void>;
  seek(time: number): void;
  stop(): void;
}

export interface BufferedAudioSequence<Kind> extends AudioSequence<
  Kind,
  BufferedAudioSequenceType
> {
  readonly buffer: AudioBuffer;
}

export const trackPropertySymbol = Symbol.for("@@trackProperty");

export const bufferedAudioSequenceType = "audioBuffer" as const;
