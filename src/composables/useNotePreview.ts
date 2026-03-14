import { playPianoNote } from "../lib/music/synth";

/**
 * Provides a `playNote` helper that plays a short piano preview tone for the
 * given pitch ID. Lazily creates an AudioContext on first use and handles the
 * browser autoplay suspension policy via `resume()`.
 */
export function useNotePreview() {
  let audioCtx: AudioContext | null = null;

  function getContext(): AudioContext {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContext();
    }
    return audioCtx;
  }

  function playNote(pitchId: string, durationSec = 0.4): void {
    const ctx = getContext();
    const fire = () =>
      playPianoNote(ctx, ctx.destination, pitchId, ctx.currentTime, durationSec);

    if (ctx.state === "suspended") {
      ctx.resume().then(fire);
    } else {
      fire();
    }
  }

  return { playNote };
}
