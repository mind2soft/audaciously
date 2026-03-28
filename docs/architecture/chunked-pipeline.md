# Effect Pipeline Architecture

> How Audaciously processes effects offline — from a single gain adjustment to a 45-minute recording with six stacked effects.

---

## Overview

Effects are pure DSP functions that operate on raw `Float32Array` channel data inside Web Workers. No Web Audio API nodes are involved in effect processing — the DSP layer is plain math on sample buffers.

Two processing paths exist, selected automatically by buffer duration:

| Path | When | Memory profile |
|------|------|----------------|
| **Single-shot** | Duration < 30 s | Entire buffer in worker memory |
| **Chunked** | Duration ≥ 30 s | ~50 MB peak (10 s chunks) |

The caller (`useAudioPipeline`) doesn't know which path runs — `computeTargetBuffer` routes transparently.

### Why chunking matters

Single-shot processing allocates the full buffer in the worker, plus a copy for the result:

| Duration | Samples (48 kHz stereo) | Buffer memory | 3-effect pipeline memory traffic |
|----------|------------------------|---------------|----------------------------------|
| 10 s     | 960 K                  | ~3.8 MB       | ~23 MB                           |
| 5 min    | 28.8 M                 | ~115 MB       | ~690 MB                          |
| 45 min   | 259.2 M                | ~989 MB       | ~5.9 GB                          |

At 45 minutes the browser must allocate ~1 GB for the buffer, another ~1 GB for the processed copy, and stream ~6 GB through the CPU. Mobile tabs OOM-kill well before that. Chunking caps memory at ~50 MB regardless of duration.

---

## Data Flow

### Single-shot path (< 30 s)

```
useAudioPipeline watcher
  → computeTargetBuffer(source, effects, nodeId)
    → effectClient.process(source, effects, nodeId)
      → worker.postMessage({ channels, effects, sampleRate, ... })
        → processEffectPipeline(channels, effects, ctx, isCancelled)
          → effect1(channels) → effect2(channels) → ... → effectN(channels)
      ← worker.postMessage({ channels })  [Transferable, zero-copy]
    ← reconstruct AudioBuffer from Float32Array[]
  → targetBuffer.value = result
→ sync watch → store._setTargetBuffer(id, result)
```

### Chunked path (≥ 30 s)

```
useAudioPipeline watcher
  → computeTargetBuffer(source, effects, nodeId)
    → chunkOrchestrator.processChunked(source, effects, nodeId)
      → split source into 10-second chunks
      → chunk 0: worker.postMessage({ type: 'chunk-init', chunk, effects, ... })
        → processEffectPipeline(chunk, effects, ctx, isCancelled, state=null)
        ← { processedChunk, state }  [worker holds state]
      → chunk 1: worker.postMessage({ type: 'chunk-continue', chunk, nodeId })
        → processEffectPipeline(chunk, effects, ctx, isCancelled, state)
        ← { processedChunk, state' }  [worker updates state]
      → ...
      → chunk N: worker.postMessage({ type: 'chunk-finalize', chunk, nodeId })
        → processEffectPipeline(chunk, effects, ctx, isCancelled, state'')
        ← { processedChunk }  [worker clears state]
      → stitchChunks() → single AudioBuffer
  → targetBuffer.value = result
```

Memory stays bounded at `chunkSize × 2` (one chunk in worker + one being stitched) regardless of total duration.

---

## DSP Layer

All effect processors live in `src/features/effects/dsp/`. Each is a pure function: `(channels, effect, ctx) → void` (in-place mutation). No Web Audio dependency, no side effects, trivially testable.

### DspContext

Every effect receives a `DspContext` describing the audio it's operating on:

```ts
interface DspContext {
  readonly sampleRate: number;
  readonly duration: number;       // this buffer/chunk duration
  readonly offset: number;         // legacy, always 0 in effect pipeline
  readonly globalOffset: number;   // chunk's position in the full buffer (seconds)
  readonly totalDuration: number;  // full buffer duration (seconds)
}
```

For single-shot processing, `globalOffset = 0` and `totalDuration = duration`. For chunks, these fields tell each effect where it sits in the global timeline. Factory helpers enforce this:

- `createSingleShotContext(sampleRate, duration)` — sets `globalOffset=0`, `totalDuration=duration`
- `createChunkContext(sampleRate, chunkDuration, globalOffset, totalDuration)` — for chunked sessions

### Per-effect behavior

| Effect | How it uses DspContext |
|--------|----------------------|
| **Gain** | Stateless — `ch[i] *= value`. Ignores positioning. |
| **Balance** | Stateless — attenuates L/R channels. Ignores positioning. |
| **Fade-in** | Computes the global fade region `[0, fadeDuration]`, intersects with the chunk window `[globalOffset, globalOffset + duration]`. Only samples inside the intersection are ramped. |
| **Fade-out** | Computes global fade start from `totalDuration - fadeDuration`, intersects with chunk window. Same intersection logic as fade-in. |
| **Volume automation** | Binary search via `findSegment()` to locate the starting keyframe segment for `globalOffset`. Walks forward from there. Time = `globalOffset + i/sampleRate`. |
| **Split** | Passes enriched context to independent L/R sub-pipelines. |

None of the current effects carry state between chunks — `globalOffset` and `totalDuration` are sufficient. The pipeline threads a `PipelineState` (per-effect state map keyed by `effect.id`) for future stateful effects (IIR filters, reverb delay buffers, compressor envelopes), but the map stays empty today.

### Pipeline function

```ts
function processEffectPipeline(
  channels: Float32Array[],
  effects: AudioEffect[],
  ctx: DspContext,
  isCancelled: () => boolean,
  state?: PipelineState | null,
): PipelineResult;  // { completed: boolean; state: PipelineState }
```

Iterates enabled effects in order, checks `isCancelled()` between each. Returns early with `completed: false` on cancellation.

---

## Worker Protocol

The effect worker (`src/workers/effect-processor.ts`) handles two protocols on the same thread:

### Single-shot messages

A flat message with `channels`, `effects`, `sampleRate`, `nodeId`, `seqNum`. Response is the processed channels (Transferable, zero-copy back to main thread).

### Chunked messages

Three message types for a chunked session:

| Type | Purpose | Payload |
|------|---------|---------|
| `chunk-init` | Start session — carries effects config + first chunk | `effects`, `sampleRate`, `totalDuration`, `totalSamples`, `chunkIndex`, `channels` |
| `chunk-continue` | Send next chunk — worker resumes from held state | `chunkIndex`, `channels` |
| `chunk-finalize` | Last chunk — worker clears session after processing | `chunkIndex`, `channels` |

All three return a `chunk-response` with the processed channels (Transferable).

The worker holds a `Map<nodeId, ChunkSession>` with per-session state:

```ts
interface ChunkSession {
  effects: AudioEffect[];
  sampleRate: number;
  totalDuration: number;
  totalSamples: number;
  chunkSize: number;
  state: PipelineState;
  seqNum: number;
}
```

The worker distinguishes single-shot from chunked via a `type` field guard — single-shot messages have no `type` property.

### Two worker instances

`effectWorker.ts` and `chunkOrchestrator.ts` each instantiate their own `new EffectWorker()` at module level. They are completely independent — separate threads, separate `seqNum` maps. This avoids message interleaving between the two protocols.

---

## Chunk Orchestrator

`src/lib/audio/chunkOrchestrator.ts` is the main-thread coordinator for chunked processing.

```ts
function processChunked(
  source: AudioBuffer,
  effects: AudioEffect[],
  nodeId: string,
  options?: { chunkDurationSec?: number },  // default: 10
): Promise<AudioBuffer>;
```

**Algorithm**:
1. Compute chunk count: `ceil(totalSamples / chunkSizeSamples)`
2. Extract each chunk as a `Float32Array[]` slice via `copyFromChannel`
3. Dispatch chunks sequentially (init → continue × N → finalize)
4. Collect processed chunks as they return
5. `stitchChunks()` assembles them into a single `AudioBuffer` via `copyToChannel`

**Cancellation**: Each request carries a `seqNum`. If a newer request arrives for the same `nodeId` (checked via `isSuperseded()`), the orchestrator aborts and rejects the promise. The worker also checks `seqNum` and skips stale sessions.

---

## Threshold Routing

`src/features/nodes/compute-target-buffer.ts` is the single entry point called by `useAudioPipeline`:

```ts
const CHUNK_THRESHOLD_SEC = 30;

async function computeTargetBuffer(source, effects, nodeId): Promise<AudioBuffer> {
  if (no enabled effects) return source;          // zero-copy fast path
  if (source.duration < 30s) return singleShot(); // effectWorker
  return chunked();                                // chunkOrchestrator
}
```

The composable is unaware of the routing — it injects `computeTargetBuffer` as its `processFn`.

---

## Where things live

| File | Purpose |
|------|---------|
| `src/features/effects/dsp/types.ts` | `DspContext`, `PipelineState`, `PipelineResult`, factory helpers |
| `src/features/effects/dsp/pipeline.ts` | `processEffectPipeline` — iterates effects, threads state |
| `src/features/effects/dsp/gain.ts` | Gain effect processor |
| `src/features/effects/dsp/balance.ts` | Balance effect processor |
| `src/features/effects/dsp/fade-in.ts` | Chunk-aware fade-in (global region intersection) |
| `src/features/effects/dsp/fade-out.ts` | Chunk-aware fade-out (global region intersection) |
| `src/features/effects/dsp/volume.ts` | Volume automation with `findSegment()` binary search |
| `src/features/effects/dsp/split.ts` | Split into L/R sub-pipelines |
| `src/workers/effect-processor.ts` | Web Worker — single-shot + chunked protocols |
| `src/lib/audio/effectWorker.ts` | Main-thread client for single-shot worker communication |
| `src/lib/audio/chunkOrchestrator.ts` | Main-thread coordinator for chunked processing |
| `src/features/nodes/compute-target-buffer.ts` | Threshold routing (< 30 s → single-shot, ≥ 30 s → chunked) |
| `src/composables/useAudioPipeline.ts` | Reactive pipeline composable — watches source + effects |

### Tests

| File | Coverage |
|------|----------|
| `src/features/effects/dsp/pipeline.test.ts` | Pipeline function, effect ordering, cancellation |
| `src/features/effects/dsp/volume.test.ts` | Volume automation, keyframe interpolation |
| `src/features/effects/dsp/chunked.test.ts` | 18 end-to-end chunk tests — fade, volume, multi-chunk stitching |
| `src/features/effects/dsp/structured-clone.test.ts` | Reactive proxy stripping for worker transfer |
| `src/features/nodes/compute-target-buffer.test.ts` | Threshold routing, zero-copy fast path |
| `src/composables/useAudioPipeline.test.ts` | Composable reactivity, generation counter |
| `src/composables/sync-watch-store.test.ts` | Store sync watch behavior |

59 tests total, all passing.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| 10-second default chunk size | Balances memory (~3.8 MB/chunk stereo 48 kHz) vs overhead (fewer round-trips) |
| 30-second threshold | Below this, single-shot is faster (no chunking overhead). Above, memory matters. |
| Global positioning over per-effect state | Current effects need only timeline position, not memory between chunks. Simpler. |
| PipelineState plumbed but empty | Structural cost is minimal; avoids rearchitecting when stateful effects arrive |
| Two separate Worker instances | Avoids message interleaving between single-shot and chunked protocols |
| Single-shot path preserved | Zero regression risk for short buffers; chunking is additive |
| Pure functions on Float32Array | No Web Audio dependency in DSP layer — testable, portable to Wasm or AudioWorklet |

---

## Future Directions

The pipeline is designed to extend in two directions:

**Wasm DSP modules** — Effects that are compute-bound rather than memory-bound (FFT spectral subtraction for noise reduction, phase vocoder for pitch shift, overlap-add convolution for reverb) would benefit from Rust + wasm-pack SIMD. The pipeline dispatch doesn't care whether an effect calls JS or Wasm — they share the same `Float32Array` interface. `PipelineState` becomes essential here: FFT overlap-add needs the tail from the previous chunk, IIR filters need delay elements, compressor envelopes need continuity.

**AudioWorklet real-time path** — The same `processEffectPipeline` function could run inside an `AudioWorkletProcessor` for live effect preview during playback. AudioWorklet delivers fixed 128-sample chunks — the chunked protocol maps naturally, and `PipelineState` persists across `process()` calls exactly as it does between worker chunks.

---

## References

- [DSP modules](../../src/features/effects/dsp/)
- [Worker protocol](../../src/workers/effect-processor.ts)
- [Effect worker client](../../src/lib/audio/effectWorker.ts)
- [Chunk orchestrator](../../src/lib/audio/chunkOrchestrator.ts)
- [useAudioPipeline composable](../../src/composables/useAudioPipeline.ts)
