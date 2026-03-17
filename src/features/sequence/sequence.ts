// features/sequence/sequence.ts
// Sequence — the single per-project container for Tracks.
// See: .opencode/context/refactor/01-terminology.md
//
// A new Sequence always starts with one empty Track (per spec).

import { nanoid } from "nanoid";
import type { AudioEffect } from "../effects/types";
import type { Track } from "./track";
import { createTrack } from "./track";

export interface Sequence {
  readonly id: string;
  tracks: Track[];
  /** Post-processing effects applied on top of the full timeline mix. */
  effects: AudioEffect[];
}

/** Create a new Sequence with a unique id and one empty Track. */
export function createSequence(id?: string): Sequence {
  return {
    id: id ?? nanoid(),
    tracks: [createTrack("Track 1")],
    effects: [],
  };
}
