<!-- Context: project-intelligence/technical | Priority: critical | Version: 3.0 | Updated: 2026-03-28 -->

# Technical Domain — Audaciously

**Purpose**: Tech stack, architecture, and development patterns for this browser-based DAW.
**Last Updated**: 2026-03-28

## Quick Reference
**Update Triggers**: New lib added | Pattern changes | Store protocol changes | Audio pipeline changes
**Audience**: Developers, AI agents

---

## Primary Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Framework | Vue 3 (`<script setup>` + Composition API) | ^3.5.31 | SFC reactivity, provide/inject for context |
| Language | TypeScript (strict) | ^5.9.3 | `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` |
| State | Pinia (composition-style) | ^2.3.0 | `defineStore("name", () => {})` — no Options API |
| Build | Vite | ^6.4.1 | Fast HMR, native ESM |
| Type check | vue-tsc | ^2.2.12 | `vue-tsc -b && vite build` must pass clean |
| Styling | Tailwind CSS 4 + DaisyUI 5 beta | ^4.2.2 / 5.0.0-beta.7 | Utility-first + component classes |
| Lint/Format | Biome (sole tool) | 2.4.7 | 2-space indent, double quotes, semicolons, 100 char line width |
| Tests | Vitest (co-located) | ^4.1.2 | `.test.ts` files next to source |
| Storage | Dexie (IndexedDB) | ^4.4.1 | All persistence local-only |
| Audio | Raw Web Audio API | — | No wrappers, no third-party audio libs |
| Workers | Native Web Workers (4) | — | synth, effect, waveform, mp3-encoder |
| Encoding | lamejs (MP3), fflate (compression) | — | Client-side export |
| IDs | nanoid | ^5.1.7 | All nodes, notes, segments |
| Icons | Iconify (MDI + file-icons) | — | Via `@iconify/tailwind4` |
| Git hooks | Husky | ^9.1.7 | Pre-commit checks |
| Package mgr | pnpm (workspace) | — | `pnpm build` before committing |

---

## Core Architecture — Node Tree

```ts
// src/features/nodes/node.ts
type ProjectNode = FolderNode | RecordedNode | InstrumentNode;

// Nodes with audio output implement:
interface ProjectNodeWithOutput {
  targetBuffer: AudioBuffer | null;
}
```

- **FolderNode** — pure grouping, no audio, not on timeline
- **InstrumentNode** — notes + synth params → synthesized on the fly
- **RecordedNode** — immutable `AudioBuffer` from `MediaRecorder`
- Timeline segments reference nodes by ID — never copies

---

## Audio Effect Pipeline (Consolidated)

Single `processEffects.ts` module — ONE worker, ONE exported function. 30s threshold is internal.

```ts
// src/lib/audio/processEffects.ts
export async function processEffects(
  source: AudioBuffer, effects: AudioEffect[], signal: AbortSignal, nodeId?: string
): Promise<AudioBuffer>
```

- **Cancellation**: `AbortController`/`AbortSignal` — no generation counters, no main-thread seqNum
- **Worker**: `src/workers/effect-processor.ts` — per-nodeId seqNum (lightweight optimization only)
- **DSP effects**: Independent importable modules, pure math on `Float32Array[]`
- **Proxy stripping**: `JSON.parse(JSON.stringify(effects.value))` before worker postMessage

```ts
// DSP module signature — no Web Audio dependency
export function processVolumeEffect(
  channels: Float32Array[], effect: VolumeEffect, ctx: DspContext, isCancelled: () => boolean
): boolean
```

---

## Composable Pattern

Factory composables — never classes. `useX()` or `useXTool(ctx)`.

```ts
export function useAudioPipeline(
  sourceBuffer: Ref<AudioBuffer | null>,
  effects: Ref<ReadonlyArray<AudioEffect>>,
  options: UseAudioPipelineOptions,
): UseAudioPipelineReturn { /* AbortController, watch, onScopeDispose cleanup */ }
```

- `onUnmounted` / `onScopeDispose` for cleanup (RAF loops, listeners, AbortControllers)
- `provide/inject` for playback context sharing (not prop-threading)
- Store notifications via listener pattern (`onTargetBufferChange`)

---

## Vue Component Pattern

```vue
<script setup lang="ts">
const props = defineProps<{ node: InstrumentNode }>();
const emit = defineEmits<{ "update:notes": [notes: PlacedNote[]] }>();
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
| Composables | `use` prefix, camelCase | `useAudioPipeline.ts` |
| Stores | `use` prefix + `Store` | `useNodesStore` |
| Functions | camelCase | `processVolumeEffect`, `createFolderNode` |
| Types/Interfaces | PascalCase | `ProjectNodeWithOutput`, `DspContext` |
| Constants | SCREAMING_SNAKE | `CHECK_INTERVAL`, `CURVE_CP` |
| Workers | kebab-case `-processor` suffix | `effect-processor.ts` |
| Tests | co-located `.test.ts` | `pipeline.test.ts` |
| Feature dirs | kebab-case | `effects/dsp/`, `nodes/instrument/` |

---

## Code Standards

- **Factory functions over classes** — no `class` keyword
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
  stores/            # Pinia stores — nodes, player, project, sequence, timeline
  workers/           # Web Workers — effect, synth, waveform, mp3-encoder
docs/                # Developer notes, architecture docs
```

---

## 📂 Codebase References

| Pattern | File |
|---------|------|
| Node types + union | `src/features/nodes/node.ts` |
| Pinia store (composition) | `src/stores/nodes.ts` |
| Audio pipeline composable | `src/composables/useAudioPipeline.ts` |
| Consolidated effect processor | `src/lib/audio/processEffects.ts` |
| DSP types + chunk context | `src/features/effects/dsp/types.ts` |
| DSP volume automation | `src/features/effects/dsp/volume.ts` |
| Effect worker | `src/workers/effect-processor.ts` |
| Synth worker | `src/workers/synth-processor.ts` |
| Node playback (hot-swap) | `src/composables/useNodePlayback.ts` |
| Build config | `tsconfig.app.json`, `vite.config.ts`, `biome.json` |

## Related Files

- `decisions-log.md` — Architecture decisions with rationale
- `living-notes.md` — Active issues, debt, gotchas
- `navigation.md` — Quick overview
