import type { AudioSequence } from "./sequence";

export type AudioTrackPlayOptions = {
  output?: AudioNode;
  currentTime?: number;
  startTime?: number;
};

interface AudioTrackInternal {
  playbackRate: number;
  sequences: AudioSequence[];
  activeSources: Set<AudioBufferSourceNode>;
  resolvePlaying?: Function;
}

export interface AudioTrack {
  readonly isPlaying: boolean;

  readonly name: string;
  readonly duration: number;

  playbackRate: number;

  addSequence(sequence: AudioSequence, index?: number): void;
  countSequences(): number;
  getSequence(index: number): AudioSequence | void;
  getSequences(): Iterable<AudioSequence>;
  removeSequence(...index: number[]): void;

  /**
   * Start track playback, resolve when ended
   */
  play(context: AudioContext, options?: AudioTrackPlayOptions): Promise<void>;
  stop(): void;
}

function checkOverlap(a: AudioSequence, b: AudioSequence) {
  const a1 = a.time;
  const a2 = a1 + a.buffer.duration;
  const b1 = b.time;
  const b2 = b1 + b.buffer.duration;

  return (a1 >= b1 && a1 <= b2) || (b1 >= a1 && b1 <= a2);
}

const createAudioTrack = (name: string): AudioTrack => {
  const internal: AudioTrackInternal = {
    playbackRate: 1,
    sequences: [],
    activeSources: new Set(),
  };

  return {
    get isPlaying() {
      return internal.activeSources.size > 0;
    },

    get name() {
      return name;
    },

    get duration() {
      if (internal.sequences.length) {
        const seqCount = internal.sequences.length;
        const lastSequence = internal.sequences[seqCount - 1];

        return lastSequence.time + lastSequence.buffer.duration;
      } else {
        return 0;
      }
    },

    get playbackRate() {
      return internal.playbackRate;
    },
    set playbackRate(value) {
      internal.playbackRate = value;

      for (const source of internal.activeSources) {
        source.playbackRate.value = value;
      }
    },

    addSequence(sequence: AudioSequence, index?: number) {
      for (const seq of internal.sequences) {
        if (checkOverlap(seq, sequence)) {
          throw new Error("audio sequence overlap");
        }
      }

      if (index !== undefined) {
        internal.sequences.splice(index, 0, sequence);
      } else {
        internal.sequences.push(sequence);
      }
    },
    countSequences() {
      return internal.sequences.length;
    },
    getSequence(index) {
      return internal.sequences[index];
    },
    *getSequences() {
      for (const sequence of internal.sequences) {
        yield sequence;
      }
    },
    removeSequence(...index) {
      for (const i of index.sort().reverse()) {
        internal.sequences.splice(i, 1);
      }
    },

    async play(context, options = {}) {
      if (internal.activeSources.size > 0) {
        throw new Error("already playing audio track");
      }

      const currentTime = options.currentTime ?? context.currentTime;
      const startTime = options.startTime ?? 0;
      const outputNode = options.output ?? context.destination;

      return new Promise((resolve) => {
        internal.resolvePlaying = resolve;

        for (const sequence of internal.sequences) {
          const sourceTime = sequence.time - startTime;
          const source = context.createBufferSource();

          source.buffer = sequence.buffer;

          source.connect(outputNode);
          source.addEventListener("ended", () => {
            internal.activeSources.delete(source);

            if (internal.activeSources.size === 0) {
              const resolvePlaying = internal.resolvePlaying;

              internal.resolvePlaying = undefined;
              resolvePlaying?.();
            }
          });
          internal.activeSources.add(source);

          if (sourceTime >= 0) {
            source.start(currentTime + sourceTime);
          } else {
            source.start(currentTime, -sourceTime);
          }
        }
      });
    },
    stop() {
      internal.activeSources.forEach((source) => {
        source.stop();
        source.disconnect();
      });
      internal.activeSources.clear();

      const resolvePlaying = internal.resolvePlaying;
      internal.resolvePlaying = undefined;
      resolvePlaying?.();
    },
  };
};

export { createAudioTrack };
