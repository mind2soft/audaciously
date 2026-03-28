// features/effects/dsp/types.ts
// Pure-data context for DSP effect processors — no Web Audio API dependency.

/** Context provided to each DSP effect processor. */
export interface DspContext {
  /** Sample rate of the audio data (Hz). */
  readonly sampleRate: number;
  /** Duration of this buffer/chunk in seconds. */
  readonly duration: number;
  /** Playback offset in seconds (used by fade timing). */
  readonly offset: number;
  /**
   * Time position of this chunk's first sample in the full buffer (seconds).
   * For single-shot processing this is always 0.
   */
  readonly globalOffset: number;
  /**
   * Total duration of the full (unchunked) buffer (seconds).
   * For single-shot processing this equals `duration`.
   */
  readonly totalDuration: number;
}

/**
 * Per-effect state carried across chunk boundaries, keyed by effect.id.
 *
 * Current effects (gain, balance, fade, volume) are stateless — the map stays
 * empty. The plumbing exists so future stateful effects (IIR/FIR filters,
 * reverb delay buffers, compressor envelopes) slot in without rearchitecting.
 */
export interface PipelineState {
  readonly effectStates: Map<string, unknown>;
}

/** Create an empty PipelineState. */
export function createPipelineState(): PipelineState {
  return { effectStates: new Map() };
}

/** Result returned by processEffectPipeline. */
export interface PipelineResult {
  /** Whether the pipeline completed without cancellation. */
  readonly completed: boolean;
  /** Updated state to pass to the next chunk (or discard for single-shot). */
  readonly state: PipelineState;
}

/**
 * Build a DspContext for single-shot (non-chunked) processing.
 * Sets globalOffset=0 and totalDuration=duration for backward compatibility.
 */
export function createSingleShotContext(
  sampleRate: number,
  duration: number,
  offset = 0,
): DspContext {
  return { sampleRate, duration, offset, globalOffset: 0, totalDuration: duration };
}

/**
 * Build a DspContext for a single chunk within a chunked session.
 */
export function createChunkContext(
  sampleRate: number,
  chunkDuration: number,
  globalOffset: number,
  totalDuration: number,
): DspContext {
  return { sampleRate, duration: chunkDuration, offset: 0, globalOffset, totalDuration };
}
