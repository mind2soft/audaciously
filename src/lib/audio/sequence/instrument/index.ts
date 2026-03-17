import type { InstrumentTrackKind } from "../../track/instrument/index";
import type { BufferedAudioSequenceType } from "..";
import type { AudioSequence } from "../index";

export interface InstrumentalSequence
  extends AudioSequence<InstrumentTrackKind, BufferedAudioSequenceType> {
  readonly buffer: AudioBuffer;
}
