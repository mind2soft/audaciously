// features/nodes/recorded/recorded-node.ts
// RecordedNode — holds a captured audio buffer (or null if not yet recorded).
// See: .opencode/context/refactor/01-terminology.md

import { nanoid } from "nanoid";
import type { AudioEffect } from "../../effects/types";
import type { ProjectNodeBase } from "../node";

export interface RecordedNode extends ProjectNodeBase<"recorded"> {
  /**
   * The original captured audio buffer. Null = not yet recorded.
   * Persisted to IndexedDB. Never modified after recording completes.
   */
  sourceBuffer: AudioBuffer | null;
  /**
   * The source buffer with effects pre-baked, ready for playback.
   * Never persisted — recomputed on demand by useRecordedNode.
   * Equals `sourceBuffer` (same reference) when no effects are enabled
   * (zero-copy optimisation).  Null when sourceBuffer is null.
   */
  targetBuffer: AudioBuffer | null;
  /** True while actively recording. */
  isRecording: boolean;
  /** Effects applied during playback of this node's buffer. */
  effects: AudioEffect[];
}

/** Create a new RecordedNode with a unique id. */
export function createRecordedNode(name: string, id?: string): RecordedNode {
  return {
    id: id ?? nanoid(),
    name,
    kind: "recorded",
    sourceBuffer: null,
    targetBuffer: null,
    isRecording: false,
    effects: [],
  };
}
