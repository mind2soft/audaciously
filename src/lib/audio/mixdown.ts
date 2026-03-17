import type { AudioPlayer } from "./player";
import type { BufferedAudioSequence } from "./sequence";
import type { AudioTrack } from "./track";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MixdownOptions {
  /** Output sample rate in Hz (default 44100). */
  sampleRate?: number;
  /** Number of output channels (default 2 for stereo). */
  channels?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Collect every `BufferedAudioSequence` from a track.
 *
 * Both recorded sequences (type "recorded") and instrument sequences
 * (type "audioBuffer") expose a `.buffer` getter. We duck-type by checking
 * for the presence of `buffer` as an `AudioBuffer`.
 */
function collectBufferedSequences(track: AudioTrack<string>): BufferedAudioSequence<string>[] {
  const result: BufferedAudioSequence<string>[] = [];

  for (const seq of track.getSequences()) {
    const candidate = seq as Partial<BufferedAudioSequence<string>>;
    if (candidate.buffer instanceof AudioBuffer) {
      result.push(candidate as BufferedAudioSequence<string>);
    }
  }

  return result;
}

/**
 * Compute the total duration of the project in seconds, considering every
 * non-muted track's sequences (position + playback duration).
 */
function computeTotalDuration(tracks: AudioTrack<string>[]): number {
  let maxEnd = 0;

  for (const track of tracks) {
    if (track.muted) continue;

    for (const seq of collectBufferedSequences(track)) {
      const end = seq.time + seq.buffer.duration / seq.playbackRate;
      if (end > maxEnd) maxEnd = end;
    }
  }

  return maxEnd;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render all player tracks into a single stereo (or mono) `AudioBuffer`
 * using an `OfflineAudioContext`.
 *
 * Each non-muted track's sequences are wired through per-track GainNode
 * (volume) → StereoPannerNode (balance) → destination. Muted tracks are
 * skipped entirely.
 *
 * The returned AudioBuffer can be passed to WAV/MP3 encoders.
 *
 * @throws {Error} If there are no non-muted tracks or total duration is 0.
 */
export async function mixdownProject(
  player: AudioPlayer,
  options: MixdownOptions = {},
): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 44100;
  const channels = options.channels ?? 2;

  const tracks = [...player.getTracks()];
  const totalDuration = computeTotalDuration(tracks);

  if (totalDuration === 0) {
    throw new Error("Nothing to mix: no non-muted tracks with audio data.");
  }

  const totalFrames = Math.ceil(totalDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(channels, totalFrames, sampleRate);

  for (const track of tracks) {
    if (track.muted) continue;

    const sequences = collectBufferedSequences(track);
    if (sequences.length === 0) continue;

    // Per-track signal chain: source(s) → gain → panner → destination
    const pannerNode = offlineCtx.createStereoPanner();
    pannerNode.pan.value = track.balance;
    pannerNode.connect(offlineCtx.destination);

    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = track.volume;
    gainNode.connect(pannerNode);

    for (const seq of sequences) {
      const source = offlineCtx.createBufferSource();
      source.buffer = seq.buffer;
      source.playbackRate.value =
        Number.isFinite(seq.playbackRate) && seq.playbackRate > 0 ? seq.playbackRate : 1;
      source.connect(gainNode);
      source.start(seq.time);
    }
  }

  return offlineCtx.startRendering();
}
