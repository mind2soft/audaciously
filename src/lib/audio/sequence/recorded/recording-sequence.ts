import type { RecordedTrackKind } from "../../track/recorded";
import { createAudioSequence } from "../sequence";
import { type RecordingSequence, type RecordingSequenceType, recordingSequenceType } from "./index";

// ─── Sentinel empty buffer ────────────────────────────────────────────────────

/**
 * A sentinel empty buffer (1 sample) used before the first decoded chunk
 * arrives.  Re-using the same object lets Vue skip re-renders when the
 * buffer has not changed yet.
 */
const emptyBuffer = new AudioBuffer({ length: 1, sampleRate: 44100 });

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRecordingSequence(time: number): RecordingSequence {
  return createAudioSequence<RecordedTrackKind, RecordingSequenceType, RecordingSequence>(
    recordingSequenceType,
    time,
    (_base, dispatchEvent) => {
      let playing = false;
      let startTS: number | undefined;
      let buffer: AudioBuffer = emptyBuffer;

      /**
       * Live duration: wall-clock seconds since `play()` was called.
       * The track width grows in real time between decoded chunk arrivals.
       */
      const getLiveDuration = () => {
        const ts = startTS ?? Date.now();
        return (Date.now() - ts) / 1000;
      };

      return {
        get buffer() {
          return buffer;
        },

        /**
         * Visual size of this sequence: larger of live wall-clock duration
         * and the decoded preview buffer duration.
         */
        get duration() {
          return Math.max(getLiveDuration(), buffer.duration);
        },
        get playbackDuration() {
          return Math.max(getLiveDuration(), buffer.duration);
        },

        get isPlaying() {
          return playing;
        },

        set playbackRate(_: number) {
          throw new Error("Cannot change playback rate of a recording sequence");
        },

        updateBuffer(newBuffer: AudioBuffer) {
          buffer = newBuffer;
          dispatchEvent({ type: "change" });
        },

        async play(_context: AudioContext, _options?: { startTime?: number }) {
          if (playing) return;
          playing = true;
          startTS = Date.now();
          dispatchEvent({ type: "play" });
        },

        seek(_time: number) {
          if (playing) dispatchEvent({ type: "seek" });
        },

        stop() {
          if (!playing) return;
          playing = false;
          dispatchEvent({ type: "stop" });
        },
      };
    },
  );
}
