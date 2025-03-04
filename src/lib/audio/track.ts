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
  sequences: AudioSequence<any>[];
  activeGain?: GainNode;
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

      dispatchEvent({ type: "stop" });
    }
  };
  const handleSequenceChange = () => {
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
        const seqCount = internal.sequences.length;
        const lastSequence = internal.sequences[seqCount - 1];

        return lastSequence.time + lastSequence.playbackDuration;
      } else {
        return 0;
      }
    },

    get locked() {
      return internal.locked;
    },
    set locked(value) {
      internal.locked = value;

      // TODO : update selection
    },

    get muted() {
      return internal.muted;
    },
    set muted(value) {
      internal.muted = value;

      if (internal.activeGain) {
        internal.activeGain.gain.value = +!value;
      }
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

      const gainNode = context.createGain();
      gainNode.gain.value = +!internal.muted;
      gainNode.connect(outputNode);

      internal.activeGain = gainNode;

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
