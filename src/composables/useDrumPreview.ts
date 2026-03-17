import { playDrumHit } from "../lib/music/synth";

/**
 * Provides a `playHit` helper that fires a short drum preview sound for the
 * given pad ID. Lazily creates an AudioContext on first use and handles the
 * browser autoplay suspension policy via `resume()`.
 */
export function useDrumPreview() {
  let audioCtx: AudioContext | null = null;

  function getContext(): AudioContext {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContext();
    }
    return audioCtx;
  }

  function playHit(pitchId: string): void {
    const ctx = getContext();
    const fire = () => playDrumHit(ctx, ctx.destination, pitchId, ctx.currentTime);

    if (ctx.state === "suspended") {
      ctx.resume().then(fire);
    } else {
      fire();
    }
  }

  return { playHit };
}
