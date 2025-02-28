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
  Type extends string,
  EventType extends AudioSequenceEventType
> {
  type: EventType;
  sequence: AudioSequence<Type>;
}

export type AudioSequenceEventMap<Type extends string> = {
  play: (event: AudioSequenceEvent<Type, "play">) => void;
  seek: (event: AudioSequenceEvent<Type, "seek">) => void;
  stop: (event: AudioSequenceEvent<Type, "stop">) => void;
  change: (event: AudioSequenceEvent<Type, "change">) => void;
};

export type AudioSequenceEventType = keyof AudioSequenceEventMap<any>;

export interface AudioSequence<Type extends string>
  extends Emitter<AudioSequenceEventType, AudioSequenceEventMap<Type>> {
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
