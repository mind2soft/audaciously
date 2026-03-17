// features/effects/split.ts
import { nanoid } from "nanoid";
import type { SplitEffect } from "./types";

/** Create a new SplitEffect with empty L/R sub-pipelines. */
export function createSplitEffect(id?: string): SplitEffect {
  return {
    id: id ?? nanoid(),
    type: "split",
    enabled: true,
    left: [],
    right: [],
  };
}
