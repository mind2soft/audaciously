// features/nodes/index.ts — re-exports everything from the nodes feature.

export type { FolderNode } from "./folder/folder-node";
export { createFolderNode } from "./folder/folder-node";
export type {
  InstrumentNode,
  PlacedNote,
  TimeSignature,
} from "./instrument/instrument-node";
export {
  createInstrumentNode,
  DEFAULT_TIME_SIGNATURE,
} from "./instrument/instrument-node";
export type { AudioProjectNode, ProjectNode, ProjectNodeBase, ProjectNodeKind } from "./node";
export {
  isAudioNode,
  isFolderNode,
  isInstrumentNode,
  isRecordedNode,
} from "./node";
export type { RecordedNode } from "./recorded/recorded-node";
export { createRecordedNode } from "./recorded/recorded-node";
