import { nanoid } from "nanoid";
import { createEmitter, type Emitter } from "../emitter";
import type { AudioSequence } from "./sequence";

export type AudioTrackPlayOptions = {
  output?: AudioNode;
  currentTime?: number;
  startTime?: number;
};

interface AudioTrackInternal {
  id: string;
  locked: boolean;
  muted: boolean;
  sequences: AudioSequence[];
  activeGain?: GainNode;
}

interface AudioTrackEvent<EventType extends AudioTrackEventType> {
  type: EventType;
  track: AudioTrack;
}

type AudioTrackEventMap = {
  play: (event: AudioTrackEvent<"play">) => void;
  stop: (event: AudioTrackEvent<"stop">) => void;
  change: (event: AudioTrackEvent<"change">) => void;
};

type AudioTrackEventType = keyof AudioTrackEventMap;

export interface AudioTrack
  extends Emitter<AudioTrackEventType, AudioTrackEventMap> {
  readonly id: string;
  readonly isPlaying: boolean;

  readonly name: string;
  readonly duration: number;

  locked: boolean;
  muted: boolean;

  addSequence(sequence: AudioSequence): void;
  countSequences(): number;
  getSequence(id: string): AudioSequence | void;
  getSequences(): Iterable<AudioSequence>;
  removeSequence(sequence: AudioSequence | string): boolean;

  /**
   * Start track playback, resolve when ended
   */
  play(context: AudioContext, options?: AudioTrackPlayOptions): Promise<void>;
  seek(time: number): void;
  stop(): void;
}

function checkOverlap(a: AudioSequence, b: AudioSequence) {
  const a1 = a.time;
  const a2 = a1 + a.playbackDuration;
  const b1 = b.time;
  const b2 = b1 + b.playbackDuration;

  return (a1 >= b1 && a1 <= b2) || (b1 >= a1 && b1 <= a2);
}

export const createAudioTrack = (name: string): AudioTrack => {
  const internal: AudioTrackInternal = {
    id: nanoid(),
    locked: false,
    muted: false,
    sequences: [],
  };

  const { dispatchEvent, ...emitter } = createEmitter<
    AudioTrackEventType,
    AudioTrackEventMap,
    AudioTrackEvent<AudioTrackEventType>
  >((event) => {
    event.track = track;
    return event;
  });

  const handleSequenceStop = () => {
    const anyPlaying = internal.sequences.some((seq) => seq.isPlaying);

    if (!anyPlaying && internal.activeGain) {
      internal.activeGain?.disconnect();
      internal.activeGain = undefined;

      dispatchEvent({ type: "stop" });
    }
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

    addSequence(sequence: AudioSequence) {
      for (const seq of internal.sequences) {
        if (checkOverlap(seq, sequence)) {
          throw new Error("audio sequence overlap");
        }
      }

      internal.sequences.push(sequence);
      internal.sequences.sort((a, b) => a.time - b.time);

      sequence.addEventListener("stop", handleSequenceStop);

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
        });
      }

      dispatchEvent({ type: "change" });

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
