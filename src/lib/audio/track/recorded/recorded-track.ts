import type { AudioTrack } from "../index";
import { createAudioTrack } from "../track";
import { type RecordedTrackKind, recordedTrackKind } from "./index";

export interface RecordedAudioTrack extends AudioTrack<RecordedTrackKind> {
  readonly kind: RecordedTrackKind;
}

export function createRecordedTrack(name: string, id?: string): RecordedAudioTrack {
  return createAudioTrack(recordedTrackKind, name, undefined, id);
}
