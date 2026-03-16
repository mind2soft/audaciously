/**
 * tickMarks — pure tick-generation utilities for timeline rulers.
 *
 * Separated from canvas drawing so the algorithm is independently testable.
 */

export type TickMark = {
  /** Time position in seconds. Computed as `index × step` — no float accumulation. */
  readonly time: number;
  /** Pixel offset from the left edge of the visible window. */
  readonly x: number;
  /** True when this tick aligns to a coarser, semantically meaningful time boundary. */
  readonly isMajor: boolean;
};

/**
 * Human-readable tick step candidates for a DAW/media timeline ruler (seconds).
 *
 * Sorted ascending. Every value is a whole number or a recognisable fraction —
 * no mathematically-derived "nice numbers" that would skip 0.25 s, 15 s, 30 s,
 * or whole-minute boundaries.
 */
const TICK_STEPS: readonly number[] = [
  0.001, 0.002, 0.005,           // ms range
  0.01,  0.02,  0.025, 0.05,    // 10–50 ms
  0.1,   0.2,   0.25,  0.5,     // sub-second fractions
  1,     2,     5,     10,  15,  30, // seconds
  60,    120,   300,   600, 1800, 3600, // minutes / hours
];

/**
 * Select the minor (all ticks) and major (labelled ticks) step intervals for a
 * given pixel density.
 *
 * @param pixelsPerSecond  Horizontal zoom level.
 * @param minSpacingPx     Minimum pixel gap between adjacent minor ticks.
 */
const selectSteps = (
  pixelsPerSecond: number,
  minSpacingPx: number,
): { minorStep: number; majorStep: number } => {
  const minInterval = minSpacingPx / pixelsPerSecond;
  const minorStep =
    TICK_STEPS.find((s) => s >= minInterval) ?? TICK_STEPS[TICK_STEPS.length - 1];
  // Major step: first step that gives at least 3.5× the minor spacing,
  // ensuring ≥ 3 minor ticks appear between each label.
  const majorStep =
    TICK_STEPS.find((s) => s >= minorStep * 3.5) ?? minorStep;
  return { minorStep, majorStep };
};

/**
 * Generate all tick marks visible within a given time window.
 *
 * Pure function — no canvas side effects, fully unit-testable.
 *
 * Positions are computed as `index × step` rather than accumulated additions,
 * eliminating IEEE 754 drift over long timelines.
 *
 * @param startTime       Left edge of the visible ruler in seconds.
 * @param endTime         Right edge of the visible ruler in seconds.
 * @param pixelsPerSecond Zoom density (px / s).
 * @param minSpacingPx    Minimum pixel gap between minor ticks (default 40).
 * @returns               Sorted array of TickMark, left-to-right.
 */
export const generateTicks = (
  startTime: number,
  endTime: number,
  pixelsPerSecond: number,
  minSpacingPx = 40,
): TickMark[] => {
  const { minorStep, majorStep } = selectSteps(pixelsPerSecond, minSpacingPx);

  const firstIndex = Math.ceil(startTime / minorStep);
  const lastIndex = Math.ceil(endTime / minorStep);
  const epsilon = minorStep * 0.01; // 1 % tolerance for residual float noise

  const visibleWidth = (endTime - startTime) * pixelsPerSecond;
  const ticks: TickMark[] = [];

  for (let i = firstIndex; i <= lastIndex; i++) {
    const t = i * minorStep;
    const x = (t - startTime) * pixelsPerSecond;
    if (x < 0 || x > visibleWidth + 1) continue;

    // Semantic major: t lands on a whole multiple of majorStep (within epsilon)
    const remainder = t % majorStep;
    const isMajor = remainder < epsilon || remainder > majorStep - epsilon;

    ticks.push({ time: t, x, isMajor });
  }

  return ticks;
};
