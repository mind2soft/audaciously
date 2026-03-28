# Chunked Effect Pipeline & Wasm DSP Architecture

> Architecture document for long-form audio processing, stateful chunked pipelines, and selective WebAssembly DSP modules.

**Status**: Planned
**Created**: 2026-03-28
**Last Updated**: 2026-03-28

---

## Problem Statement

The current effect pipeline processes an entire AudioBuffer in a single pass inside a Web Worker. This works well for short buffers (seconds to low minutes) but breaks down for long-form audio:

| Duration | Samples (48 kHz stereo) | Buffer memory | 3-effect pipeline memory traffic |
|----------|------------------------|---------------|----------------------------------|
| 10 s     | 960 K                  | ~3.8 MB       | ~23 MB                           |
| 5 min    | 28.8 M                 | ~115 MB       | ~690 MB                          |
| 45 min   | 259.2 M                | ~989 MB       | ~5.9 GB                          |

At 45 minutes the browser must allocate ~1 GB for the buffer, another ~1 GB for the processed copy, and stream ~6 GB through the CPU. Mobile tabs will OOM-kill well before that.

The roadmap also lists effects that are compute-heavy enough to benefit from WebAssembly SIMD: noise reduction (FFT spectral subtraction), pitch shifting (phase vocoder), and convolution reverb.

These two concerns — memory and compute — are orthogonal but must be addressed in sequence: chunking first (structural), Wasm second (performance), AudioWorklet third (real-time).

---

## Architecture Overview

Three phases, each building on the previous:

```
Phase 1: Chunked stateful pipeline       ← memory + long-form support
Phase 2: Wasm DSP modules                ← compute performance for heavy effects
Phase 3: AudioWorklet real-time path     ← live processing
```

### Current Data Flow (single-shot)

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

### Target Data Flow (chunked)

```
useAudioPipeline watcher
  → computeTargetBuffer(source, effects, nodeId)
    IF source.duration < CHUNK_THRESHOLD:
      → [existing single-shot path, unchanged]
    ELSE:
      → chunkOrchestrator.processChunked(source, effects, nodeId)
        → split source into N-second chunks
        → chunk 0: worker.postMessage({ type: 'chunk-init', chunk, effects, ... })
          → processEffectPipeline(chunk, effects, ctx, isCancelled, state=null)
          ← { processedChunk, state: S }  [worker holds S]
        → chunk 1: worker.postMessage({ type: 'chunk-continue', chunk, nodeId })
          → processEffectPipeline(chunk, effects, ctx, isCancelled, state=S)
          ← { processedChunk, state: S' }  [worker updates S]
        → ...
        → chunk N: worker.postMessage({ type: 'chunk-finalize', chunk, nodeId })
          → processEffectPipeline(chunk, effects, ctx, isCancelled, state=S'')
          ← { processedChunk }  [worker clears state]
        → stitch all processedChunks into final AudioBuffer
  → targetBuffer.value = result
```

Memory stays bounded at `chunkSize × 2` (one chunk in worker + one being stitched) regardless of total duration.

---

## Phase 1: Chunked Stateful Pipeline

**Goal**: Process arbitrarily long audio with bounded memory, no Wasm dependency.

### 1.1 DspContext Extension

The current `DspContext` has `sampleRate`, `duration`, and `offset`. For chunking, each effect needs to know its position in the global timeline:

```ts
interface DspContext {
  readonly sampleRate: number;
  /** Duration of this buffer/chunk in seconds. */
  readonly duration: number;
  /** Playback offset (seconds). Legacy field, always 0 in effect pipeline. */
  readonly offset: number;
  /** Time position of this chunk's first sample in the full buffer (seconds). Default: 0. */
  readonly globalOffset: number;
  /** Total duration of the full (unchunked) buffer (seconds). Default: duration. */
  readonly totalDuration: number;
}
```

**Backward compatibility**: When `globalOffset = 0` and `totalDuration = duration` (the defaults), all effects behave identically to today. The single-shot path sets these defaults implicitly.

### 1.2 Per-Effect Global Positioning

Each effect uses `globalOffset` and `totalDuration` to determine which region of the global timeline its chunk covers:

| Effect | Current behavior | Chunked behavior |
|--------|-----------------|------------------|
| **Gain** | `ch[i] *= value` | Unchanged — stateless |
| **Balance** | `left[i] *= lGain` | Unchanged — stateless |
| **Fade-in** | Process samples 0..fadeSamples | Compute global fade region, intersect with chunk window |
| **Fade-out** | Process samples (total-fade)..total | Use `totalDuration` for global fade start, intersect with chunk window |
| **Volume** | Walk from segment 0, time = i/sr | Start at `globalOffset`, binary search for initial segment |
| **Split** | Delegates to sub-pipeline | Passes enriched context to sub-pipelines |

**Key insight**: For the current effect set, no per-effect state is carried between chunks. Global positioning via `DspContext` is sufficient. Per-effect state becomes necessary when stateful effects are added (IIR/FIR filters, reverb delay buffers, compressor envelope followers).

### 1.3 PipelineState (Structural Plumbing)

Even though current effects don't need inter-chunk state, the pipeline must be able to thread it for future effects:

```ts
/** Per-effect state carried across chunk boundaries. Keyed by effect.id. */
interface PipelineState {
  effectStates: Map<string, unknown>;
}
```

`processEffectPipeline` gains an optional state parameter and returns updated state:

```ts
function processEffectPipeline(
  channels: Float32Array[],
  effects: AudioEffect[],
  ctx: DspContext,
  isCancelled: () => boolean,
  state?: PipelineState | null,
): { completed: boolean; state: PipelineState };
```

For current effects, the state map is always empty. The plumbing exists so Phase 2 effects (filters, reverb) can use it without rearchitecting.

### 1.4 Chunked Worker Protocol

New message types alongside the existing single-shot protocol:

```ts
// Initialise a chunked session — sends effects config + first chunk.
interface ChunkInitRequest {
  type: 'chunk-init';
  nodeId: string;
  seqNum: number;
  effects: AudioEffect[];
  sampleRate: number;
  totalDuration: number;   // full buffer duration
  totalSamples: number;    // full buffer sample count
  chunkIndex: number;      // 0
  channels: Float32Array[]; // first chunk
}

// Continue — sends next chunk, worker resumes from held state.
interface ChunkContinueRequest {
  type: 'chunk-continue';
  nodeId: string;
  seqNum: number;
  chunkIndex: number;
  channels: Float32Array[];
}

// Finalize — sends last chunk, worker clears state after processing.
interface ChunkFinalizeRequest {
  type: 'chunk-finalize';
  nodeId: string;
  seqNum: number;
  chunkIndex: number;
  channels: Float32Array[];
}

// Response (same for all chunk types).
interface ChunkResponse {
  type: 'chunk-response';
  nodeId: string;
  seqNum: number;
  chunkIndex: number;
  channels: Float32Array[]; // processed chunk [Transferable]
}
```

The worker holds a `Map<nodeId, ChunkSession>`:

```ts
interface ChunkSession {
  effects: AudioEffect[];
  sampleRate: number;
  totalDuration: number;
  totalSamples: number;
  chunkSize: number;         // samples per chunk (computed from first chunk)
  state: PipelineState;      // carried between chunks
  seqNum: number;            // for cancellation
}
```

### 1.5 Chunk Orchestrator (Main Thread)

New module `src/lib/audio/chunkOrchestrator.ts`:

```ts
interface ChunkOrchestratorOptions {
  /** Chunk duration in seconds. Default: 10. */
  chunkDurationSec?: number;
}

function processChunked(
  source: AudioBuffer,
  effects: AudioEffect[],
  nodeId: string,
  options?: ChunkOrchestratorOptions,
): Promise<AudioBuffer>;
```

Algorithm:
1. Compute chunk count: `ceil(source.duration / chunkDurationSec)`
2. For each chunk: extract Float32Array slice, send to worker, await response
3. Stitch responses into a single AudioBuffer
4. Cancel all pending chunks if a newer seqNum arrives

Memory at any point: ~`chunkDurationSec × sampleRate × channels × 4 bytes × 2` (one chunk sending + one chunk receiving).

### 1.6 Threshold Routing

`computeTargetBuffer` gains threshold logic:

```ts
const CHUNK_THRESHOLD_SEC = 30;

export async function computeTargetBuffer(
  source: AudioBuffer,
  effects: AudioEffect[],
  nodeId: string,
): Promise<AudioBuffer> {
  const enabled = effects.filter(e => e.enabled);
  if (enabled.length === 0) return source;

  if (source.duration < CHUNK_THRESHOLD_SEC) {
    return effectClient.process(source, effects, nodeId);
  }

  return processChunked(source, effects, nodeId);
}
```

The composable (`useAudioPipeline`) does not change — `computeTargetBuffer` is its `processFn`, and the chunked path is transparent.

---

## Phase 2: Wasm DSP Modules

**Goal**: 3-5x performance for compute-heavy effects via Rust + wasm-pack SIMD.

**Prerequisite**: Phase 1 complete (chunked pipeline provides the execution framework).

### 2.1 When Wasm Matters

| Effect | Algorithm | Why Wasm helps |
|--------|-----------|---------------|
| Noise reduction | FFT spectral subtraction | FFT butterfly ops are textbook SIMD |
| Pitch shift | Phase vocoder (STFT + phase manipulation) | O(N log N) FFT + complex arithmetic |
| Convolution reverb | FFT-based overlap-add convolution | Large FFT, multiply-accumulate |
| EQ | Multi-band IIR/FIR filters | Tight loops with memory (filter state) |

Effects where Wasm does NOT help meaningfully: gain, balance, fade, volume automation (already memory-bound in JS).

### 2.2 Architecture

Wasm modules slot into the existing pipeline dispatch:

```ts
// pipeline.ts — future
case "noiseReduction":
  return processNoiseReduction(channels, effect, ctx, state);
  // internally calls wasmFft.forward(), spectral subtraction, wasmFft.inverse()
```

The pipeline doesn't care whether an effect calls JS or Wasm. The `Float32Array` data is shared via Wasm linear memory views (no copy).

### 2.3 Toolchain

```
src/
  wasm/
    Cargo.toml           # Rust workspace
    fft/                  # FFT module (shared by noise reduction, pitch shift, reverb)
      src/lib.rs
    pitch-shift/          # Phase vocoder
      src/lib.rs
  features/effects/dsp/
    wasm-fft.ts          # TS wrapper: loads .wasm, exposes typed API
    noise-reduction.ts   # Uses wasm-fft internally
    pitch-shift.ts       # Uses wasm-fft internally
```

Build: `wasm-pack build --target web` integrated into Vite via `vite-plugin-wasm`.

### 2.4 State Across Chunks

This is where `PipelineState` (from Phase 1) becomes essential:

- **FFT overlap-add**: needs the overlap tail from the previous chunk
- **IIR filters**: needs previous sample values (z^-1, z^-2 delay elements)
- **Compressor envelope**: needs the current envelope level

These states are Wasm-side memory. The pipeline state map stores serialized snapshots or Wasm memory segment references.

---

## Phase 3: AudioWorklet Real-Time Path

**Goal**: Apply effects in real-time during playback/recording, not just offline.

**Prerequisite**: Phase 2 Wasm modules (same DSP code runs in both contexts).

### 3.1 Architecture

```ts
// AudioWorkletProcessor subclass
class EffectWorkletProcessor extends AudioWorkletProcessor {
  private wasmInstance: WasmDspModule;
  private state: PipelineState;

  process(inputs, outputs, parameters) {
    const chunk = inputs[0]; // 128 samples per channel
    // Same DSP pipeline, different buffer size
    processEffectPipeline(chunk, this.effects, ctx, () => false, this.state);
    // Copy to output
    return true;
  }
}
```

The chunked protocol maps naturally — AudioWorklet delivers fixed 128-sample chunks. The `PipelineState` persists across `process()` calls exactly as it does between worker chunks.

### 3.2 Shared Code

| Module | Offline (Worker) | Real-time (AudioWorklet) |
|--------|------------------|--------------------------|
| FFT | 10s chunks | 128-sample chunks |
| Filters | 10s chunks | 128-sample chunks |
| Pipeline | Same `processEffectPipeline` | Same function |
| State | Held by worker between messages | Held by processor between calls |

Same Wasm binary loaded in both contexts.

---

## File Map

### Phase 1 (this implementation)

| File | Action | Purpose |
|------|--------|---------|
| `src/features/effects/dsp/types.ts` | Modify | Add `globalOffset`, `totalDuration` to DspContext; define PipelineState |
| `src/features/effects/dsp/fade-in.ts` | Modify | Use global positioning for chunk-aware fade |
| `src/features/effects/dsp/fade-out.ts` | Modify | Use global positioning for chunk-aware fade |
| `src/features/effects/dsp/volume.ts` | Modify | Use globalOffset as initial time; binary search for start segment |
| `src/features/effects/dsp/pipeline.ts` | Modify | Accept/return PipelineState; pass enriched ctx |
| `src/workers/effect-processor.ts` | Modify | Add chunk message types and handler; hold session state |
| `src/lib/audio/chunkOrchestrator.ts` | Create | Chunk splitting, sequential dispatch, result stitching |
| `src/lib/audio/effectWorker.ts` | Modify | Add chunked dispatch method alongside existing `process()` |
| `src/features/nodes/compute-target-buffer.ts` | Modify | Threshold routing: single-shot vs chunked |

### Phase 2 (future)

| File | Action | Purpose |
|------|--------|---------|
| `src/wasm/Cargo.toml` | Create | Rust workspace |
| `src/wasm/fft/src/lib.rs` | Create | FFT module (radix-2/4, SIMD) |
| `src/features/effects/dsp/wasm-fft.ts` | Create | TS wrapper for Wasm FFT |
| `src/features/effects/dsp/noise-reduction.ts` | Create | Spectral subtraction using Wasm FFT |
| `src/features/effects/dsp/pitch-shift.ts` | Create | Phase vocoder using Wasm FFT |
| `vite.config.ts` | Modify | Add vite-plugin-wasm |

### Phase 3 (future)

| File | Action | Purpose |
|------|--------|---------|
| `src/workers/effect-worklet-processor.ts` | Create | AudioWorkletProcessor with Wasm DSP |
| `src/lib/audio/effectWorklet.ts` | Create | Main-thread AudioWorklet wrapper |

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Chunked before Wasm | Memory is the immediate blocker; Wasm only helps compute (Phase 2 effects) |
| 10-second default chunk size | Balances memory (~3.8 MB/chunk stereo 48kHz) vs overhead (fewer round-trips) |
| 30-second threshold | Below this, single-shot is faster (no chunking overhead). Above, memory matters. |
| PipelineState plumbed now, used later | Structural cost is minimal; avoids rearchitecting when stateful effects arrive |
| Global positioning over per-effect state | Current effects (gain, balance, fade, volume) need only timeline position, not memory. Simpler, fewer changes. |
| Existing single-shot path preserved | Zero regression risk for short buffers; chunking is additive |
| Wasm only for FFT-class effects | Simple arithmetic (gain, volume) is already memory-bound in JS — Wasm can't help |

---

## References

- [Roadmap: Audio Processing section](../roadmap.md)
- [Roadmap: Low-Level / Platform section](../roadmap.md)
- [Current DSP modules](../../src/features/effects/dsp/)
- [Current worker protocol](../../src/workers/effect-processor.ts)
- [Current main-thread wrapper](../../src/lib/audio/effectWorker.ts)
- [useAudioPipeline composable](../../src/composables/useAudioPipeline.ts)
