/**
 * Pure function that extracts a fixed-resolution waveform chunk from an
 * AudioBuffer (or pristine Float32Array channel data) for a given time window.
 *
 * - Always returns exactly `numSamples` values regardless of zoom level.
 * - Returns 0 for regions outside the buffer bounds (before 0 or after duration).
 * - Uses peak-amplitude (max absolute value) per bucket for visual fidelity.
 * - Never mutates the source data — read-only access.
 */

/**
 * Metadata needed when rendering from a raw Float32Array instead of an
 * AudioBuffer. Mirrors the relevant AudioBuffer properties.
 */
export interface WaveformBufferMeta {
  sampleRate: number;
  length: number;
}

/**
 * Extract a waveform amplitude chunk for the visible time window.
 *
 * Accepts either an AudioBuffer or a raw Float32Array (with metadata).
 * The Float32Array path is used for pristine channel data that is immune to
 * browser-level AudioBuffer sample data corruption.
 *
 * @param source       AudioBuffer or raw Float32Array channel data.
 * @param timeFrom     Start of the visible window in seconds.
 * @param timeTo       End of the visible window in seconds.
 * @param numSamples   Number of output values (typically display pixels / 3).
 * @param channelOrMeta  When source is AudioBuffer: channel index (default 0).
 *                       When source is Float32Array: required WaveformBufferMeta.
 * @returns            Float32Array of `numSamples` peak amplitudes in [0, 1].
 */
export function getWaveformChunk(
  source: AudioBuffer | Float32Array,
  timeFrom: number,
  timeTo: number,
  numSamples: number,
  channelOrMeta?: number | WaveformBufferMeta,
): Float32Array {
  const result = new Float32Array(numSamples);

  if (numSamples <= 0 || timeTo <= timeFrom) return result;

  let sampleRate: number;
  let totalFrames: number;
  let channelData: Float32Array;

  if (source instanceof Float32Array) {
    // Raw Float32Array path — pristine channel data.
    const meta = channelOrMeta as WaveformBufferMeta;
    sampleRate = meta.sampleRate;
    totalFrames = meta.length;
    channelData = source;
  } else {
    // AudioBuffer path — legacy / target buffer.
    const channel = (channelOrMeta as number | undefined) ?? 0;
    sampleRate = source.sampleRate;
    totalFrames = source.length;
    channelData = source.getChannelData(channel);
  }

  const bucketDuration = (timeTo - timeFrom) / numSamples;

  for (let i = 0; i < numSamples; i++) {
    const bucketStart = timeFrom + i * bucketDuration;
    const bucketEnd = bucketStart + bucketDuration;

    // Map to sample indices (fractional)
    const startIdx = bucketStart * sampleRate;
    const endIdx = bucketEnd * sampleRate;

    // Clamp to buffer bounds
    const lo = Math.max(0, Math.floor(startIdx));
    const hi = Math.min(totalFrames - 1, Math.ceil(endIdx) - 1);

    // Entirely outside buffer bounds → amplitude stays 0
    if (lo > totalFrames - 1 || hi < 0 || lo > hi) continue;

    // Find peak absolute amplitude in this bucket
    let peak = 0;
    for (let j = lo; j <= hi; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > peak) peak = abs;
    }
    result[i] = peak;
  }

  return result;
}
