// features/effects/dsp/volume.ts
// Pure-DSP volume automation processor — keyframe-based gain with bezier
// interpolation between steps.
//
// The bezier control points mirror the CSS cubic-bezier() values used in
// EffectVolume.vue so the SVG preview and the rendered audio match exactly.

import type { VolumeEffect, VolumeKeyframe, VolumeTransition } from "../types";
import type { DspContext } from "./types";

// ── Bezier control points (CSS cubic-bezier spec) ─────────────────────────────

const CURVE_CP: Record<VolumeTransition, [number, number, number, number]> = {
  linear: [0, 0, 1, 1], // not used — linear fast-path avoids the solver
  "ease-in": [0.42, 0, 1.0, 1.0],
  "ease-out": [0.0, 0.0, 0.58, 1.0],
  "ease-in-out": [0.42, 0, 0.58, 1.0],
};

// ── Cubic bezier solver ───────────────────────────────────────────────────────

/**
 * Given a target x (time ratio 0–1), solve the cubic bezier parameter t so
 * that x(t) = target.  Uses Newton-Raphson with bisection fallback.
 */
function solveBezierT(x: number, p1x: number, p2x: number): number {
  let t = x; // initial guess

  // Newton-Raphson — converges in 3–5 iterations for well-behaved curves.
  for (let i = 0; i < 8; i++) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const xT = 3 * mt2 * t * p1x + 3 * mt * t2 * p2x + t * t2;
    const dx = xT - x;
    if (Math.abs(dx) < 1e-7) return t;

    const dxdt = 3 * mt2 * p1x + 6 * mt * t * (p2x - p1x) + 3 * t2 * (1 - p2x);
    if (Math.abs(dxdt) < 1e-7) break; // degenerate — fall through to bisection
    t = Math.max(0, Math.min(1, t - dx / dxdt));
  }

  // Bisection fallback — always converges.
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 20; i++) {
    const mt = 1 - t;
    const xT = 3 * mt * mt * t * p1x + 3 * mt * t * t * p2x + t * t * t;
    if (xT < x) lo = t;
    else hi = t;
    t = (lo + hi) * 0.5;
  }
  return t;
}

/** Evaluate the y component of a cubic bezier at parameter t. */
function bezierY(t: number, p1y: number, p2y: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1y + 3 * mt * t * t * p2y + t * t * t;
}

// ── Main processor ────────────────────────────────────────────────────────────

/** Cancellation-check interval (must be a power of 2 for fast bitwise test). */
const CHECK_INTERVAL = 8192;

/**
 * Apply volume keyframe automation.
 *
 * Walks through the buffer sample-by-sample, tracking the current keyframe
 * segment.  For each sample the gain multiplier is interpolated from the
 * surrounding keyframes using the segment's transition curve.
 *
 * Returns `false` if cancelled (caller should discard the buffer).
 */
export function processVolumeEffect(
  channels: Float32Array[],
  effect: VolumeEffect,
  ctx: DspContext,
  isCancelled: () => boolean,
): boolean {
  const kfs = [...effect.keyframes].sort((a, b) => a.time - b.time);
  if (kfs.length === 0) return true;

  // Single keyframe → constant gain; avoid per-sample math.
  if (kfs.length === 1) {
    const gain = kfs[0].value;
    if (gain === 1) return true;
    for (const ch of channels) {
      for (let i = 0; i < ch.length; i++) ch[i] *= gain;
    }
    return true;
  }

  const totalSamples = channels[0]?.length ?? 0;
  const invSR = 1 / ctx.sampleRate;

  // Segment index tracks position in the sorted keyframe list — advances
  // monotonically so the overall complexity is O(samples + keyframes).
  let segIdx = 0;

  for (let i = 0; i < totalSamples; i++) {
    // Periodic cancellation check (every CHECK_INTERVAL samples).
    if ((i & (CHECK_INTERVAL - 1)) === 0 && isCancelled()) return false;

    const time = i * invSR;

    // Advance to the correct segment.
    while (segIdx < kfs.length - 2 && time >= kfs[segIdx + 1].time) {
      segIdx++;
    }

    const gain = segmentGain(kfs, segIdx, time);

    for (const ch of channels) {
      ch[i] *= gain;
    }
  }

  return true;
}

/** Compute the interpolated gain at `time` within segment `segIdx`. */
function segmentGain(kfs: VolumeKeyframe[], segIdx: number, time: number): number {
  // Before first keyframe — hold first value.
  if (time <= kfs[0].time) return kfs[0].value;

  // Beyond last keyframe — hold last value.
  if (segIdx >= kfs.length - 1) return kfs[kfs.length - 1].value;

  const a = kfs[segIdx];
  const b = kfs[segIdx + 1];
  const ratio = (time - a.time) / (b.time - a.time);

  // Linear fast-path — skip the bezier solver.
  if (a.curve === "linear") {
    return a.value + ratio * (b.value - a.value);
  }

  const [p1x, p1y, p2x, p2y] = CURVE_CP[a.curve];
  const t = solveBezierT(ratio, p1x, p2x);
  return a.value + bezierY(t, p1y, p2y) * (b.value - a.value);
}
