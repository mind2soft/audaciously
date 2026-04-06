/**
 * synth.ts
 *
 * Low-level Web Audio synthesis helpers.
 *
 * Piano  → OscillatorNode (triangle wave) with ADSR envelope
 * Drums  → each pad is a small purpose-built synthesis recipe
 *
 * All functions are "fire-and-forget": they schedule Web Audio nodes to play
 * at an absolute AudioContext time and return immediately.  The caller does not
 * need to track or clean up anything.
 */

// ─── Piano ────────────────────────────────────────────────────────────────────

/** Map from pitch id (e.g. "C4", "A#3") to MIDI note number. */
const PITCH_ID_TO_MIDI: Record<string, number> = (() => {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const map: Record<string, number> = {};
  // MIDI 0 = C-1 in this convention (C4 = MIDI 60)
  for (let octave = 2; octave <= 6; octave++) {
    for (let n = 0; n < 12; n++) {
      const id = `${noteNames[n]}${octave}`;
      map[id] = (octave + 1) * 12 + n;
    }
  }
  return map;
})();

/** Convert MIDI note number to Hz. */
function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Play a piano note.
 *
 * @param ctx           The AudioContext to schedule on.
 * @param output        Destination AudioNode.
 * @param pitchId       Pitch identifier, e.g. "C4".
 * @param startTime     AudioContext.currentTime value when the note should start.
 * @param durationSec   Note duration in seconds (sustain length).
 */
export function playPianoNote(
  ctx: BaseAudioContext,
  output: AudioNode,
  pitchId: string,
  startTime: number,
  durationSec: number,
): void {
  const midi = PITCH_ID_TO_MIDI[pitchId];
  if (midi === undefined) return;

  const freq = midiToHz(midi);

  // Fundamental oscillator
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;

  // Add a second oscillator one octave up at lower volume for brightness
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;

  // Envelope gain
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, startTime);
  env.gain.linearRampToValueAtTime(0.4, startTime + 0.005); // attack 5 ms
  env.gain.setValueAtTime(0.4, startTime + 0.005);
  env.gain.linearRampToValueAtTime(0.25, startTime + 0.1); // decay to sustain

  // Hold sustain then release
  const releaseStart = startTime + Math.max(durationSec - 0.05, 0.05);
  env.gain.setValueAtTime(0.25, releaseStart);
  env.gain.linearRampToValueAtTime(0, releaseStart + 0.3); // release 300 ms

  // Mix osc2 at half volume
  const osc2Gain = ctx.createGain();
  osc2Gain.gain.value = 0.5;
  osc2.connect(osc2Gain);
  osc2Gain.connect(env);

  osc.connect(env);
  env.connect(output);

  const stopTime = releaseStart + 0.35;
  osc.start(startTime);
  osc.stop(stopTime);
  osc2.start(startTime);
  osc2.stop(stopTime);
}

// ─── Drums ────────────────────────────────────────────────────────────────────

function createNoiseBuffer(ctx: BaseAudioContext, durationSec: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * durationSec);
  const buf = ctx.createBuffer(1, length, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function playKick(ctx: BaseAudioContext, output: AudioNode, startTime: number): void {
  // Kick: sine wave pitched from ~160 Hz down to ~40 Hz
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, startTime);
  osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.15);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.8, startTime);
  env.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

  osc.connect(env);
  env.connect(output);
  osc.start(startTime);
  osc.stop(startTime + 0.36);
}

function playSnare(ctx: BaseAudioContext, output: AudioNode, startTime: number): void {
  // Snare: noise burst + tuned oscillator
  const noiseBuf = createNoiseBuffer(ctx, 0.3);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuf;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.6;

  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.6, startTime);
  noiseEnv.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

  noiseSource.connect(filter);
  filter.connect(noiseEnv);
  noiseEnv.connect(output);
  noiseSource.start(startTime);
  noiseSource.stop(startTime + 0.21);

  // Body oscillator
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(200, startTime);
  osc.frequency.exponentialRampToValueAtTime(80, startTime + 0.08);

  const oscEnv = ctx.createGain();
  oscEnv.gain.setValueAtTime(0.4, startTime);
  oscEnv.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);

  osc.connect(oscEnv);
  oscEnv.connect(output);
  osc.start(startTime);
  osc.stop(startTime + 0.11);
}

function playHiHat(
  ctx: BaseAudioContext,
  output: AudioNode,
  startTime: number,
  isOpen: boolean,
): void {
  const dur = isOpen ? 0.5 : 0.08;
  const noiseBuf = createNoiseBuffer(ctx, dur + 0.05);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuf;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.4, startTime);
  env.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

  noiseSource.connect(hp);
  hp.connect(env);
  env.connect(output);
  noiseSource.start(startTime);
  noiseSource.stop(startTime + dur + 0.01);
}

function playCymbal(
  ctx: BaseAudioContext,
  output: AudioNode,
  startTime: number,
  isCrash: boolean,
): void {
  const dur = isCrash ? 1.5 : 1;
  const noiseBuf = createNoiseBuffer(ctx, dur + 0.05);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuf;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = isCrash ? 5000 : 6000;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = isCrash ? 8000 : 9000;
  bp.Q.value = 0.5;

  const env = ctx.createGain();
  env.gain.setValueAtTime(isCrash ? 0.5 : 0.35, startTime);
  env.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

  noiseSource.connect(hp);
  hp.connect(bp);
  bp.connect(env);
  env.connect(output);
  noiseSource.start(startTime);
  noiseSource.stop(startTime + dur + 0.01);
}

function playTom(
  ctx: BaseAudioContext,
  output: AudioNode,
  startTime: number,
  variant: "hi" | "mid" | "lo",
): void {
  const freqMap = { hi: 180, mid: 130, lo: 90 } as const;
  const startFreq = freqMap[variant] * 1.5;
  const endFreq = freqMap[variant];

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + 0.15);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.6, startTime);
  env.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

  osc.connect(env);
  env.connect(output);
  osc.start(startTime);
  osc.stop(startTime + 0.31);
}

/**
 * Play a drum hit.
 *
 * @param ctx       The AudioContext.
 * @param output    Destination AudioNode.
 * @param pitchId   Drum pad id (e.g. "kick", "snare", "hihat-open").
 * @param startTime AudioContext.currentTime when the hit should fire.
 */
export function playDrumHit(
  ctx: BaseAudioContext,
  output: AudioNode,
  pitchId: string,
  startTime: number,
): void {
  switch (pitchId) {
    case "kick":
      playKick(ctx, output, startTime);
      break;
    case "snare":
      playSnare(ctx, output, startTime);
      break;
    case "hihat-open":
      playHiHat(ctx, output, startTime, true);
      break;
    case "hihat-closed":
      playHiHat(ctx, output, startTime, false);
      break;
    case "crash":
      playCymbal(ctx, output, startTime, true);
      break;
    case "ride":
      playCymbal(ctx, output, startTime, false);
      break;
    case "tom-hi":
      playTom(ctx, output, startTime, "hi");
      break;
    case "tom-mid":
      playTom(ctx, output, startTime, "mid");
      break;
    case "tom-lo":
      playTom(ctx, output, startTime, "lo");
      break;
    default:
      break; // unknown pad — silently ignore
  }
}
