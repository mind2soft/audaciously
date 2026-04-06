<!-- Context: project-intelligence/technical | Priority: critical | Version: 4.0 | Updated: 2026-04-06 -->

# Technical Domain — Audaciously

**Purpose**: Tech stack, architecture, and development patterns for this browser-based DAW.
**Last Updated**: 2026-04-06

## Quick Reference
**Update Triggers**: New lib added | Pattern changes | Store protocol changes | Audio pipeline changes
**Audience**: Developers, AI agents

---

## Primary Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Framework | Vue 3 (`<script setup>` + Composition API) | ^3.5.32 | SFC reactivity, provide/inject for context |
| Language | TypeScript (strict) | ^6.0.2 | `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` |
| State | Pinia (composition-style) | ^3.0.4 | `defineStore("name", () => {})` — no Options API |
| Build | Vite | ^8.0.5 | Fast HMR, native ESM |
| Type check | vue-tsc | ^3.2.6 | `vue-tsc -b && vite build` must pass clean |
| Styling | Tailwind CSS 4 + DaisyUI 5 | ^4.2.2 / ^5.5.19 | Utility-first + component classes |
| Lint/Format | Biome (sole tool) | ^2.4.10 | 2-space indent, double quotes, semicolons, 100 char line width |
| Tests | Vitest (co-located) | ^4.1.2 | `.test.ts` files next to source — 164 tests / 18 files |
| Storage | Dexie (IndexedDB) | ^4.4.2 | All persistence local-only |
| Audio | Raw Web Audio API | — | No wrappers, no third-party audio libs |
| Workers | Native Web Workers (4) | — | synth, effect, waveform, mp3-encoder |
| Encoding | lamejs (MP3), fflate (compression) | — | Client-side export |
| IDs | nanoid | ^5.1.7 | All nodes, notes, segments |
| Icons | Iconify (MDI + file-icons) | — | Via `@iconify/tailwind4` |
| Git hooks | Husky | ^9.1.7 | Pre-commit checks |
| Package mgr | pnpm (workspace) | — | `pnpm build` before committing |

---

## Core Architecture — Node Tree + AudioBuffer Repository

```ts
// src/features/nodes/node.ts
type ProjectNode = FolderNode | RecordedNode | InstrumentNode;

interface ProjectNodeWithOutput {
  targetBufferId: string | null;  // ID into audio-buffer-repository
}
// RecordedNode also has: sourceBufferId: string | null
```

- **FolderNode** — pure grouping, no audio, not on timeline
- **InstrumentNode** — notes + synth params → synthesized on the fly
- **RecordedNode** — immutable source audio from `MediaRecorder`
- Timeline segments reference nodes by ID — never copies
- **AudioBuffer instances are NEVER stored in Pinia** — they live in `audio-buffer-repository.ts`

### AudioBuffer Repository

```ts
// src/lib/audio/audio-buffer-repository.ts — module-level Map, not reactive
registerBuffer(buffer, { pristine: true }): string   // → nanoid key
getBuffer(id): AudioBuffer | undefined
getPristineChannels(id): Float32Array[] | undefined  // corruption-immune
removeBuffer(id): void
clearAllBuffers(): void
```

- **Source buffers are IMMUTABLE** — nothing may ever mutate a source buffer
- Pristine `Float32Array[]` snapshots taken at registration time — plain JS heap memory the browser cannot corrupt
- Composables resolve IDs → buffers; external interface stays `ComputedRef<AudioBuffer | null>`

---

## Audio Effect Pipeline

Single `processEffects.ts` module — ONE worker, ONE exported function. 30s threshold is internal.

```ts
// src/lib/audio/processEffects.ts
export async function processEffects(
  source: AudioBuffer, effects: AudioEffect[], signal: AbortSignal,
  nodeId?: string, pristineChannels?: Float32Array[]
): Promise<AudioBuffer>

// src/features/nodes/compute-target-buffer.ts
export async function computeTargetBuffer(
  source: AudioBuffer, effects: AudioEffect[], signal: AbortSignal,
  nodeId?: string, pristineChannels?: Float32Array[]
): Promise<AudioBuffer>
```

- **Cancellation**: `AbortController`/`AbortSignal` — no generation counters
- **Worker**: `src/workers/effect-processor.ts` — per-nodeId seqNum (lightweight optimization only)
- **DSP effects**: Independent importable modules, pure math on `Float32Array[]`
- **Proxy stripping**: `JSON.parse(JSON.stringify(effects.value))` before worker postMessage
- **Pristine channels**: Passed through pipeline to avoid browser-corrupted `getChannelData()`

---

## Composable Pattern — Per-Type Node Composables

Factory composables — never classes. `useX()` or `useXTool(ctx)`.

```ts
// Per-type composables take nodeId, return typed reactive interface
useRecordedAudioNode(nodeId, { pipeline?: boolean }): UseRecordedAudioNode
useInstrumentAudioNode(nodeId, { pipeline?: boolean }): UseInstrumentAudioNode
useFolderNode(nodeId): UseFolderNode

// Shared pipeline composable — used by both recorded + instrument
useAudioPipeline(sourceBuffer, effects, { processFn, nodeId?, pristineChannels? }): UseAudioPipelineReturn
```

- `pipeline: true` = view component (starts reactive bake loop); `false` = property panel (reads + mutations only)
- `onScopeDispose` for cleanup (AbortControllers, listeners)
- `provide/inject` for playback context sharing (not prop-threading)
- Store notifications via listener pattern (`onTargetBufferChange`)
- Module-level synth client singleton in `useInstrumentAudioNode.ts`

---

## Vue Component Pattern

```vue
<script setup lang="ts">
const props = defineProps<{ nodeId: string }>();
const recordedNode = useRecordedAudioNode(props.nodeId, { pipeline: true });
const store = useNodesStore();
</script>
<template>
  <div class="rounded-lg border p-4"><!-- DaisyUI + Tailwind --></div>
</template>
```

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| TS files | kebab-case | `compute-target-buffer.ts` |
| Vue files | PascalCase | `ButtonGroup.vue`, `NodeTree.vue` |
| Components | PascalCase | `<NodeTreeItem>` |
| Composables | `use` prefix, camelCase | `useRecordedAudioNode.ts` |
| Stores | `use` prefix + `Store` | `useNodesStore` |
| Functions | camelCase | `processVolumeEffect`, `createFolderNode` |
| Types/Interfaces | PascalCase | `ProjectNodeWithOutput`, `DspContext` |
| Constants | SCREAMING_SNAKE | `CHECK_INTERVAL`, `CURVE_CP` |
| Workers | kebab-case `-processor` suffix | `effect-processor.ts` |
| Tests | co-located `.test.ts` | `useAudioPipeline.test.ts` |
| Feature dirs | kebab-case | `effects/dsp/`, `nodes/instrument/` |

---

## Code Standards

- **Factory functions over classes** — no `class` keyword
- **Source buffers are IMMUTABLE** — nothing may ever mutate a source buffer
- **AudioBuffer instances outside reactive stores** — repository pattern, IDs in Pinia
- **Pristine channel snapshots** — `Float32Array[]` copies immune to browser corruption
- **Raw Web Audio API** — no wrappers, no audio libs
- **Biome only** — no ESLint, no Prettier
- **TypeScript strict** — zero `any` except explicitly cast event dispatch
- **Immutable note arrays** — mutations return new arrays
- **DSP effects are independent modules** — pure math on `Float32Array`, no Web Audio
- **AbortController for cancellation** — standard API, one controller per regeneration cycle
- **Co-located tests** — not in separate `tests/` dir
- **pnpm only** — `pnpm build` before committing
- **Emoji-prefixed commits**
- **No logging-based debugging** — write tests (QA approach)
- **`vue-tsc -b && vite build` must pass clean**

---

## Security / Constraints

- **Client-only SPA** — no server, no auth, no runtime network requests
- **GPL-3.0-only** license
- **IndexedDB via Dexie** — all persistence local-only
- **localStorage** for clipboard (cross-tab, per-origin)
- **Structured clone safety** — strip reactive proxies before worker transfer
- **No eval, no innerHTML** — standard Vue template security model
- **Audio routed through master GainNode -> AnalyserNode -> destination**

---

## Project Structure

```
src/
  components/        # Vue SFCs — app/, controls/{effects,piano-roll,drum-roll,timeline,audio}/
  composables/       # useX() factory composables (co-located tests)
  features/          # Domain logic — effects/, nodes/, playback/, sequence/
    effects/dsp/     # Pure DSP modules (Float32Array math, no Web Audio)
  lib/               # Pure helpers — audio/, music/, piano-roll/, storage/, util/
    audio/           # audio-buffer-repository, processEffects, waveform, buffer-utils
  stores/            # Pinia stores — nodes, player, project, sequence, timeline
  workers/           # Web Workers — effect, synth, waveform, mp3-encoder
docs/                # Developer notes, architecture docs
```

---

## 📂 Codebase References

| Pattern | File |
|---------|------|
| Node types + union | `src/features/nodes/node.ts` |
| AudioBuffer repository | `src/lib/audio/audio-buffer-repository.ts` |
| RecordedNode (sourceBufferId) | `src/features/nodes/recorded/recorded-node.ts` |
| InstrumentNode (targetBufferId) | `src/features/nodes/instrument/instrument-node.ts` |
| Pinia store (composition) | `src/stores/nodes.ts` |
| Audio pipeline composable | `src/composables/useAudioPipeline.ts` |
| Per-type: recorded | `src/composables/useRecordedAudioNode.ts` |
| Per-type: instrument | `src/composables/useInstrumentAudioNode.ts` |
| Per-type: folder | `src/composables/useFolderNode.ts` |
| Consolidated effect processor | `src/lib/audio/processEffects.ts` |
| Target buffer computation | `src/features/nodes/compute-target-buffer.ts` |
| DSP types + chunk context | `src/features/effects/dsp/types.ts` |
| Waveform (Float32Array overload) | `src/lib/audio/waveform-window.ts` |
| Buffer utilities | `src/lib/audio/buffer-utils.ts` |
| Effect worker | `src/workers/effect-processor.ts` |
| Synth worker | `src/workers/synth-processor.ts` |
| Node playback (hot-swap) | `src/composables/useNodePlayback.ts` |
| Serialization (repo integration) | `src/lib/storage/project-serialization.ts` |
| Build config | `tsconfig.app.json`, `vite.config.ts`, `biome.json` |

## Related Files

- `decisions-log.md` — Architecture decisions with rationale
- `living-notes.md` — Active issues, debt, gotchas
- `navigation.md` — Quick overview
