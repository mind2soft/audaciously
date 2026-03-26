// features/effects/volume.ts
import { nanoid } from "nanoid";
import type { VolumeEffect } from "./types";

/** Create a new VolumeEffect with a single, immovable step at time=0 (unity gain). */
export function createVolumeEffect(id?: string): VolumeEffect {
  return {
    id: id ?? nanoid(),
    type: "volume",
    enabled: true,
    keyframes: [{ time: 0, value: 1, curve: "linear" }],
  };
}
