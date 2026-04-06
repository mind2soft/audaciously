<!-- Context: project-intelligence/decisions | Priority: high | Version: 3.0 | Updated: 2026-04-06 -->

# Decisions Log — Audaciously

> Major architectural decisions with full context. Prevents "why was this done?" debates.

**Last Updated**: 2026-04-06

---

## Decision: AudioBuffer Repository + Pristine Channel Snapshots

**Date**: 2026-04-06
**Status**: Decided

### Context

Chrome continuously mutates `AudioBuffer.getChannelData()` sample data in-place after recording, causing progressive waveform and playback degradation. Plain `Float32Array` objects on the JS heap are NOT affected — only `AudioBuffer` internal data. Multiple mitigation attempts failed: closing AudioContext after decode, fire-and-forget close with state guard, standalone `AudioBuffer` via constructor + `copyToChannel()` — all still corrupted.

Additionally, storing `AudioBuffer` instances directly in Pinia stores wrapped them in Vue reactive proxies, adding overhead to large binary blobs.

### Decision

1. **AudioBuffer repository** (`audio-buffer-repository.ts`): Module-level `Map<string, AudioBufferEntry>` outside Vue reactivity. Nodes store `targetBufferId: string | null` and `sourceBufferId: string | null` instead of `AudioBuffer` references.
2. **Pristine channel snapshots**: At registration time, `Float32Array[]` copies are taken from the AudioBuffer. These plain JS heap arrays are immune to browser corruption.
3. **Pristine channels threaded through entire pipeline**: `computeTargetBuffer`, `processEffects`, `useAudioPipeline`, waveform rendering, and serialization all accept/use pristine channels.

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| `Object.freeze` on AudioBuffer | Hack — doesn't prevent browser-level mutation |
| Close AudioContext after decode | Tested — corruption persists |
| Standalone AudioBuffer via constructor + copyToChannel | Tested — also corrupted |
| Keep AudioBuffer in Pinia store | Reactive proxy overhead on large binary blobs |

### Impact

- **Positive**: Eliminates waveform/playback corruption permanently; removes reactive proxy overhead on audio data
- **64 files changed**, 4612 insertions, 1607 deletions
- **164 tests pass** across 18 files

### Related

- `src/lib/audio/audio-buffer-repository.ts`
- `src/features/nodes/node.ts` (`targetBufferId`)
- `src/features/nodes/recorded/recorded-node.ts` (`sourceBufferId`)

---

## Decision: Per-Type Node Composables

**Date**: 2026-04-06
**Status**: Decided

### Context

`useAllNodes.ts` was a monolithic composable handling all node types. As the AudioBuffer repository refactor changed how buffers are resolved, the single composable became unwieldy.

### Decision

Replace with per-type composables: `useRecordedAudioNode`, `useInstrumentAudioNode`, `useFolderNode`. Each takes a `nodeId` and returns a typed reactive interface. An optional `{ pipeline: true }` flag enables the reactive effect-bake loop (view components only).

### Rationale

- Type-safe: each composable returns only the fields relevant to that node type
- Pipeline opt-in: property panels don't trigger effect baking
- Testable: each composable is independently unit-testable

### Related

- `src/composables/useRecordedAudioNode.ts`
- `src/composables/useInstrumentAudioNode.ts`
- `src/composables/useFolderNode.ts`

---

## Decision: Chunked Stateful Effect Pipeline

**Date**: 2026-03-28
**Status**: Decided

### Context

At 48 kHz stereo, a 45-minute buffer is ~1 GB. Processing requires source + output copy (~2 GB peak), plus ~6 GB throughput for a 3-effect chain. Mobile tabs OOM-kill.

### Decision

3-phase architecture:
1. **Phase 1 — Chunked stateful pipeline** (pure TS): Split long buffers into N-second chunks, process sequentially with state carried between chunks. Memory bounded at ~50 MB.
2. **Phase 2 — Wasm DSP modules** (Rust/wasm-pack): FFT-class effects in Wasm with SIMD.
3. **Phase 3 — AudioWorklet real-time path**: Same Wasm modules in AudioWorkletProcessor.

### Related

- `docs/architecture/chunked-pipeline.md`

---

## Decision: Consolidated Worker Architecture (Single processEffects)

**Date**: 2026-03-28
**Status**: Decided

### Context

Two separate modules (`effectWorker.ts` + `chunkOrchestrator.ts`) with their own worker instances — two code paths, separate seqNum namespaces.

### Decision

Consolidate into single `processEffects.ts` — ONE worker instance, ONE exported function. 30s threshold is internal.

### Related

- `src/lib/audio/processEffects.ts`
- `src/workers/effect-processor.ts`

---

## Decision: Sparse Array Fix (>=30s Bug Root Cause)

**Date**: 2026-03-28
**Status**: Decided

### Context

`new Array(numChunks)` creates holes. `.every((c) => c !== undefined)` skips holes — so after first chunk, `.every()` returned `true`, calling `stitchChunks` with empty slots.

### Decision

Use `Array.from({ length: numChunks })` for dense arrays with actual `undefined` values.

---

## Decision: AbortController for Pipeline Cancellation

**Date**: 2026-03-28
**Status**: Decided

### Context

Generation counters required coordinating counter state across composables, workers, and the store. Race conditions were hard to reason about.

### Decision

Standard `AbortController`/`AbortSignal` — one controller per regeneration cycle. `onScopeDispose(() => controller?.abort())` for automatic cleanup. Worker-internal seqNum kept only as optimization.

### Related

- `src/composables/useAudioPipeline.ts`

---

## Decision: targetBuffer Change Notification

**Date**: 2026-03-28
**Status**: Decided

### Context

When effects are re-baked during playback, the playing `AudioBufferSourceNode` still references the old buffer.

### Decision

Listener pattern on `setTargetBuffer` in the nodes store. `useNodePlayback` subscribes and hot-swaps: stop → restore cursor → play with new buffer.

### Related

- `src/stores/nodes.ts` — `onTargetBufferChange`, `setTargetBuffer`
- `src/composables/useNodePlayback.ts`

---

## Decision: useAudioPipeline — Separate Synth Render from Effect Baking

**Date**: 2026-03-13
**Status**: Decided

### Decision

Reusable `useAudioPipeline` composable separates concerns:
- **useInstrumentAudioNode**: watches notes/bpm/instrument → `rawBuffer`
- **useAudioPipeline**: watches rawBuffer + effects → `targetBuffer` via worker
- Injectable `processFn` for testability

### Related

- `src/composables/useAudioPipeline.ts`

---

## Decision: Strip Vue Reactive Proxies Before postMessage

**Date**: 2026-03-28
**Status**: Decided

### Decision

`JSON.parse(JSON.stringify(effects.value))` in the watcher getter strips all proxies before worker transfer. Spread is NOT enough for nested objects.

### Related

- `src/composables/useAudioPipeline.ts`

---

## Deprecated Decisions

| Decision | Date | Replaced By | Why |
|----------|------|-------------|-----|
| Two separate worker instances | 2026-03 | Consolidated single processEffects | Unnecessary complexity |
| Generation counters for cancellation | 2026-03 | AbortController | Simpler, standard API |
| AudioBuffer stored directly in Pinia | 2026-03 | AudioBuffer repository with IDs | Reactive proxy overhead + browser corruption |
| Monolithic useAllNodes composable | 2026-03 | Per-type composables | Type safety + pipeline opt-in |
