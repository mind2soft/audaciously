<!-- Context: project-intelligence/technical | Priority: critical | Version: 2.0 | Updated: 2026-03-13 -->

# Technical Domain — Audaciously

**Purpose**: Tech stack, architecture, and development patterns for this browser-based DAW.
**Last Updated**: 2026-03-13

## Quick Reference
**Update Triggers**: New lib added | Pattern changes | Store protocol changes | Audio API changes
**Audience**: Developers, AI agents

---

## Primary Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Vue 3 (`<script setup>`) | ^3.5 |
| Language | TypeScript (strict) | ^5.9 |
| Build | Vite | ^6.4 |
| Styling | Tailwind CSS 4 + DaisyUI 5 | ^4.2 / 5.0-beta |
| State | Pinia | ^3 |
| Persistence | Dexie (IndexedDB) | — |
| Audio | Web Audio API (browser-native) | — |
| MP3 encoding | lamejs | — |
| Compression | fflate (.awp project files) | — |
| IDs | nanoid | ^5.1 |
| Icons | Iconify / MDI | — |

---

## Core Architecture — Node Tree

The app uses a **node-based architecture**. Everything on the timeline is a reference to a node.

```ts
// src/features/nodes/node.ts
type ProjectNode = FolderNode | RecordedNode | InstrumentNode;
```

Nodes live in a Pinia store (`useNodesStore`). Timeline segments reference nodes by ID — never copies.

---

## State Management (Pinia)

All global state lives in `src/stores/`. Stores are setup-style (no Options API).

```ts
export const useNodesStore = defineStore("nodes", () => {
  // state as refs, actions as plain functions
  return { /* public surface only */ };
});
```

---

## Vue Component Pattern

`<script setup>` SFCs. Props and emits typed inline. Use Pinia stores directly — no `inject` for data.

```vue
<script setup lang="ts">
const props = defineProps<{ node: InstrumentNode }>();
const emit = defineEmits<{ "update:notes": [notes: PlacedNote[]] }>();
// composables, computed, event handlers
</script>
<template>...</template>
```

---

## Composable Pattern

All tools and reusable logic use `useX(ctx)` factory composables — never classes.

```ts
export interface XToolContext { /* typed inputs — refs, emits, computed */ }

export function useXTool(ctx: XToolContext) {
  // refs, computed, handlers
  onUnmounted(() => { /* cleanup: RAF loops, global event listeners */ });
  return { cursor, onMousedown, onMousemove, onMouseleave };
}
export type XTool = ReturnType<typeof useXTool>;
```

---

## Pure Helpers (`src/lib/`)

All reusable logic extracted to `src/lib/` as pure functions — no side effects, no Vue imports.

```ts
// src/lib/piano-roll/note-utils.ts
export function cutNotesInRange(notes: PlacedNote[], start: number, end: number): CutResult { ... }
```

---

## Piano Roll Tools

Tools are discriminated by `PianoRollToolId = "place" | "pan" | "copy" | "cut" | "paste"`.

Key rules:
- **Immutable note arrays** — mutations return new arrays; `ctx.emitNotes(newArray)` never mutates in place
- **Snap semantics** — `snapBeatFloor` for placement; `snapBeatRound` for selection/pan/paste boundaries
- **Cut gap-close** — shift snapped to `max(durationBeats)` of shifted notes; guards against 0-shift
- **Clipboard** — `localStorage`-backed, cross-tab sync via `storage` event, typed `ClipboardEntry` discriminated union
- **Beat line colours** — pan: `--color-accent` | copy: `--color-info` | paste: `--color-secondary` | cut: `--color-warning`

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Composables | `camelCase` file | `useCutTool.ts`, `usePianoClipboard.ts` |
| Vue components | `PascalCase` file | `PianoRoll.vue`, `PianoNodeView.vue` |
| Lib modules | `kebab-case` file | `note-utils.ts`, `tool-types.ts` |
| Store files | `camelCase` file | `nodes.ts`, `player.ts` |
| Types / interfaces | PascalCase noun | `PlacedNote`, `InstrumentNode`, `ClipboardEntry` |
| Store actions | verb + noun | `setInstrumentNotes`, `addFolderNode` |
| IDs | `nanoid()` | all nodes, notes, segments |

No classes — factory composables only.

---

## Code Standards

- TypeScript strict — no `any` except explicitly cast in event dispatch
- Immutable note arrays — never mutate `PlacedNote[]` in place
- All beat positions clamped: `Math.max(0, ...)`
- All user input to notes passes through snap helpers before committing
- No OS clipboard — `localStorage` only (privacy + cross-tab sync)
- `onUnmounted` cleanup — all composables remove RAF loops and global event listeners
- `nanoid()` for all new IDs

---

## Security / Constraints

- Pure browser app — no server, no user-generated HTML, no eval
- No external network requests at runtime
- Audio output routed through master `GainNode` → `AnalyserNode` → `destination`
- No OS clipboard access — internal clipboard via `localStorage` only

---

## 📂 Codebase References

| Pattern | File |
|---------|------|
| Node union type | `src/features/nodes/node.ts` |
| InstrumentNode | `src/features/nodes/instrument/instrument-node.ts` |
| Pinia store example | `src/stores/nodes.ts` |
| Tool ID discriminated union | `src/lib/piano-roll/tool-types.ts` |
| Pure note helpers | `src/lib/piano-roll/note-utils.ts` |
| Clipboard composable | `src/composables/usePianoClipboard.ts` |
| Cut tool composable | `src/composables/useCutTool.ts` |
| Copy tool composable | `src/composables/useCopyTool.ts` |
| Piano roll component | `src/components/controls/PianoRoll.vue` |
| Node view component | `src/components/app/node-views/PianoNodeView.vue` |
| Build config | `tsconfig.app.json`, `vite.config.ts` |
