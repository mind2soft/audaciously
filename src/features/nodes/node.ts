// features/nodes/node.ts
// ProjectNode base interface and union type.
// See: .opencode/context/refactor/01-terminology.md
//
// NOTE: "AudioNode" is reserved by the Web Audio API. App-level nodes are
// always called "ProjectNode" (or "PNode" in short references).

import type { FolderNode } from "./folder/folder-node";
import type { RecordedNode } from "./recorded/recorded-node";
import type { InstrumentNode } from "./instrument/instrument-node";
import type { MusicInstrumentType } from "../../lib/music/instruments";

export type { FolderNode, RecordedNode, InstrumentNode };

export type ProjectNodeKind = "folder" | "recorded" | "instrument";

export type ProjectNodeID = string;

export interface ProjectNodeBase<NodeKind extends ProjectNodeKind> {
  readonly id: ProjectNodeID;
  name: string;
  readonly kind: NodeKind;
}

/** Union of all concrete node types. */
export type ProjectNode =
  | FolderNode
  | RecordedNode
  | InstrumentNode<MusicInstrumentType>;
