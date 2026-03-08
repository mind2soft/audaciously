import { deflate, inflate } from "fflate";

// ─── Compress ─────────────────────────────────────────────────────────────────

/**
 * Compress a Float32Array channel using DEFLATE via fflate's async worker pool.
 *
 * The raw 4-byte-per-sample PCM data is deflated at level 6 (good balance of
 * speed vs ratio — silence and low-amplitude sections compress very well).
 * Returns a Blob ready for IndexedDB storage.
 */
export function compressFloat32Array(data: Float32Array): Promise<Blob> {
  const raw = new Uint8Array(
    data.buffer as ArrayBuffer,
    data.byteOffset,
    data.byteLength,
  );

  return new Promise<Blob>((resolve, reject) => {
    deflate(raw, { level: 6 }, (err, compressed) => {
      if (err) reject(err);
      else resolve(new Blob([compressed as Uint8Array<ArrayBuffer>]));
    });
  });
}

// ─── Decompress ───────────────────────────────────────────────────────────────

/**
 * Decompress a Blob (created by {@link compressFloat32Array}) back to a
 * Float32Array.
 *
 * Uses fflate's async inflate which runs in a web-worker pool to avoid
 * blocking the main thread during project loads.
 */
export async function decompressBlobToFloat32Array(
  blob: Blob,
): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const compressed = new Uint8Array(arrayBuffer);

  return new Promise<Float32Array>((resolve, reject) => {
    inflate(compressed, (err, decompressed) => {
      if (err) {
        reject(err);
        return;
      }

      if (decompressed.byteLength % 4 !== 0) {
        reject(
          new Error(
            "Decompressed data length is not aligned to 4 bytes (Float32)",
          ),
        );
        return;
      }

      // Copy into a properly-aligned Float32Array (inflate output may not
      // share an ArrayBuffer aligned for float access).
      const result = new Float32Array(decompressed.byteLength / 4);
      new Uint8Array(result.buffer).set(decompressed);
      resolve(result);
    });
  });
}
