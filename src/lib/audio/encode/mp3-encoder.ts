import type { Mp3EncodeRequest, Mp3WorkerMessage } from "../../../workers/mp3-encoder-processor";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Mp3EncoderOptions {
  /** Bitrate in kbps (default 128). */
  kbps?: number;
  /** Force mono (1) or stereo (2). Defaults to source channel count. */
  channels?: 1 | 2;
  /** Override sample rate. Defaults to source AudioBuffer's sampleRate. */
  sampleRate?: number;
  /** Progress callback, receives 0–1 fraction. */
  onProgress?: (progress: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a Float32Array (range [-1, 1]) to Int16Array (range [-32768, 32767]).
 */
function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Encode an AudioBuffer to MP3 using a Web Worker.
 *
 * The Worker uses `@breezystack/lamejs` internally. Channel data is converted
 * to Int16 on the main thread and transferred (zero-copy) to the worker.
 *
 * @returns A Blob with MIME type `audio/mpeg`.
 */
export function encodeMp3(
  audioBuffer: AudioBuffer,
  options: Mp3EncoderOptions = {},
): Promise<Blob> {
  const kbps = options.kbps ?? 128;
  const channels = (options.channels ?? Math.min(audioBuffer.numberOfChannels, 2)) as 1 | 2;
  const sampleRate = options.sampleRate ?? audioBuffer.sampleRate;

  // Convert Float32 → Int16 per channel on the main thread.
  const channelData: Int16Array[] = [];
  const transferables: ArrayBuffer[] = [];

  for (let ch = 0; ch < channels; ch++) {
    const srcChannel = ch < audioBuffer.numberOfChannels ? ch : 0;
    const int16 = float32ToInt16(audioBuffer.getChannelData(srcChannel));
    channelData.push(int16);
    transferables.push(int16.buffer as ArrayBuffer);
  }

  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(
      new URL("../../../workers/mp3-encoder-processor.ts", import.meta.url),
      { type: "module" },
    );

    worker.addEventListener("message", (e: MessageEvent<Mp3WorkerMessage>) => {
      const msg = e.data;

      if (msg.type === "progress") {
        options.onProgress?.(msg.progress);
      } else if (msg.type === "done") {
        worker.terminate();
        resolve(msg.blob);
      } else if (msg.type === "error") {
        worker.terminate();
        reject(new Error(msg.error));
      }
    });

    worker.addEventListener("error", (e) => {
      worker.terminate();
      reject(new Error(e.message ?? "MP3 encoder worker crashed."));
    });

    const request: Mp3EncodeRequest = {
      type: "encode",
      channelData,
      sampleRate,
      kbps,
      channels,
    };

    // Transfer Int16Array buffers to worker (zero-copy).
    worker.postMessage(request, transferables);
  });
}
