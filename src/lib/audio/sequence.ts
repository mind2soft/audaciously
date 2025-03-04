import type { Emitter } from "../emitter";
import type { AudioTrack } from "./track";

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

export interface AudioSequenceInternal {
  id: string;
  track?: AudioTrack;
  playbackRate: number;
  selected: boolean;
  time: number;
}

export interface AudioSequenceEvent<
  EventType extends string,
  Type extends string
> {
  type: EventType;
  sequence: AudioSequence<Type>;
}

export type AudioSequenceEventMap<Type extends string> = {
  play: (event: AudioSequenceEvent<"play", Type>) => void;
  seek: (event: AudioSequenceEvent<"seek", Type>) => void;
  stop: (event: AudioSequenceEvent<"stop", Type>) => void;
  change: (event: AudioSequenceEvent<"change", Type>) => void;
};

export interface AudioSequence<Type extends string>
  extends Emitter<AudioSequenceEventMap<Type>> {
  [trackPropertySymbol]?: AudioTrack;

  readonly type: Type;
  readonly id: string;
  readonly duration: number;
  readonly playbackDuration: number;
  readonly isPlaying: boolean;
  readonly track?: AudioTrack;
  readonly buffer: AudioBuffer;

  time: number;
  playbackRate: number;
  selected: boolean;

  play(
    context: AudioContext,
    options?: AudioSequencePlayOptions
  ): Promise<void>;
  seek(time: number): void;
  stop(): void;
}

export const trackPropertySymbol = Symbol.for("@@trackProperty");
