// features/nodes/folder/folder-node.ts
// FolderNode — groups other nodes in the project tree; no audio content.
// See: .opencode/context/refactor/01-terminology.md

import { nanoid } from "nanoid";
import type { ProjectNodeBase } from "../node";

export interface FolderNode extends ProjectNodeBase {
  readonly kind: "folder";
  /** Ordered IDs of child nodes (folders, recorded, instruments). */
  childIds: string[];
}

/** Create a new FolderNode with a unique id. */
export function createFolderNode(name: string, id?: string): FolderNode {
  return {
    id: id ?? nanoid(),
    name,
    kind: "folder",
    childIds: [],
  };
}
