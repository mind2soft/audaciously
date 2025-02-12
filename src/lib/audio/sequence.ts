import { nanoid } from "nanoid";
import { createEmitter, type Emitter } from "../emitter";

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

interface AudioSequencePlayback {
  context: AudioContext;
  outputNode: AudioNode;
  activeSource?: AudioBufferSourceNode;
  controller?: AbortController;
}

interface AudioSequenceInternal {
  id: string;
  playbackRate: number;
  playback?: AudioSequencePlayback;
}

interface AudioSequenceEvent<EventType extends AudioSequenceEventType> {
  type: EventType;
  sequence: AudioSequence;
}

type AudioSequenceEventMap = {
  play: (event: AudioSequenceEvent<"play">) => void;
  seek: (event: AudioSequenceEvent<"seek">) => void;
  stop: (event: AudioSequenceEvent<"stop">) => void;
  change: (event: AudioSequenceEvent<"change">) => void;
};

type AudioSequenceEventType = keyof AudioSequenceEventMap;

export interface AudioSequence
  extends Emitter<AudioSequenceEventType, AudioSequenceEventMap> {
  readonly id: string;
  readonly duration: number;
  readonly playbackDuration: number;
  readonly isPlaying: boolean;

  time: number;
  playbackRate: number;

  play(
    context: AudioContext,
    options?: AudioSequencePlayOptions
  ): Promise<void>;
  seek(time: number): void;
  stop(): void;
}

export interface BufferAudioSequence extends AudioSequence {
  buffer: AudioBuffer;
}

export function createBufferAudioSequence(
  buffer: AudioBuffer,
  time: number,
  effects?: AudioEffect[]
): BufferAudioSequence {
  const internal: AudioSequenceInternal = {
    id: nanoid(),
    playbackRate: 1,
  };

  const { dispatchEvent, ...emitter } = createEmitter<
    AudioSequenceEventType,
    AudioSequenceEventMap,
    AudioSequenceEvent<AudioSequenceEventType>
  >((event) => {
    event.sequence = sequence;
    return event;
  });

  effects = effects || [];

  function initPlayback(context: AudioContext, outputNode?: AudioNode) {
    internal.playback = {
      context,
      outputNode: outputNode ?? context.destination,
    };
  }
  function startPlayback(startTime: number, currentTime?: number) {
    if (!internal.playback || time + buffer.duration < startTime) {
      return;
    }

    const sourceTime = time - startTime;
    const controller = new AbortController();
    const source = internal.playback.context.createBufferSource();

    currentTime = currentTime ?? internal.playback.context.currentTime;

    source.buffer = buffer;
    source.playbackRate.value = internal.playbackRate;

    internal.playback.activeSource = source;
    internal.playback.controller = controller;

    // TODO: apply effects

    source.connect(internal.playback.outputNode); // TOOD: effects
    source.addEventListener(
      "ended",
      () => {
        cleanupPlayback();
        dispatchEvent({ type: "stop" });
        console.log("sequence ended");
      },
      { signal: controller.signal }
    );

    if (sourceTime >= 0) {
      source.start(currentTime + sourceTime);
    } else {
      source.start(currentTime, -sourceTime);
    }
  }
  function stopPlayback() {
    if (internal.playback?.activeSource) {
      internal.playback.controller?.abort();
      internal.playback.activeSource.stop();
      internal.playback.activeSource.disconnect();
      internal.playback.activeSource = undefined;
    }
  }
  function cleanupPlayback() {
    stopPlayback();
    internal.playback = undefined;
  }

  const sequence: BufferAudioSequence = {
    get id() {
      return internal.id;
    },

    get duration() {
      return buffer.duration;
    },
    get playbackDuration() {
      return buffer.duration / internal.playbackRate;
    },

    get isPlaying() {
      return !!internal.playback?.activeSource;
    },

    get playbackRate() {
      return internal.playbackRate;
    },
    set playbackRate(value) {
      const hasChanged = value !== internal.playbackRate;

      internal.playbackRate = value;

      if (hasChanged && internal.playback?.activeSource) {
        internal.playback.activeSource.playbackRate.value =
          internal.playbackRate;

        dispatchEvent({ type: "change" });
      }
    },

    time,
    buffer,

    async play(context, options = {}) {
      if (internal.playback?.activeSource) {
        return;
      }

      const startTime = options.startTime ?? 0;

      initPlayback(context, options.output);
      startPlayback(startTime, options.currentTime);
      dispatchEvent({ type: "play" });
    },
    seek(time) {
      if (!internal.playback) {
        return;
      }

      stopPlayback();
      startPlayback(time);
      dispatchEvent({ type: "seek" });
    },
    stop() {
      cleanupPlayback();
      dispatchEvent({ type: "stop" });
    },

    ...emitter,
  };

  return sequence;
}

// export function createAudioSequence(
//   buffer: AudioBuffer,
//   time: number,
//   effects?: AudioEffect[]
// ): AudioSequence {
//   const id = nanoid();

//   effects = effects || [];

//   return {
//     get id() {
//       return id;
//     },

//     time,
//     // buffer,
//     // effects,

//     getSource(context, output) {
//       const source = context.createBufferSource();

//       source.buffer = buffer;

//       source.connect(output); // TOOD: effects

//       return source;
//     },
//   };
// }
