// ─── Types ────────────────────────────────────────────────────────────────────

export interface WavEncoderOptions {
  /** Use 32-bit float (format 3) instead of 16-bit PCM (format 1). */
  float32?: boolean;
}

// ─── Encoder ──────────────────────────────────────────────────────────────────

/**
 * Encode an AudioBuffer as a WAV Blob.
 *
 * Supports 16-bit PCM (default, format 1) and 32-bit float (format 3).
 * Multi-channel audio is interleaved automatically. Zero external dependencies.
 */
export function encodeWav(
  audioBuffer: AudioBuffer,
  options: WavEncoderOptions = {},
): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = options.float32 ? 3 : 1;
  const bitDepth = options.float32 ? 32 : 16;

  // Interleave channels into a single Float32Array.
  const interleaved = interleaveChannels(audioBuffer);

  const bytesPerSample = bitDepth / 8;
  const dataLength = interleaved.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  writeSamples(view, 44, interleaved, format);

  return new Blob([buffer], { type: "audio/wav" });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function interleaveChannels(audioBuffer: AudioBuffer): Float32Array {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  const { numberOfChannels, length } = audioBuffer;
  const interleaved = new Float32Array(length * numberOfChannels);
  const channels: Float32Array[] = [];

  for (let ch = 0; ch < numberOfChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 0;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      interleaved[offset++] = channels[ch][i];
    }
  }

  return interleaved;
}

function writeSamples(
  view: DataView,
  startOffset: number,
  samples: Float32Array,
  format: number,
): void {
  let offset = startOffset;

  if (format === 3) {
    // 32-bit float
    for (let i = 0; i < samples.length; i++, offset += 4) {
      view.setFloat32(offset, samples[i], true);
    }
  } else {
    // 16-bit PCM — clamp to [-1, 1] then scale to Int16 range.
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.codePointAt(i) ?? 0);
  }
}
