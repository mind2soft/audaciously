// lib/zoom-constants.ts
// Shared zoom constants used by all timeline-based node views.

/**
 * Pixels rendered per 1 ms of audio at maximum zoom-in level.
 * At max zoom: 1ms → 64px, 1s → 64000px.
 */
export const ZOOM_PX_PER_MIN_MS = 64;

/**
 * Minimum visible duration in seconds for instrument rolls at minimum zoom ratio.
 * minRatio = containerWidth / (ZOOM_MIN_INSTRUMENT_DURATION * baseSecondWidthInPixels)
 */
export const ZOOM_MIN_INSTRUMENT_DURATION = 30;

/**
 * Maximum zoom ratio for instrument rolls (piano/drum).
 * = ZOOM_PX_PER_MIN_MS / (0.001 * baseSecondWidthInPixels)
 * = 64 / (0.001 * 16) = 4000
 */
export const ZOOM_MAX_INSTRUMENT_RATIO = 4000;
