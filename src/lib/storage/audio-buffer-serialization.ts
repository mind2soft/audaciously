// ─── Types ────────────────────────────────────────────────────────────────────

/** Metadata + channel data extracted from an AudioBuffer. */
export interface SerializedAudioBuffer {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  channelData: Float32Array[];
}

// ─── AudioBuffer ↔ SerializedAudioBuffer ──────────────────────────────────────

/** Extract channel data and metadata from an AudioBuffer. */
export function serializeAudioBuffer(buffer: AudioBuffer): SerializedAudioBuffer {
  const channelData: Float32Array[] = [];

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }

  return {
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    channelData,
  };
}

/**
 * Recreate an AudioBuffer from serialized data.
 *
 * Accepts any BaseAudioContext (AudioContext or OfflineAudioContext) so the
 * same helper works for both playback restoration and offline mixdown.
 */
export function deserializeAudioBuffer(
  context: BaseAudioContext,
  data: SerializedAudioBuffer,
): AudioBuffer {
  const buffer = context.createBuffer(
    data.numberOfChannels,
    data.length,
    data.sampleRate,
  );

  for (let ch = 0; ch < data.numberOfChannels; ch++) {
    buffer.copyToChannel(
      data.channelData[ch] as Float32Array<ArrayBuffer>,
      ch,
    );
  }

  return buffer;
}

// ─── Float32Array ↔ Blob (for IndexedDB storage) ─────────────────────────────

/** Convert a Float32Array to a Blob for efficient IndexedDB storage. */
export function float32ArrayToBlob(
  array: Float32Array<ArrayBuffer>,
): Blob {
  return new Blob([array]);
}

/** Convert a Blob back to a Float32Array. */
export async function blobToFloat32Array(blob: Blob): Promise<Float32Array> {
  const buffer = await blob.arrayBuffer();
  return new Float32Array(buffer);
}
