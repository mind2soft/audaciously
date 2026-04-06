// composables/useFolderNode.test.ts
// Tests for the typed reactive accessor composable for FolderNode.
//
// Uses setActivePinia(createPinia()) per test to get a fresh store.

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import { createFolderNode, createRecordedNode } from "../features/nodes";
import { useNodesStore } from "../stores/nodes";
import { useFolderNode } from "./useFolderNode";

// ── Setup ───────────────────────────────────────────────────────────────────

let store: ReturnType<typeof useNodesStore>;

beforeEach(() => {
  setActivePinia(createPinia());
  store = useNodesStore();
});

// ── Reactive reads ──────────────────────────────────────────────────────────

describe("useFolderNode — reactive reads", () => {
  test("returns initial property values from the store node", () => {
    const node = createFolderNode("My Folder", "folder-1");
    store.nodesById.set(node.id, node);

    const composable = useFolderNode("folder-1");

    expect(composable.name.value).toBe("My Folder");
    expect(composable.childIds.value).toEqual([]);
  });

  test("computed properties react to store mutations", async () => {
    const folder = createFolderNode("Folder", "folder-2");
    store.nodesById.set(folder.id, folder);

    const composable = useFolderNode("folder-2");
    expect(composable.name.value).toBe("Folder");

    store.renameNode("folder-2", "Renamed Folder");
    await nextTick();
    expect(composable.name.value).toBe("Renamed Folder");
  });

  test("childIds reacts to children being added", async () => {
    const folder = createFolderNode("Folder", "folder-3");
    store.nodesById.set(folder.id, folder);

    const child = createRecordedNode("Recording", "rec-child");
    store.nodesById.set(child.id, child);

    const composable = useFolderNode("folder-3");
    expect(composable.childIds.value).toEqual([]);

    // Add child to folder
    folder.childIds.push("rec-child");
    await nextTick();
    expect(composable.childIds.value).toEqual(["rec-child"]);
  });

  test("throws when node does not exist", () => {
    const composable = useFolderNode("nonexistent");
    expect(() => composable.name.value).toThrow('Node "nonexistent" not found');
  });

  test("throws when node is wrong kind", () => {
    const node = createRecordedNode("Recording", "rec-wrong");
    store.nodesById.set(node.id, node);

    const composable = useFolderNode("rec-wrong");
    expect(() => composable.name.value).toThrow('expected "folder"');
  });
});

// ── Mutations ───────────────────────────────────────────────────────────────

describe("useFolderNode — mutations", () => {
  test("rename updates the store node", async () => {
    const folder = createFolderNode("Original", "folder-4");
    store.nodesById.set(folder.id, folder);

    const composable = useFolderNode("folder-4");
    composable.rename("New Name");

    await nextTick();
    expect(composable.name.value).toBe("New Name");
    expect(store.nodesById.get("folder-4")?.name).toBe("New Name");
  });
});
