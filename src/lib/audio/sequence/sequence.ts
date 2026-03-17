import { nanoid } from "nanoid";
import { createEmitter } from "../../emitter";
import {
  type AudioSequence,
  type AudioSequenceEventMap,
  type AudioSequenceInternal,
  type AudioSequenceJSON,
  trackPropertySymbol,
} from "./index";

// ─── Supplemental ─────────────────────────────────────────────────────────────

export type AudioSequenceDispatch<TrackKind extends string, SequenceVariant> = (event: {
  type: keyof AudioSequenceEventMap<TrackKind, SequenceVariant>;
}) => void;

/**
 * A supplemental callback receives the base sequence object and a dispatcher,
 * and returns only the properties that specialise the sequence beyond the base.
 *
 * Mirrors the AudioTrackSupplemental pattern from track/track.ts.
 */
export type AudioSequenceSupplemental<
  TrackKind extends string,
  SequenceVariant,
  Seq extends AudioSequence<TrackKind, SequenceVariant>,
> = (
  base: AudioSequence<TrackKind, SequenceVariant>,
  dispatchEvent: AudioSequenceDispatch<TrackKind, SequenceVariant>,
) => Omit<Seq, keyof AudioSequence<TrackKind, SequenceVariant>>;

// ─── Factory ──────────────────────────────────────────────────────────────────

export const createAudioSequence = <
  TrackKind extends string,
  SequenceVariant,
  Sequence extends AudioSequence<TrackKind, SequenceVariant>,
>(
  type: SequenceVariant,
  time: number,
  supplemental?: AudioSequenceSupplemental<TrackKind, SequenceVariant, Sequence>,
  id?: string,
): Sequence => {
  const internal: AudioSequenceInternal<TrackKind> = {
    id: id ?? nanoid(),
    selected: false,
    playbackRate: 1,
    time,
  };

  const { dispatchEvent, ...emitter } = createEmitter<
    AudioSequenceEventMap<TrackKind, SequenceVariant>
  >((event) => {
    event.sequence = sequence;
    return event;
  });

  const sequence: AudioSequence<TrackKind, SequenceVariant> = {
    get [trackPropertySymbol]() {
      return internal.track;
    },
    set [trackPropertySymbol](value) {
      internal.track = value;
    },

    get type(): SequenceVariant {
      return type;
    },

    get id() {
      return internal.id;
    },

    get track() {
      return internal.track;
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

    get playbackRate() {
      return internal.playbackRate;
    },
    set playbackRate(value) {
      internal.playbackRate = value;
    },

    // ── Deferred to supplemental ───────────────────────────────────────────────
    // These must be overridden by every specialised sequence.
    get duration(): number {
      return 0;
    },
    get playbackDuration(): number {
      return 0;
    },
    get isPlaying(): boolean {
      return false;
    },
    async play(_context: AudioContext) {},
    seek(_time: number) {},
    stop() {},

    toJSON(): AudioSequenceJSON {
      return {
        id: internal.id,
        time: internal.time,
        playbackRate: internal.playbackRate,
      };
    },

    ...emitter,
  };

  const supplementalProps = supplemental?.(
    sequence,
    dispatchEvent as unknown as AudioSequenceDispatch<TrackKind, SequenceVariant>,
  );

  // Use Object.defineProperties so that getter/setter pairs from the
  // supplemental (e.g. `isPlaying`, `duration`, `buffer`, `playbackRate`)
  // are preserved as live accessors rather than being snapshotted as plain
  // values by an object spread.
  const result = Object.create(null) as Sequence;
  Object.defineProperties(result, {
    ...Object.getOwnPropertyDescriptors(sequence),
    ...(supplementalProps ? Object.getOwnPropertyDescriptors(supplementalProps) : {}),
  });

  return result;
};
