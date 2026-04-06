// features/nodes/node.ts
// ProjectNode base interface and union type.
// See: .opencode/context/refactor/01-terminology.md
//
// NOTE: "AudioNode" is reserved by the Web Audio API. App-level nodes are
// always called "ProjectNode" (or "PNode" in short references).

import type { MusicInstrumentType } from "../../lib/music/instruments";
import type { FolderNode } from "./folder/folder-node";
import type { InstrumentNode } from "./instrument/instrument-node";
import type { RecordedNode } from "./recorded/recorded-node";

export type { FolderNode, InstrumentNode, RecordedNode };

export type ProjectNodeKind = "folder" | "recorded" | "instrument";

export type ProjectNodeID = string;

export interface ProjectNodeBase<NodeKind extends ProjectNodeKind> {
  readonly id: ProjectNodeID;
  name: string;
  readonly kind: NodeKind;
}

export interface ProjectNodeWithOutput {
  /**
   * ID referencing the pre-baked audio buffer in the AudioBuffer repository.
   * Never persisted — recomputed on demand by the relevant composable
   * (useRecordedAudioNode or useInstrumentAudioNode).
   */
  targetBufferId: string | null;
}

/** Union of all concrete node types. */
export type ProjectNode = FolderNode | RecordedNode | InstrumentNode<MusicInstrumentType>;

/** Any ProjectNode that produces audio output (has targetBuffer + effects). */
export type AudioProjectNode = RecordedNode | InstrumentNode<MusicInstrumentType>;

// ── Type guards ───────────────────────────────────────────────────────────────

export function isFolderNode(node: ProjectNode): node is FolderNode {
  return node.kind === "folder";
}

export function isRecordedNode(node: ProjectNode): node is RecordedNode {
  return node.kind === "recorded";
}

export function isInstrumentNode(node: ProjectNode): node is InstrumentNode<MusicInstrumentType> {
  return node.kind === "instrument";
}

/** True when the node produces audio output (recorded or instrument). */
export function isAudioNode(node: ProjectNode): node is AudioProjectNode {
  return node.kind === "recorded" || node.kind === "instrument";
}
