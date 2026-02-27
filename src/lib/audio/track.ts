import { nanoid } from "nanoid";
import { createEmitter, type Emitter } from "../emitter";
import { trackPropertySymbol, type AudioSequence } from "./sequence";

export type AudioTrackPlayOptions = {
  output?: AudioNode;
  currentTime?: number;
  startTime?: number;
};

interface AudioTrackInternal {
  id: string;
  locked: boolean;
  muted: boolean;
  volume: number;
  balance: number;
  sequences: AudioSequence<any>[];
  activeGain?: GainNode;
  activePanner?: StereoPannerNode;
}

interface AudioTrackEvent<EventType extends string> {
  type: EventType;
  track: AudioTrack;
}

type AudioTrackEventMap = {
  play: (event: AudioTrackEvent<"play">) => void;
  stop: (event: AudioTrackEvent<"stop">) => void;
  change: (event: AudioTrackEvent<"change">) => void;
};

export interface AudioTrack extends Emitter<AudioTrackEventMap> {
  readonly id: string;
  readonly isPlaying: boolean;

  readonly name: string;
  readonly duration: number;

  locked: boolean;
  muted: boolean;
  volume: number;
  balance: number;

  addSequence<Type extends string>(sequence: AudioSequence<Type>): void;
  countSequences(): number;
  getSequence<Type extends string>(id: string): AudioSequence<Type> | void;
  getSequences<Type extends string>(): Iterable<AudioSequence<Type>>;
  removeSequence<Type extends string>(
    sequence: AudioSequence<Type> | string
  ): boolean;

  /**
   * Start track playback, resolve when ended
   */
  play(context: AudioContext, options?: AudioTrackPlayOptions): Promise<void>;
  seek(time: number): void;
  stop(): void;
}

function checkOverlap(
  a: AudioSequence<any>,
  b: AudioSequence<any>,
  tolerance = 0.001
) {
  const a1 = a.time;
  const a2 = a1 + a.playbackDuration;
  const b1 = b.time;
  const b2 = b1 + b.playbackDuration;
  const overlap =
    (a1 > b1 + tolerance && a1 < b2 - tolerance) ||
    (b1 > a1 + tolerance && b1 < a2 - tolerance);

  if (overlap)
    console.warn(
      "Overlap detected",
      a1,
      a2,
      b1,
      b2,
      a1 > b1 + tolerance,
      a1 < b2 - tolerance,
      b1 > a1 + tolerance,
      b1 < a2 - tolerance
    );

  return overlap;
}

export const createAudioTrack = (name: string): AudioTrack => {
  const internal: AudioTrackInternal = {
    id: nanoid(),
    locked: false,
    muted: false,
    volume: 1,
    balance: 0,
    sequences: [],
  };

  const { dispatchEvent, ...emitter } = createEmitter<AudioTrackEventMap>(
    (event) => {
      event.track = track;
      return event;
    }
  );

  const handleSequenceStop = () => {
    const anyPlaying = internal.sequences.some((seq) => seq.isPlaying);

    if (!anyPlaying && internal.activeGain) {
      internal.activeGain?.disconnect();
      internal.activeGain = undefined;

      internal.activePanner?.disconnect();
      internal.activePanner = undefined;

      dispatchEvent({ type: "stop" });
    }
  };
  const handleSequenceChange = () => {
    internal.sequences.sort((a, b) => a.time - b.time);
    dispatchEvent({ type: "change" });
  };

  const track: AudioTrack = {
    get id() {
      return internal.id;
    },

    get isPlaying() {
      return internal.sequences.some((seq) => seq.isPlaying);
    },

    get name() {
      return name;
    },

    get duration() {
      if (internal.sequences.length) {
        return internal.sequences.reduce((max, seq) => {
          return Math.max(max, seq.time + seq.playbackDuration);
        }, 0);
      } else {
        return 0;
      }
    },

    get locked() {
      return internal.locked;
    },
    set locked(value) {
      internal.locked = value;
      dispatchEvent({ type: "change" });
    },

    get muted() {
      return internal.muted;
    },
    set muted(value) {
      internal.muted = value;

      if (internal.activeGain) {
        internal.activeGain.gain.value = value ? 0 : internal.volume;
      }

      dispatchEvent({ type: "change" });
    },

    get volume() {
      return internal.volume;
    },
    set volume(value) {
      internal.volume = value;

      if (internal.activeGain && !internal.muted) {
        internal.activeGain.gain.value = value;
      }

      dispatchEvent({ type: "change" });
    },

    get balance() {
      return internal.balance;
    },
    set balance(value) {
      internal.balance = value;

      if (internal.activePanner) {
        internal.activePanner.pan.value = value;
      }

      dispatchEvent({ type: "change" });
    },

    addSequence(sequence) {
      if (sequence.track) {
        throw new Error("sequence already in a track");
      }

      for (const seq of internal.sequences) {
        if (checkOverlap(seq, sequence)) {
          throw new Error("audio sequence overlap");
        }
      }

      sequence[trackPropertySymbol] = track;

      internal.sequences.push(sequence);
      internal.sequences.sort((a, b) => a.time - b.time);

      sequence.addEventListener("stop", handleSequenceStop);
      sequence.addEventListener("change", handleSequenceChange);

      dispatchEvent({ type: "change" });
    },
    countSequences() {
      return internal.sequences.length;
    },
    getSequence(id) {
      return internal.sequences.find((seq) => id === seq.id);
    },
    *getSequences() {
      for (const sequence of internal.sequences) {
        yield sequence;
      }
    },
    removeSequence(sequence) {
      const seqId = (sequence =
        typeof sequence === "string" ? sequence : sequence.id);

      const seqIndex = internal.sequences.findIndex((s) => s.id === seqId);
      const foundSeq = seqIndex >= 0;

      if (foundSeq) {
        internal.sequences.splice(seqIndex, 1).forEach((seq) => {
          seq.removeEventListener("stop", handleSequenceStop);
          seq.removeEventListener("change", handleSequenceChange);
          seq.stop();
          seq[trackPropertySymbol] = undefined;
        });

        dispatchEvent({ type: "change" });

        handleSequenceStop();
      }

      return foundSeq;
    },

    async play(context, options = {}) {
      if (internal.activeGain) {
        throw new Error("already playing audio track");
      }

      const promises: Promise<void>[] = [];
      const currentTime = options.currentTime ?? context.currentTime;
      const startTime = options.startTime ?? 0;
      const outputNode = options.output ?? context.destination;

      const pannerNode = context.createStereoPanner();
      pannerNode.pan.value = internal.balance;
      pannerNode.connect(outputNode);

      const gainNode = context.createGain();
      gainNode.gain.value = internal.muted ? 0 : internal.volume;
      gainNode.connect(pannerNode);

      internal.activeGain = gainNode;
      internal.activePanner = pannerNode;

      for (const sequence of internal.sequences) {
        promises.push(
          sequence.play(context, {
            output: gainNode,
            currentTime,
            startTime,
          })
        );
      }

      await Promise.all(promises);

      dispatchEvent({ type: "play" });
    },
    seek(time) {
      if (internal.activeGain) {
        for (const sequence of internal.sequences) {
          sequence.seek(time);
        }
      }
    },
    stop() {
      for (const sequence of internal.sequences) {
        sequence.stop();
      }
    },

    ...emitter,
  };

  return track;
};
