import { nanoid } from "nanoid";
import { createEmitter } from "../../emitter";
import {
  trackPropertySymbol,
  type AudioSequence,
  type AudioSequenceEventMap,
  type AudioSequenceInternal,
  type AudioSequencePlayOptions,
} from "../sequence";

interface RecordingSequenceInternal extends AudioSequenceInternal {
  playing: boolean;
  startTime: number;
  startTS?: number;
  buffer: AudioBuffer;
}

export type RecordingSequenceType = typeof recordingSequenceType;

export interface RecordingSequence extends AudioSequence<RecordingSequenceType> {
  /**
   * Replace the preview buffer with a freshly-decoded chunk and fire a
   * `change` event so the waveform component re-renders.
   */
  updateBuffer(buffer: AudioBuffer): void;
}

export const recordingSequenceType = "recording" as const;

/**
 * A sentinel empty buffer (1 sample) used before the first decoded chunk
 * arrives.  Re-using the same object lets Vue skip re-renders when the
 * buffer has not changed yet.
 */
const emptyBuffer = new AudioBuffer({ length: 1, sampleRate: 44100 });

export function createRecordingSequence(time: number): RecordingSequence {
  const internal: RecordingSequenceInternal = {
    id: nanoid(),
    selected: false,
    playbackRate: 1,
    playing: false,
    startTime: 0,
    time,
    buffer: emptyBuffer,
  };

  const { dispatchEvent, ...emitter } = createEmitter<
    AudioSequenceEventMap<RecordingSequenceType>
  >((event) => {
    event.sequence = sequence;
    return event;
  });

  /**
   * Live duration: wall-clock seconds since `play()` was called.
   * Mirrors the DummySequence approach so the track width grows in real time.
   */
  const getLiveDuration = () => {
    const ts = internal.startTS ?? Date.now();
    return (Date.now() - ts) / 1000;
  };

  const sequence: RecordingSequence = {
    get [trackPropertySymbol]() {
      return internal.track;
    },
    set [trackPropertySymbol](value) {
      internal.track = value;
    },

    get type() {
      return recordingSequenceType;
    },

    get id() {
      return internal.id;
    },

    get track() {
      return internal.track;
    },

    /**
     * The most recently decoded preview buffer.  Starts as a 1-sample empty
     * buffer; replaced every ~2 s (or whatever the recorder timeslice is) as
     * chunks arrive and are decoded.
     */
    get buffer() {
      return internal.buffer;
    },

    get time() {
      return internal.time;
    },
    set time(value) {
      const hasChanged = value !== internal.time;
      internal.time = value;
      if (hasChanged) dispatchEvent({ type: "change" });
    },

    /**
     * The visual (and track-duration) size of this sequence.  Uses the larger
     * of the live wall-clock duration and the decoded buffer duration so the
     * track area grows continuously even between chunk decodes.
     */
    get duration() {
      return Math.max(getLiveDuration(), internal.buffer.duration);
    },
    get playbackDuration() {
      return Math.max(getLiveDuration(), internal.buffer.duration);
    },

    get isPlaying() {
      return internal.playing;
    },

    get playbackRate() {
      return internal.playbackRate;
    },
    set playbackRate(_) {
      throw new Error("Cannot change playback rate of a recording sequence");
    },

    get selected() {
      return internal.selected;
    },
    set selected(value) {
      const hasChanged = internal.selected !== value;
      internal.selected = value;
      if (hasChanged) dispatchEvent({ type: "change" });
    },

    updateBuffer(buffer: AudioBuffer) {
      internal.buffer = buffer;
      dispatchEvent({ type: "change" });
    },

    async play(_context: AudioContext, options?: AudioSequencePlayOptions) {
      if (internal.playing) return;
      internal.playing = true;
      internal.startTime = options?.startTime ?? 0;
      internal.startTS = Date.now();
      dispatchEvent({ type: "play" });
    },
    seek(time: number) {
      internal.startTime = time;
      if (internal.playing) dispatchEvent({ type: "seek" });
    },
    stop() {
      if (!internal.playing) return;
      internal.playing = false;
      dispatchEvent({ type: "stop" });
    },

    ...emitter,
  };

  return sequence;
}
