import { nanoid } from "nanoid";
import type { ProjectNodeID } from "../../../features/nodes/node";
import { createEmitter } from "../../emitter";
import { type AudioSequence, trackPropertySymbol } from "../sequence/index";
import { checkSequenceOverlap } from "../sequence/utils";
import type { AudioTrack, AudioTrackDispatch, AudioTrackEventMap, AudioTrackJSON } from "./index";

export type AudioTrackID = string;

interface AudioTrackInternal<TrackKind extends string> {
  id: ProjectNodeID;
  locked: boolean;
  muted: boolean;
  volume: number;
  balance: number;
  sequences: AudioSequence<TrackKind, string>[];
  activeGain?: GainNode;
  activePanner?: StereoPannerNode;
}

type AudioTrackSupplemental<TrackKind extends string, Track extends AudioTrack<TrackKind>> = (
  base: AudioTrack<TrackKind>,
  dispatchEvent: AudioTrackDispatch<TrackKind>,
) => Omit<Track, keyof AudioTrack<TrackKind>>;

export const createAudioTrack = <TrackKind extends string, Track extends AudioTrack<TrackKind>>(
  kind: TrackKind,
  initialName: string,
  supplmental?: AudioTrackSupplemental<TrackKind, Track>,
  id?: AudioTrackID,
): Track => {
  let name = initialName;
  const internal: AudioTrackInternal<TrackKind> = {
    id: id ?? nanoid(),
    locked: false,
    muted: false,
    volume: 1,
    balance: 0,
    sequences: [],
  };

  const { dispatchEvent, ...emitter } = createEmitter<AudioTrackEventMap<TrackKind>>((event) => {
    event.track = track;
    return event;
  });

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

  const track: AudioTrack<TrackKind> = {
    get id() {
      return internal.id;
    },

    get kind(): TrackKind {
      return kind;
    },

    get isPlaying() {
      return internal.sequences.some((seq) => seq.isPlaying);
    },

    get name() {
      return name;
    },
    set name(value) {
      name = value;
      dispatchEvent({ type: "change" });
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

    addSequence<SV extends string>(sequence: AudioSequence<TrackKind, SV>) {
      if (sequence.track) {
        throw new Error("sequence already in a track");
      }

      for (const seq of internal.sequences) {
        if (checkSequenceOverlap(seq, sequence)) {
          throw new Error("audio sequence overlap");
        }
      }

      sequence[trackPropertySymbol] = track;

      internal.sequences.push(sequence as unknown as AudioSequence<TrackKind, string>);
      internal.sequences.sort((a, b) => a.time - b.time);

      sequence.addEventListener("stop", handleSequenceStop);
      sequence.addEventListener("change", handleSequenceChange);

      dispatchEvent({ type: "change" });
    },
    countSequences() {
      return internal.sequences.length;
    },
    getSequence<SV extends string>(id: string): AudioSequence<TrackKind, SV> | undefined {
      return internal.sequences.find((seq) => id === seq.id) as unknown as
        | AudioSequence<TrackKind, SV>
        | undefined;
    },
    *getSequences<SV extends string>(): Iterable<AudioSequence<TrackKind, SV>> {
      for (const sequence of internal.sequences) {
        yield sequence as unknown as AudioSequence<TrackKind, SV>;
      }
    },
    removeSequence<SV extends string>(sequence: AudioSequence<TrackKind, SV> | string) {
      const seqId = typeof sequence === "string" ? sequence : sequence.id;
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

      // Nothing to play yet (e.g. instrument track before its first render
      // completes).  Return early so that syncTrack() can call base.play()
      // again once the AudioBuffer is ready without hitting the activeGain
      // guard above.
      if (internal.sequences.length === 0) {
        return;
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
          }),
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

      // Always tear down the gain/panner nodes on an explicit stop so that
      // internal.activeGain is never left set after playback ends.  Without
      // this, a subsequent call to play() would throw "already playing audio
      // track" because the guard at the top of play() checks activeGain.
      if (internal.activeGain) {
        internal.activeGain.disconnect();
        internal.activeGain = undefined;

        internal.activePanner?.disconnect();
        internal.activePanner = undefined;
      }
    },

    toJSON(): AudioTrackJSON {
      return {
        id: internal.id,
        kind: kind as string,
        name,
        volume: internal.volume,
        balance: internal.balance,
        muted: internal.muted,
        locked: internal.locked,
      };
    },

    ...emitter,
  };

  const supplementalProps = supplmental?.(
    track,
    dispatchEvent as unknown as AudioTrackDispatch<TrackKind>,
  );

  // Use Object.defineProperties so that getter/setter pairs from the
  // supplemental (e.g. `showWaveform`, `bpm`, `notes`, `isPlaying`) are
  // preserved as live accessors rather than being snapshotted as plain
  // values by an object spread.
  const result = Object.create(null) as Track;
  Object.defineProperties(result, {
    ...Object.getOwnPropertyDescriptors(track),
    ...(supplementalProps ? Object.getOwnPropertyDescriptors(supplementalProps) : {}),
  });

  return result;
};
