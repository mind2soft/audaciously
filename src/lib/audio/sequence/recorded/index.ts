import type { RecordedTrackKind } from "../../track/recorded";
import type { AudioSequence, BufferedAudioSequenceType } from "../index";

// ─── Sequence types ───────────────────────────────────────────────────────────

export type RecordedSequenceType = BufferedAudioSequenceType;

export { bufferedAudioSequenceType as recordedSequenceType } from "../index";

export type RecordingSequenceType = typeof recordingSequenceType;

export const recordingSequenceType = "recording" as const;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface RecordedSequence extends AudioSequence<RecordedTrackKind, RecordedSequenceType> {
  readonly buffer: AudioBuffer;
}

export interface RecordingSequence extends AudioSequence<RecordedTrackKind, RecordingSequenceType> {
  readonly buffer: AudioBuffer;
  /**
   * Replace the preview buffer with a freshly-decoded chunk and fire a
   * `change` event so the waveform component re-renders.
   */
  updateBuffer(buffer: AudioBuffer): void;
}
