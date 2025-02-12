import { nanoid } from "nanoid";
import { createEmitter } from "../../emitter";
import type {
  AudioSequence,
  AudioSequenceEvent,
  AudioSequenceEventMap,
  AudioSequenceEventType,
  AudioSequenceInternal,
} from "../sequence";

interface AudioDummySequenceInternal extends AudioSequenceInternal {
  playing: boolean;
  duration: number;
}

export type DummySequenceType = typeof dummySequenceType;

export interface DummySequence extends AudioSequence<DummySequenceType> {}

export const dummySequenceType = "dummy" as const;

export function createDummySequence(
  time: number,
  duration: number
): DummySequence {
  const internal: AudioDummySequenceInternal = {
    id: nanoid(),
    playbackRate: 1,
    playing: false,
    time,
    duration,
  };

  const { dispatchEvent, ...emitter } = createEmitter<
    AudioSequenceEventType,
    AudioSequenceEventMap<DummySequenceType>,
    AudioSequenceEvent<DummySequenceType, AudioSequenceEventType>
  >((event) => {
    event.sequence = sequence;
    return event;
  });

  const sequence: DummySequence = {
    get type() {
      return dummySequenceType;
    },

    get id() {
      return internal.id;
    },

    get time() {
      return internal.time;
    },
    set time(value) {
      const hasChanged = value !== internal.time;

      internal.time = value;

      if (hasChanged) {
        dispatchEvent({ type: "change" });
      }
    },

    get duration() {
      return internal.duration;
    },
    get playbackDuration() {
      return internal.duration / internal.playbackRate;
    },

    get isPlaying() {
      return internal.playing;
    },

    get playbackRate() {
      return internal.playbackRate;
    },
    set playbackRate(value) {
      const hasChanged = value !== internal.playbackRate;

      internal.playbackRate = value;

      if (hasChanged) {
        dispatchEvent({ type: "change" });
      }
    },

    async play() {
      if (internal.playing) {
        return;
      }

      internal.playing = true;

      dispatchEvent({ type: "play" });
    },
    seek() {
      if (!internal.playing) {
        return;
      }

      dispatchEvent({ type: "seek" });
    },
    stop() {
      if (!internal.playing) {
        return;
      }

      dispatchEvent({ type: "stop" });
    },

    ...emitter,
  };

  return sequence;
}
