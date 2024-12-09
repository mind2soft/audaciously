import { type Accessor, createContext, useContext } from "solid-js";
import { noop } from "@solid-primitives/utils";

export interface AudioTrack {
  /**
   * The audio buffer's start time in seconds
   */
  startTime: number;
  /**
   * The audio buffer to play
   */
  audioBuffer: AudioBuffer;
}
export interface AudioTracksSetter {
  addTrack(audioBuffer: AudioBuffer, insertIndex?: number): void;
  moveTrack(fromIndex: number, toIndex: number): void;
  removeTrack(removeIndex: number): void;
  getTracks: Accessor<AudioTrack[]>;
}

export const DEFAULT_TRACKS: AudioTrack[] = [];
const INTIAL_STORE_SETTER: AudioTracksSetter = {
  addTrack: noop,
  moveTrack: noop,
  removeTrack: noop,
  getTracks: () => [],
};

export const AudioTracksContext = createContext(INTIAL_STORE_SETTER);

export const useAudioTracksContext = () => {
  const ctx = useContext(AudioTracksContext);

  if (!ctx) {
    throw new Error("useAudioTracksContext: missing AudioTracksProvider");
  }

  return ctx;
};
