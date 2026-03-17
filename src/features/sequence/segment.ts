// features/sequence/segment.ts
// Segment — a ProjectNode instance placed at a time position on a Track.
// See: .opencode/context/refactor/01-terminology.md
//
// NOTE: Only "recorded" and "instrument" nodes can be placed as segments.
// FolderNodes cannot. This constraint is enforced at the store level (P2-04).

import { nanoid } from "nanoid";

export interface Segment {
  readonly id: string;
  /** References a ProjectNode (recorded or instrument — never folder). */
  readonly nodeId: string;
  /** Start time in the timeline (seconds). */
  time: number;
  /** Trim amount from the start of the node's audio (seconds). Default: 0. */
  trimStart: number;
  /** Trim amount from the end of the node's audio (seconds). Default: 0. */
  trimEnd: number;
  selected: boolean;
}

/** Create a new Segment with a unique id. */
export function createSegment(nodeId: string, time: number, id?: string): Segment {
  return {
    id: id ?? nanoid(),
    nodeId,
    time,
    trimStart: 0,
    trimEnd: 0,
    selected: false,
  };
}
