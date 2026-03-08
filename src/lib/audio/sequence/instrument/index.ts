import type { AudioSequence } from "../index";
import type { InstrumentTrackKind } from "../../track/instrument/index";
import type { BufferedAudioSequenceType } from "..";

export interface InstrumentalSequence extends AudioSequence<
  InstrumentTrackKind,
  BufferedAudioSequenceType
> {
  readonly buffer: AudioBuffer;
}
