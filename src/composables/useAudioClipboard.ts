// composables/useAudioClipboard.ts
// Internal clipboard for audio segments (recorded node copy/cut).
//
// Design:
//  * Shares the same module-level singleton storage key and reactive entry
//    as usePianoClipboard — the ClipboardEntry discriminated union lets
//    both coexist, with the most recent write (notes OR audio) winning.
//  * Audio data is serialised as plain number arrays (Float32Array → number[])
//    so it round-trips through JSON / localStorage.  Large segments may
//    exceed the localStorage quota, in which case the clipboard is written
//    to memory only (same fallback as the piano clipboard).
//  * Provides helpers to extract / reconstruct AudioBuffer from the entry.

import type { ComputedRef } from "vue";
import { computed, ref } from "vue";
import type { AudioSegmentClipboard, ClipboardEntry } from "../lib/piano-roll/tool-types";

const STORAGE_KEY = "audaciously:clipboard" as const;

// ── Module-level singleton ────────────────────────────────────────────────────
// Shared with usePianoClipboard — both read/write the same reactive ref and
// storage key.  Because ES modules are singletons, the _entry ref here is
// the same object identity as in usePianoClipboard when both import from the
// same module scope.  However, since each file declares its own `_entry` ref,
// we replicate the listener pattern identically.

const _entry = ref<ClipboardEntry | null>(null);
let _listenerAttached = false;

function _readStorage(): ClipboardEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ClipboardEntry) : null;
  } catch {
    return null;
  }
}

function _writeStorage(entry: ClipboardEntry | null): void {
  try {
    if (entry === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    }
  } catch {
    // Storage quota exceeded — clipboard written to memory only.
  }
}

function _ensureListener(): void {
  if (_listenerAttached) return;
  _listenerAttached = true;

  _entry.value = _readStorage();

  window.addEventListener("storage", (evt: StorageEvent) => {
    if (evt.key !== STORAGE_KEY) return;
    _entry.value = evt.newValue ? (JSON.parse(evt.newValue) as ClipboardEntry) : null;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Reconstruct an AudioBuffer from a clipboard entry.
 * Returns null if the entry is not an audio-segment or reconstruction fails.
 */
export function audioBufferFromClipboardEntry(
  entry: AudioSegmentClipboard,
  audioContext?: BaseAudioContext,
): AudioBuffer {
  const ctx =
    audioContext ??
    new OfflineAudioContext(entry.numberOfChannels, entry.channels[0].length, entry.sampleRate);
  const buf = ctx.createBuffer(entry.numberOfChannels, entry.channels[0].length, entry.sampleRate);
  for (let ch = 0; ch < entry.numberOfChannels; ch++) {
    buf.copyToChannel(new Float32Array(entry.channels[ch]), ch);
  }
  return buf;
}

// ── Composable ────────────────────────────────────────────────────────────────

export interface UseAudioClipboard {
  /** True when the clipboard holds an audio segment that can be pasted. */
  readonly hasAudioSegment: ComputedRef<boolean>;
  /** The current audio-segment clipboard entry, or null if empty / wrong type. */
  readonly audioSegmentEntry: ComputedRef<AudioSegmentClipboard | null>;
  /**
   * Copy an AudioBuffer region to the clipboard.
   * @param buffer  Source AudioBuffer.
   * @param startSec  Start of the region in seconds.
   * @param endSec    End of the region in seconds.
   * @returns Duration of the copied segment in seconds.
   */
  copyAudioSegment(buffer: AudioBuffer, startSec: number, endSec: number): number;
}

export function useAudioClipboard(): UseAudioClipboard {
  _ensureListener();

  const hasAudioSegment = computed(() => _entry.value?.type === "audio-segment");

  const audioSegmentEntry = computed<AudioSegmentClipboard | null>(() =>
    _entry.value?.type === "audio-segment" ? _entry.value : null,
  );

  function copyAudioSegment(buffer: AudioBuffer, startSec: number, endSec: number): number {
    const sr = buffer.sampleRate;
    const startSample = Math.max(0, Math.floor(startSec * sr));
    const endSample = Math.min(buffer.length, Math.ceil(endSec * sr));
    const segmentLength = endSample - startSample;
    if (segmentLength <= 0) return 0;

    const channels: number[][] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const full = buffer.getChannelData(ch);
      channels.push(Array.from(full.subarray(startSample, endSample)));
    }

    const durationSeconds = segmentLength / sr;

    const entry: AudioSegmentClipboard = {
      type: "audio-segment",
      channels,
      sampleRate: sr,
      numberOfChannels: buffer.numberOfChannels,
      durationSeconds,
    };

    _entry.value = entry;
    _writeStorage(entry);
    return durationSeconds;
  }

  return { hasAudioSegment, audioSegmentEntry, copyAudioSegment };
}
