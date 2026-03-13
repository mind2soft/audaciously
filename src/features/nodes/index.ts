// features/nodes/index.ts — re-exports everything from the nodes feature.
export type { ProjectNodeBase, ProjectNode, ProjectNodeKind } from "./node";
export type { FolderNode } from "./folder/folder-node";
export type { RecordedNode } from "./recorded/recorded-node";
export type { InstrumentNode, TimeSignature, PlacedNote } from "./instrument/instrument-node";
export { createFolderNode } from "./folder/folder-node";
export { createRecordedNode } from "./recorded/recorded-node";
export { createInstrumentNode, DEFAULT_TIME_SIGNATURE } from "./instrument/instrument-node";
