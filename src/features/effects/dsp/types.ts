// features/effects/dsp/types.ts
// Pure-data context for DSP effect processors — no Web Audio API dependency.

/** Context provided to each DSP effect processor. */
export interface DspContext {
  /** Sample rate of the audio data (Hz). */
  readonly sampleRate: number;
  /** Total duration of the buffer in seconds. */
  readonly duration: number;
  /** Playback offset in seconds (used by fade timing). */
  readonly offset: number;
}
