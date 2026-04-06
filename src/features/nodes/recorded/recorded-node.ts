// features/nodes/recorded/recorded-node.ts
// RecordedNode — holds a captured audio buffer (or null if not yet recorded).
// See: .opencode/context/refactor/01-terminology.md

import { nanoid } from "nanoid";
import type { AudioEffect } from "../../effects/types";
import type { ProjectNodeBase, ProjectNodeWithOutput } from "../node";

export interface RecordedNode extends ProjectNodeWithOutput, ProjectNodeBase<"recorded"> {
  /**
   * ID referencing the original captured audio buffer in the AudioBuffer
   * repository. Null = not yet recorded. The actual AudioBuffer and its
   * pristine Float32Array[] channel snapshots live in the repository.
   */
  sourceBufferId: string | null;
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
    sourceBufferId: null,
    targetBufferId: null,
    isRecording: false,
    effects: [],
  };
}
