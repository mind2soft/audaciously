// lib/audio/audio-buffer-repository.ts
// Central repository for AudioBuffer instances.
//
// Nodes store buffer IDs (strings) in the reactive Pinia store.
// The actual AudioBuffer instances live here, outside of Vue's reactivity
// system, avoiding reactive proxy overhead on large binary blobs.
//
// For source buffers (recorded audio), pristine Float32Array[] snapshots
// are stored alongside the AudioBuffer. These are plain JS heap memory
// that the browser cannot mutate, unlike AudioBuffer.getChannelData()
// which is subject to browser-level sample data corruption.

import { nanoid } from "nanoid";

interface AudioBufferEntry {
  buffer: AudioBuffer;
  /** Pristine channel data — snapshotted at registration time, never mutated by the browser. */
  pristineChannels?: Float32Array[];
}

const entries = new Map<string, AudioBufferEntry>();

/**
 * Register an AudioBuffer and return a unique ID for it.
 *
 * @param buffer   The AudioBuffer to store.
 * @param options  Pass `{ pristine: true }` to snapshot channel data as
 *                 plain Float32Arrays that the browser cannot corrupt.
 * @returns        Unique ID to reference this buffer.
 */
export function registerBuffer(buffer: AudioBuffer, options?: { pristine?: boolean }): string {
  const id = nanoid();
  const entry: AudioBufferEntry = { buffer };

  if (options?.pristine) {
    entry.pristineChannels = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      entry.pristineChannels.push(new Float32Array(buffer.getChannelData(ch)));
    }
  }

  entries.set(id, entry);
  return id;
}

/**
 * Retrieve an AudioBuffer by ID.
 * Returns undefined if the ID is not found.
 */
export function getBuffer(id: string): AudioBuffer | undefined {
  return entries.get(id)?.buffer;
}

/**
 * Retrieve the pristine channel data for a buffer.
 * Only available for buffers registered with `{ pristine: true }`.
 * Returns undefined if not found or no pristine data was stored.
 */
export function getPristineChannels(id: string): Float32Array[] | undefined {
  return entries.get(id)?.pristineChannels;
}

/**
 * Remove a buffer entry, freeing the AudioBuffer and any pristine data.
 * No-op if the ID is not found.
 */
export function removeBuffer(id: string): void {
  entries.delete(id);
}

/**
 * Remove all entries. Used during project clear/reset.
 */
export function clearAllBuffers(): void {
  entries.clear();
}
