// features/effects/volume.ts
import { nanoid } from "nanoid";
import type { VolumeEffect } from "./types";

/** Create a new VolumeEffect with defaults (flat line at unity gain). */
export function createVolumeEffect(id?: string): VolumeEffect {
  return {
    id: id ?? nanoid(),
    type: "volume",
    enabled: true,
    keyframes: [
      { time: 0, value: 1 },
      { time: 1, value: 1 },
    ],
  };
}
