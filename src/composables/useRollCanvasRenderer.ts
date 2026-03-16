// composables/useRollCanvasRenderer.ts
// Shared canvas drawing utilities for PianoRollCanvas and DrumRollCanvas.
//
// All drawing functions work in CSS-pixel space (i.e. after ctx.scale(dpr, dpr)).
// Callers must call ctx.save() / ctx.restore() around the full render pass.

import type { PlacedNote } from "../features/nodes";
import type { InstrumentPitch } from "../lib/music/instruments";

// ── Coordinate helper ─────────────────────────────────────────────────────────

/** Convert a beat position to a canvas X coordinate. */
export function beatToX(
  beat: number,
  offsetBeat: number,
  pxPerBeat: number,
): number {
  return (beat - offsetBeat) * pxPerBeat;
}

// ── Grid ──────────────────────────────────────────────────────────────────────

export interface DrawGridParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  offsetBeat: number;
  pxPerBeat: number;
  beatsPerMeasure: number;
  rowHeightPx: number;
  pitches: InstrumentPitch[];
  /** When true, draw black-key tint rows (piano mode). */
  drawBlackKeyTints: boolean;
  blackKeyTintColor: string;
}

export function drawGrid(p: DrawGridParams): void {
  const {
    ctx,
    width,
    height,
    offsetBeat,
    pxPerBeat,
    beatsPerMeasure,
    rowHeightPx,
    pitches,
    drawBlackKeyTints,
    blackKeyTintColor,
  } = p;

  // 1. Black-key row tints (piano only)
  if (drawBlackKeyTints) {
    ctx.fillStyle = blackKeyTintColor;
    for (let i = 0; i < pitches.length; i++) {
      if (pitches[i].key.includes("#")) {
        ctx.fillRect(0, i * rowHeightPx, width, rowHeightPx);
      }
    }
  }

  // 2. Horizontal row separators
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= pitches.length; i++) {
    const y = Math.round(i * rowHeightPx) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 3. Measure lines
  const firstMeasure = Math.floor(offsetBeat / beatsPerMeasure);
  const lastMeasure = Math.ceil(
    (offsetBeat + width / pxPerBeat) / beatsPerMeasure,
  );
  const measureBeats = new Set<number>();

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (let m = firstMeasure; m <= lastMeasure; m++) {
    const beat = m * beatsPerMeasure;
    const x = Math.round(beatToX(beat, offsetBeat, pxPerBeat)) + 0.5;
    if (x < -1 || x > width + 1) continue;
    measureBeats.add(beat);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // 4. Beat lines (only if zoomed in enough)
  if (pxPerBeat > 4) {
    const firstBeat = Math.floor(offsetBeat);
    const lastBeat = Math.ceil(offsetBeat + width / pxPerBeat);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let b = firstBeat; b <= lastBeat; b++) {
      if (measureBeats.has(b)) continue; // already drawn as measure line
      const x = Math.round(beatToX(b, offsetBeat, pxPerBeat)) + 0.5;
      if (x < -1 || x > width + 1) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export interface DrawNotesParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  notes: PlacedNote[];
  pitchIndexMap: Map<string, number>;
  offsetBeat: number;
  pxPerBeat: number;
  rowHeightPx: number;
  noteHeightPx: number; // rowHeightPx - gap (1 or 2)
  /** Normal fill color (CSS string, e.g. `oklch(55% 0.3 260)`) */
  defaultColor: string;
  /** Override color per note ID — used for copy/cut/pan selection states. */
  colorOverrides?: Map<string, string>;
}

export function drawNotes(p: DrawNotesParams): void {
  const {
    ctx,
    width,
    notes,
    pitchIndexMap,
    offsetBeat,
    pxPerBeat,
    rowHeightPx,
    noteHeightPx,
    defaultColor,
    colorOverrides,
  } = p;

  for (const note of notes) {
    const rowIdx = pitchIndexMap.get(note.pitchKey);
    if (rowIdx === undefined) continue;

    const x = beatToX(note.startBeat, offsetBeat, pxPerBeat);
    const noteW = Math.max(2, note.durationBeats * pxPerBeat);

    // Viewport cull
    if (x + noteW < 0 || x > width) continue;

    const y = rowIdx * rowHeightPx + 1;
    const color = colorOverrides?.get(note.id) ?? defaultColor;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(Math.round(x), y, Math.max(2, Math.round(noteW)), noteHeightPx, 2);
    ctx.fill();
  }
}

// ── Note outline (hover preview / ghost notes) ────────────────────────────────

export interface DrawNoteOutlineParams {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  w: number;
  h: number;
  fillColor: string;
  strokeColor: string;
  opacity?: number;
}

export function drawNoteOutline(p: DrawNoteOutlineParams): void {
  const { ctx, x, y, w, h, fillColor, strokeColor, opacity = 0.7 } = p;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.roundRect(Math.round(x), y, Math.max(2, Math.round(w)), h, 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ── Beat-line indicator ───────────────────────────────────────────────────────

export function drawBeatLine(
  ctx: CanvasRenderingContext2D,
  beat: number,
  offsetBeat: number,
  pxPerBeat: number,
  height: number,
  color: string,
): void {
  const x = Math.round(beatToX(beat, offsetBeat, pxPerBeat)) + 0.5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.restore();
}

// ── Selection / zoom rubber band ──────────────────────────────────────────────

export function drawBand(
  ctx: CanvasRenderingContext2D,
  startBeat: number,
  endBeat: number,
  offsetBeat: number,
  pxPerBeat: number,
  height: number,
  color: string,
): void {
  const x1 = beatToX(Math.min(startBeat, endBeat), offsetBeat, pxPerBeat);
  const x2 = beatToX(Math.max(startBeat, endBeat), offsetBeat, pxPerBeat);
  const w = Math.max(0, x2 - x1);

  ctx.save();
  // Fill
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.15;
  ctx.fillRect(Math.round(x1), 0, Math.round(w), height);
  // Left border
  ctx.globalAlpha = 0.6;
  ctx.fillRect(Math.round(x1), 0, 1, height);
  // Right border
  ctx.fillRect(Math.round(x2) - 1, 0, 1, height);
  ctx.restore();
}

// ── Playhead ──────────────────────────────────────────────────────────────────

export function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  height: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, 0);
  ctx.lineTo(Math.round(x) + 0.5, height);
  ctx.stroke();
  ctx.restore();
}
