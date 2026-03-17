// features/sequence/track.ts
// Track — a single timeline row in the Sequence. Holds Segments.
// See: .opencode/context/refactor/01-terminology.md

import { nanoid } from "nanoid";
import type { Segment } from "./segment";

export interface Track {
  readonly id: string;
  name: string;
  /** Row height in pixels (user-resizable). Default: 64. */
  height: number;
  muted: boolean;
  locked: boolean;
  /** Track volume multiplier 0–3. Default: 1. */
  volume: number;
  /** Stereo balance -1 (left) to 1 (right). Default: 0. */
  balance: number;
  /** Determines display order in the timeline. */
  sortOrder: number;
  segments: Segment[];
}

/** Create a new Track with a unique id. */
export function createTrack(name?: string, id?: string): Track {
  return {
    id: id ?? nanoid(),
    name: name ?? "Track",
    height: 64,
    muted: false,
    locked: false,
    volume: 1,
    balance: 0,
    sortOrder: 0,
    segments: [],
  };
}
