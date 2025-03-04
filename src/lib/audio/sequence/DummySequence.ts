import { nanoid } from "nanoid";
import { createEmitter } from "../../emitter";
import {
  trackPropertySymbol,
  type AudioSequence,
  type AudioSequenceEventMap,
  type AudioSequenceInternal,
} from "../sequence";

interface AudioDummySequenceInternal extends AudioSequenceInternal {
  playing: boolean;
  startTime: number;
  startTS?: number;
}

export type DummySequenceType = typeof dummySequenceType;

export interface DummySequence extends AudioSequence<DummySequenceType> {}

export const dummySequenceType = "dummy" as const;

export function createDummySequence(time: number): DummySequence {
  const internal: AudioDummySequenceInternal = {
    id: nanoid(),
    selected: false,
    playbackRate: 1,
    playing: false,
    startTime: 0,
    time,
  };

  const { dispatchEvent, ...emitter } = createEmitter<
    AudioSequenceEventMap<DummySequenceType>
  >((event) => {
    event.sequence = sequence;
    return event;
  });

  const getDuration = () => {
    const ts = internal.startTS ?? Date.now();

    return (Date.now() - ts) / 1000;
  };

  const sequence: DummySequence = {
    get [trackPropertySymbol]() {
      return internal.track;
    },
    set [trackPropertySymbol](value) {
      internal.track = value;
    },

    get type() {
      return dummySequenceType;
    },

    get id() {
      return internal.id;
    },

    get track() {
      return internal.track;
    },

    get buffer() {
      return new AudioBuffer({ length: 1, sampleRate: 44100 });
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
      return getDuration();
    },
    get playbackDuration() {
      return getDuration();
    },

    get isPlaying() {
      return internal.playing;
    },

    get playbackRate() {
      return internal.playbackRate;
    },
    set playbackRate(value) {
      throw new Error(
        `Cannot change the playback rate of a dummy audio sequence (${value}x)`
      );
    },
    get selected() {
      return internal.selected;
    },
    set selected(value) {
      const hasChanged = internal.selected !== value;

      internal.selected = value;

      if (hasChanged) {
        dispatchEvent({ type: "change" });
      }
    },

    async play(_, options) {
      if (internal.playing) {
        return;
      }

      internal.playing = true;
      internal.startTime = options?.startTime ?? 0;
      internal.startTS = Date.now();

      dispatchEvent({ type: "play" });
    },
    seek(time) {
      internal.startTime = time;

      if (internal.playing) {
        dispatchEvent({ type: "seek" });
      }
    },
    stop() {
      if (!internal.playing) {
        return;
      }

      internal.playing = false;

      dispatchEvent({ type: "stop" });
    },

    ...emitter,
  };

  return sequence;
}
