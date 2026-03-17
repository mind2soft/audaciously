/**
 * mp3-encoder-processor.ts — Web Worker
 *
 * Encodes Int16Array PCM channel data to MP3 using @breezystack/lamejs.
 *
 * Message protocol
 * ────────────────
 * Main → Worker:  Mp3EncodeRequest
 * Worker → Main:  Mp3EncodeProgress | Mp3EncodeResponse | Mp3EncodeError
 */

import * as lamejs from "@breezystack/lamejs";

// ─── Protocol types ───────────────────────────────────────────────────────────

export interface Mp3EncodeRequest {
  type: "encode";
  /** Int16Array per channel (1 for mono, 2 for stereo). */
  channelData: Int16Array[];
  sampleRate: number;
  /** Bitrate in kbps (e.g. 128, 192, 320). */
  kbps: number;
  channels: 1 | 2;
}

export interface Mp3EncodeProgress {
  type: "progress";
  /** 0–1 fraction. */
  progress: number;
}

export interface Mp3EncodeResponse {
  type: "done";
  blob: Blob;
}

export interface Mp3EncodeError {
  type: "error";
  error: string;
}

export type Mp3WorkerMessage = Mp3EncodeProgress | Mp3EncodeResponse | Mp3EncodeError;

// ─── Encoder ──────────────────────────────────────────────────────────────────

const BLOCK_SIZE = 1152;

function encode(req: Mp3EncodeRequest): void {
  try {
    const { channelData, sampleRate, kbps, channels } = req;
    const encoder = new lamejs.Mp3Encoder(channels, sampleRate, kbps);
    const mp3Data: Uint8Array<ArrayBuffer>[] = [];
    const totalSamples = channelData[0].length;
    let processed = 0;

    /** Cast lamejs output (Uint8Array<ArrayBufferLike>) to strict ArrayBuffer. */
    const push = (buf: Uint8Array): void => {
      if (buf.length > 0) mp3Data.push(new Uint8Array(buf));
    };

    const reportProgress = (): void => {
      self.postMessage({
        type: "progress",
        progress: processed / totalSamples,
      } satisfies Mp3EncodeProgress);
    };

    if (channels === 1) {
      const samples = channelData[0];
      for (let i = 0; i < samples.length; i += BLOCK_SIZE) {
        push(encoder.encodeBuffer(samples.subarray(i, i + BLOCK_SIZE)));
        processed = Math.min(i + BLOCK_SIZE, totalSamples);
        if (processed % (BLOCK_SIZE * 50) === 0 || processed >= totalSamples) reportProgress();
      }
    } else {
      const left = channelData[0];
      const right = channelData[1];
      for (let i = 0; i < left.length; i += BLOCK_SIZE) {
        push(
          encoder.encodeBuffer(left.subarray(i, i + BLOCK_SIZE), right.subarray(i, i + BLOCK_SIZE)),
        );
        processed = Math.min(i + BLOCK_SIZE, totalSamples);
        if (processed % (BLOCK_SIZE * 50) === 0 || processed >= totalSamples) reportProgress();
      }
    }

    push(encoder.flush());

    const blob = new Blob(mp3Data, { type: "audio/mpeg" });
    self.postMessage({ type: "done", blob } satisfies Mp3EncodeResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({
      type: "error",
      error: message,
    } satisfies Mp3EncodeError);
  }
}

// ─── Worker message handler ───────────────────────────────────────────────────

self.addEventListener("message", (e: MessageEvent<Mp3EncodeRequest>) => {
  // Verify the message origin - only accept messages from the same origin
  if (e.origin !== "" && e.origin !== self.location.origin) {
    return;
  }
  if (e.data.type === "encode") {
    encode(e.data);
  }
});

export default null;
