// lib/audio/buffer-utils.ts
// Pure utility functions for splicing, inserting silence into, and
// extracting regions from AudioBuffers.  Used by the recorded-node tools.

import { markRaw } from "vue";

/**
 * Insert silence into an AudioBuffer at the given time position.
 *
 * @param buffer      Source AudioBuffer.
 * @param atSeconds   Time in seconds where silence begins.
 * @param duration    Duration of silence to insert in seconds.
 * @returns A new AudioBuffer with silence inserted.
 */
export function insertSilence(
  buffer: AudioBuffer,
  atSeconds: number,
  duration: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const insertAt = Math.max(0, Math.min(buffer.length, Math.round(atSeconds * sr)));
  const silenceSamples = Math.round(duration * sr);
  if (silenceSamples <= 0) return buffer;

  const newLength = buffer.length + silenceSamples;
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, newLength, sr);
  const out = ctx.createBuffer(buffer.numberOfChannels, newLength, sr);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    // Copy samples before insertion point
    dst.set(src.subarray(0, insertAt), 0);
    // Silence region is already zeroed (Float32Array default)
    // Copy samples after insertion point
    dst.set(src.subarray(insertAt), insertAt + silenceSamples);
  }

  return markRaw(out);
}

/**
 * Cut (remove) a time region from an AudioBuffer, splicing the two halves.
 *
 * @param buffer    Source AudioBuffer.
 * @param startSec  Start of the region to remove in seconds.
 * @param endSec    End of the region to remove in seconds.
 * @returns A new AudioBuffer with the region removed, or null if the entire
 *          buffer would be deleted.
 */
export function cutRegion(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
): AudioBuffer | null {
  const sr = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sr));
  const endSample = Math.min(buffer.length, Math.ceil(endSec * sr));
  const removeLength = endSample - startSample;
  if (removeLength <= 0) return buffer;

  const newLength = buffer.length - removeLength;
  if (newLength <= 0) return null;

  const ctx = new OfflineAudioContext(buffer.numberOfChannels, newLength, sr);
  const out = ctx.createBuffer(buffer.numberOfChannels, newLength, sr);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    // Copy samples before the cut
    dst.set(src.subarray(0, startSample), 0);
    // Copy samples after the cut
    dst.set(src.subarray(endSample), startSample);
  }

  return markRaw(out);
}

/**
 * Insert an AudioBuffer into another at the given time position.
 * Existing samples at-or-after the insert point are shifted right.
 *
 * @param buffer    Target AudioBuffer.
 * @param segment   AudioBuffer to insert.
 * @param atSeconds Time in seconds where the segment is inserted.
 * @returns A new AudioBuffer with the segment spliced in.
 */
export function insertSegment(
  buffer: AudioBuffer,
  segment: AudioBuffer,
  atSeconds: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const insertAt = Math.max(0, Math.min(buffer.length, Math.round(atSeconds * sr)));
  const segLen = segment.length;
  const newLength = buffer.length + segLen;
  // Use the max channel count between the two buffers.
  const numChannels = Math.max(buffer.numberOfChannels, segment.numberOfChannels);

  const ctx = new OfflineAudioContext(numChannels, newLength, sr);
  const out = ctx.createBuffer(numChannels, newLength, sr);

  for (let ch = 0; ch < numChannels; ch++) {
    const dst = out.getChannelData(ch);

    // Copy from buffer (before insert point)
    if (ch < buffer.numberOfChannels) {
      const src = buffer.getChannelData(ch);
      dst.set(src.subarray(0, insertAt), 0);
      // Copy from buffer (after insert point)
      dst.set(src.subarray(insertAt), insertAt + segLen);
    }

    // Copy the segment data into the gap
    if (ch < segment.numberOfChannels) {
      dst.set(segment.getChannelData(ch), insertAt);
    }
    // Channels beyond segment's count remain zero (silence).
  }

  return markRaw(out);
}
