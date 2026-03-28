# Decisions Log — Audaciously

> Record major architectural and business decisions with full context. This prevents "why was this done?" debates.

**Last Updated**: 2026-03-28

---

## Decision: Chunked Stateful Effect Pipeline

**Date**: 2026-03-28
**Status**: Decided
**Owner**: Yanick Rochon

### Context

The effect pipeline processes an entire AudioBuffer in one pass inside a Web Worker. At 48 kHz stereo, a 45-minute buffer is ~1 GB. The browser must allocate this plus a processed copy (~2 GB peak), and stream ~6 GB through the CPU for a 3-effect chain. Mobile tabs OOM-kill well before that. Even on desktop, this exhausts available memory for multi-track projects.

The project intent is to push the browser to its limits — long-form audio support is a natural goal, not a nice-to-have.

### Decision

Implement a 3-phase architecture:

1. **Phase 1 — Chunked stateful pipeline** (pure TS): Split long buffers into N-second chunks, process sequentially with state carried between chunks. Memory stays bounded at ~50 MB regardless of duration.
2. **Phase 2 — Wasm DSP modules** (Rust/wasm-pack): Implement FFT-class effects (noise reduction, pitch shift, convolution reverb) in Wasm with SIMD. These slot into the chunked pipeline from Phase 1.
3. **Phase 3 — AudioWorklet real-time path**: Load the same Wasm modules in AudioWorkletProcessor for live effect processing during playback.

### Rationale

- Memory is the immediate blocker (Phase 1). Compute performance only matters for effects that don't exist yet (Phase 2).
- Chunking is prerequisite infrastructure — Wasm modules need a chunked pipeline to operate within memory bounds on long audio.
- AudioWorklet naturally delivers 128-sample chunks, so the chunked protocol maps directly (Phase 3).
- Phases are independent deliverables: each is useful on its own, each unlocks the next.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|-------------|
| Wasm-only (no chunking) | Better compute for heavy effects | Doesn't solve memory — still loads entire buffer | Memory is the immediate blocker, not compute |
| OffscreenCanvas / streaming | Avoids holding full buffer | Web Audio API requires complete AudioBuffer for playback; can't stream partial results | API limitation |
| Process in AudioWorklet directly | Real-time, no worker needed | AudioWorklet has no access to full buffer; only processes live audio | Doesn't work for offline baking |
| SharedArrayBuffer between threads | Zero-copy chunk sharing | Requires COOP/COEP headers; breaks many hosting setups | Deployment constraint too restrictive |
| Do nothing, limit to short audio | No work required | Contradicts project intent ("push the browser to its limits") | Rejected by project philosophy |

### Impact

- **Positive**: Unlocks arbitrarily long audio; bounded memory; foundation for Wasm effects and real-time AudioWorklet; no regression for short buffers (single-shot path preserved)
- **Negative**: Touches every DSP module (DspContext extension); adds protocol complexity to worker; chunked processing is slower than single-shot for short buffers (threshold routing mitigates this)
- **Risk**: Chunk boundary artifacts (fade/volume discontinuities) if global positioning math is wrong — mitigated by comprehensive tests comparing chunked vs single-shot output

### Related

- [Architecture document](../../docs/architecture/chunked-pipeline.md)
- [Roadmap: Audio Processing](../../docs/roadmap.md)
- [Roadmap: Low-Level / Platform](../../docs/roadmap.md)
- [Phase 1 task breakdown](../../.tmp/tasks/chunked-pipeline/)

---

## Decision: useAudioPipeline — Separate Synth Render from Effect Baking

**Date**: 2026-03-13
**Status**: Decided
**Owner**: Yanick Rochon

### Context

The original `useInstrumentNode` bundled synth rendering and effect baking in a single watcher. Every effect edit triggered a full synth re-render, causing cascading seqNum cancellations that prevented the effect-baked buffer from ever reaching the store. Users heard raw synth output with no volume changes applied.

### Decision

Create a reusable `useAudioPipeline` composable that separates concerns:

- **Stage 1** (synth watcher in useInstrumentNode): watches notes/bpm/instrument → produces `rawBuffer`
- **Stage 2** (useAudioPipeline): watches rawBuffer + effects → produces `targetBuffer` via worker
- Sync watch propagates `targetBuffer` → store

Both `useInstrumentNode` and `useRecordedNode` delegate Stage 2 to `useAudioPipeline` with an injected `processFn` for testability.

### Rationale

- Effect-only edits no longer trigger synth re-renders
- The pipeline composable is reusable across node types
- Injectable `processFn` enables Vitest testing without Worker/AudioContext
- Generation-based stale cancellation prevents race conditions

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|-------------|
| Fix watcher in-place | Less code change | Still couples synth+effects; same race conditions | Fundamental architecture problem |
| Debounce only | Quick fix | Doesn't fix the root cause (effects triggering synth) | Band-aid |

### Impact

- **Positive**: Volume automation now works; clean separation; testable; reusable
- **Negative**: Larger refactor; two composable files instead of one
- **Risk**: Vue reactive proxy arrays reaching postMessage (fixed by JSON.parse(JSON.stringify()) in watcher getter)

### Related

- `src/composables/useAudioPipeline.ts`
- `src/composables/useInstrumentNode.ts`
- `src/composables/useRecordedNode.ts`

---

## Decision: Strip Vue Reactive Proxies Before postMessage

**Date**: 2026-03-28
**Status**: Decided
**Owner**: Yanick Rochon

### Context

Vue 3's `ref<Map>` deeply wraps all objects with reactive Proxies. The `useAudioPipeline` watcher creates an effects snapshot using `effects.value.map(e => ({ ...e }))`, but spread only creates a shallow copy — nested arrays (e.g. `keyframes` on VolumeEffect) remain reactive Proxy objects.

When the effects reach `worker.postMessage()`, the structured clone algorithm must serialize these Proxies. If serialization fails (DataCloneError), the promise silently rejects and the pipeline retains the previous buffer — the user hears unmodified audio.

### Decision

Use `JSON.parse(JSON.stringify(effects.value))` in the watcher getter to deep-clone all reactive proxies into plain objects before they reach the processing function.

### Rationale

- `JSON.parse(JSON.stringify(...))` traverses all getters, producing guaranteed-plain objects
- Zero reactive proxy remnants at any nesting depth
- Simple, universally understood, no utility imports needed
- The effects array is small (typically 1–5 items) — serialization cost is negligible

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|-------------|
| `toRaw()` from Vue | Official API | Only strips top-level proxy, not nested | Doesn't fix nested keyframes |
| `structuredClone()` | Handles more types | Still fails on Proxy objects (same as postMessage) | Doesn't solve the problem |
| Deep `toRaw()` recursive | Strips all proxies | No built-in; must write recursive walker | Over-engineered for this case |
| `klona` or similar library | Fast deep clone | New dependency for a one-line fix | Unnecessary |

### Impact

- **Positive**: Eliminates silent postMessage failures; volume automation works
- **Negative**: JSON round-trip is marginally slower than spread (irrelevant for <5 objects)
- **Risk**: None — effects are plain serializable data (no functions, no circular refs)

### Related

- `src/composables/useAudioPipeline.ts` (line 78)

---

## Deprecated Decisions

| Decision | Date | Replaced By | Why |
|----------|------|-------------|-----|
| (none yet) | — | — | — |
