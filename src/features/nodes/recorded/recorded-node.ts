// features/nodes/recorded/recorded-node.ts
// RecordedNode — holds a captured audio buffer (or null if not yet recorded).
// See: .opencode/context/refactor/01-terminology.md

import { nanoid } from "nanoid";
import type { ProjectNodeBase } from "../node";
import type { AudioEffect } from "../../effects/types";

export interface RecordedNode extends ProjectNodeBase {
  readonly kind: "recorded";
  /** The captured audio buffer. Null = not yet recorded. */
  buffer: AudioBuffer | null;
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
    buffer: null,
    isRecording: false,
    effects: [],
  };
}
