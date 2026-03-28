<!-- Context: project-intelligence/decisions | Priority: high | Version: 2.0 | Updated: 2026-03-28 -->

# Decisions Log — Audaciously

> Major architectural decisions with full context. Prevents "why was this done?" debates.

**Last Updated**: 2026-03-28

---

## Decision: Chunked Stateful Effect Pipeline

**Date**: 2026-03-28
**Status**: Decided

### Context

At 48 kHz stereo, a 45-minute buffer is ~1 GB. Processing requires source + output copy (~2 GB peak), plus ~6 GB throughput for a 3-effect chain. Mobile tabs OOM-kill. The project intent is to push the browser to its limits.

### Decision

3-phase architecture:
1. **Phase 1 — Chunked stateful pipeline** (pure TS): Split long buffers into N-second chunks, process sequentially with state carried between chunks. Memory bounded at ~50 MB.
2. **Phase 2 — Wasm DSP modules** (Rust/wasm-pack): FFT-class effects (noise reduction, pitch shift, reverb) in Wasm with SIMD.
3. **Phase 3 — AudioWorklet real-time path**: Same Wasm modules in AudioWorkletProcessor for live processing.

### Rationale

Memory is the immediate blocker. Chunking is prerequisite for Wasm. AudioWorklet delivers 128-sample chunks — maps directly. Each phase is independently useful.

### Related

- `docs/architecture/chunked-pipeline.md`

---

## Decision: Consolidated Worker Architecture (Single processEffects)

**Date**: 2026-03-28
**Status**: Decided

### Context

The pipeline previously had two separate modules: `effectWorker.ts` (single-shot, <30s) and `chunkOrchestrator.ts` (chunked, >=30s), each with their own worker instance. This created:
- Two code paths for the same operation
- Separate seqNum namespaces that couldn't coordinate
- Unnecessary complexity in `compute-target-buffer.ts` choosing between paths

### Decision

Consolidate into single `processEffects.ts` — ONE worker instance, ONE exported function. The 30s threshold is an internal implementation detail, not an API boundary.

### Rationale

- One function to call, one worker to manage, one cancellation path
- AbortController handles cancellation — no main-thread seqNum maps needed
- Worker-internal seqNum kept only as lightweight optimization per nodeId
- Eliminated `effectWorker.ts` and `chunkOrchestrator.ts` entirely

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Keep two workers, add coordination | More complexity, same result |
| Single worker but two exported functions | Still exposes threshold to callers |

### Related

- `src/lib/audio/processEffects.ts`
- `src/workers/effect-processor.ts`

---

## Decision: Sparse Array Fix (>=30s Bug Root Cause)

**Date**: 2026-03-28
**Status**: Decided

### Context

`new Array(numChunks)` creates a sparse array with holes. `.every((c) => c !== undefined)` skips holes in sparse arrays — so after receiving just the first chunk, `.every()` returned `true`, calling `stitchChunks` with mostly-empty slots. The `for...of` loop yielded `undefined` for missing chunks, throwing `TypeError`.

This was the root cause of the >=30s bug. Not a cancellation problem.

### Decision

Use `Array.from({ length: numChunks })` to create a dense array with actual `undefined` values that `.every()` properly tests.

### Impact

- **Positive**: Fixes all tracks >=30s; zero behavioral change for short tracks
- **Risk**: None — `Array.from` is universally supported

---

## Decision: AbortController for Pipeline Cancellation

**Date**: 2026-03-28
**Status**: Decided

### Context

The pipeline used generation counters to discard stale results. This required coordinating counter state across composables, workers, and the store. Race conditions were hard to reason about.

### Decision

Standard `AbortController`/`AbortSignal` — one controller per regeneration cycle:

```ts
if (controller) controller.abort();
controller = new AbortController();
try {
  result = await processEffects(source, effects, controller.signal, nodeId);
} catch { /* ignore if aborted */ }
```

### Rationale

- Standard platform API, well-understood semantics
- No shared mutable state between caller and callee
- `onScopeDispose(() => controller?.abort())` for automatic cleanup
- Worker-internal seqNum kept only as optimization (not for correctness)

### Related

- `src/composables/useAudioPipeline.ts`
- `src/composables/useInstrumentNode.ts`

---

## Decision: targetBuffer Change Notification

**Date**: 2026-03-28
**Status**: Decided

### Context

When effects are re-baked during node preview playback, the node's `targetBuffer` updates in the store but the playing `AudioBufferSourceNode` still references the old buffer. Users don't hear effect changes until they stop and restart playback.

### Decision

Add listener pattern to `setTargetBuffer` in the nodes store:

```ts
type TargetBufferListener = (id: string, buffer: AudioBuffer | null) => void;
const listeners = new Set<TargetBufferListener>();
function onTargetBufferChange(fn: TargetBufferListener): () => void { /* subscribe/unsubscribe */ }
```

`useNodePlayback` subscribes and hot-swaps: stop → restore cursor → play with new buffer.

### Rationale

- Decoupled — store doesn't know about playback
- Listener returns unsubscribe function — clean lifecycle
- Hot-swap preserves cursor position for seamless UX

### Related

- `src/stores/nodes.ts` — `onTargetBufferChange`, `setTargetBuffer`
- `src/composables/useNodePlayback.ts` — subscriber

---

## Decision: useAudioPipeline — Separate Synth Render from Effect Baking

**Date**: 2026-03-13
**Status**: Decided

### Context

Original `useInstrumentNode` bundled synth rendering and effect baking in a single watcher. Every effect edit triggered a full synth re-render, causing cascading cancellations.

### Decision

Reusable `useAudioPipeline` composable separates concerns:
- **useInstrumentNode**: watches notes/bpm/instrument → `rawBuffer`
- **useAudioPipeline**: watches rawBuffer + effects → `targetBuffer` via worker
- Both `useInstrumentNode` and `useRecordedNode` delegate to `useAudioPipeline`
- Injectable `processFn` for testability

### Related

- `src/composables/useAudioPipeline.ts`
- `src/composables/useInstrumentNode.ts`
- `src/composables/useRecordedNode.ts`

---

## Decision: Strip Vue Reactive Proxies Before postMessage

**Date**: 2026-03-28
**Status**: Decided

### Context

Vue 3's `ref<Map>` wraps nested objects with reactive Proxies. Spread creates shallow copies — nested arrays like `keyframes` remain Proxy objects. `worker.postMessage()` silently fails on Proxies.

### Decision

`JSON.parse(JSON.stringify(effects.value))` in the watcher getter strips all proxies before worker transfer.

### Related

- `src/composables/useAudioPipeline.ts`

---

## Deprecated Decisions

| Decision | Date | Replaced By | Why |
|----------|------|-------------|-----|
| Two separate worker instances | 2026-03 | Consolidated single processEffects | Unnecessary complexity |
| Generation counters for cancellation | 2026-03 | AbortController | Simpler, standard API |
