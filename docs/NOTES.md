# Developer Notes

Internal reference for non-obvious implementation decisions. Not user-facing.

---

## Paste modes (sequence)

Four modes are planned for paste operations in both the Piano Roll and Sequence Panel:

- **Splice** — inserts audio at the cursor and shifts the current track's content rightward. Only affects the one track.
- **Splice all** — same as splice, but shifts content on *all* tracks simultaneously. Preserves relative alignment across tracks.
- **Fill** — places audio only into silent regions. Skips any beat/time position that already has content. Useful for non-destructive layering.
- **Overwrite** — drops audio in place at the cursor with no shifting. Existing content that overlaps is truncated or replaced.

Currently only the right-shift behaviour (equivalent to "splice, single track") is implemented. The UI should present these as a mode selector before paste is confirmed.

---

## Node architecture

Nodes were chosen over a flat track list because arrangements grow hierarchically in practice:

- **Folder nodes** — pure grouping, no audio, not placeable on the timeline. Exist only for user organisation.
- **Instrument nodes** — own their note data and synthesis parameters (BPM, time signature, instrument type). The audio buffer is re-synthesised automatically when notes change. Synthesised on the fly; no pre-baked audio is stored.
- **Recorded nodes** — own a raw `AudioBuffer` captured from `MediaRecorder`. Treated as immutable after capture (edits create new buffers).

A single node can be placed as multiple segments on the timeline. Segments are references, not copies. Trimming a segment doesn't alter the underlying node buffer — it adjusts the playback window.

---

## Clipboard design

The clipboard is backed by `localStorage`, not an in-memory store, for two reasons:

1. Paste survives a page refresh without any additional persistence layer.
2. The clipboard is shared across tabs open to the same origin — useful when working with multiple projects side-by-side.

The clipboard stores serialised note data (beat position + pitch + duration). It is intentionally Piano Roll-only for now; there is no clipboard for sequence segments.

---

## Custom stereo balance node

`StereoPannerNode` does not behave intuitively on stereo sources — it re-positions a mono mix rather than independently attenuating each channel. Audaciously implements balance as two `GainNode`s (left/right channels split via `ChannelSplitterNode`, merged via `ChannelMergerNode`) with a simple crossfade law. The resulting node slots into the audio graph identically to any native node.

---

## Waveform rendering

Waveform SVG paths (`d` attribute strings) are computed inside a `Worker` thread. The main thread sends the raw sample buffer; the worker returns a path string ready to set on an `<svg>` element. This keeps waveform redraws off the main thread regardless of buffer size.

---

## Audio export

Export uses an offline `AudioContext` to render the full mix without real-time constraints. The rendered `AudioBuffer` is then:

- **WAV** — encoded via a small hand-written PCM encoder (no library)
- **MP3** — passed to `lamejs` for encoding, then offered as a download

Both paths run entirely client-side after the offline render completes.

---

## Volume automation bug & fix

Vue 3's `ref<Map>` deeply wraps objects with reactive Proxies. Spreading a reactive map creates only a shallow copy — nested arrays like `keyframes` remain Proxy objects. When passed to `worker.postMessage()`, structured clone fails silently on Proxies. The pipeline's catch block retains the previous buffer (gain=1 = raw audio), so the effect appears to do nothing.

Fix: `JSON.parse(JSON.stringify(effects.value))` in `useAudioPipeline.ts` strips all reactive proxies before posting to the worker.

---

## Two-stage effect pipeline

`useAudioPipeline.ts` is a reusable composable that separates synth rendering from effect baking. Both `useInstrumentNode` and `useRecordedNode` use it.

A single watcher fires when `sourceBuffer` or `effects` change. A generation counter discards stale results (avoids race conditions when edits arrive faster than processing completes).

The `processFn` is injected, not imported, for testability — production passes `computeTargetBuffer`, tests pass a synchronous mock.

---

## Playback context (provide/inject)

`usePlaybackContext.ts` defines `PlaybackContextKey` and `NodePlaybackContextKey` as Vue injection keys. This replaced prop-threading of `currentTime` through component trees.

`EffectVolume` reads `currentTime` + `seek` without knowing the context source. Provider hierarchy: `App.vue` provides node-level context; `SequenceEffectsPanel` overrides with player-store context for its subtree.

---

## Two separate worker instances

`effectWorker.ts` and `chunkOrchestrator.ts` each instantiate their own `new EffectWorker()` at module level. They are completely independent — separate threads, separate seqNum maps.

Single-shot path (< 30s) uses `effectWorker`'s instance. Chunked path (>= 30s) uses `chunkOrchestrator`'s instance. This avoids message interleaving between the two protocols.

---

## Fade behavior change

The chunked rewrite changed fade behavior when the buffer is shorter than the fade duration. Old: fade was clamped to buffer length (entire buffer faded). New: fade uses the global fade duration (only partial fade applied if buffer is shorter).

This is correct for chunked processing (a chunk is always shorter than the full buffer) and consistent for single-shot.

---

## Component organization

`src/components/controls/` reorganized from a flat 31-file directory into domain subdirectories: `effects/`, `piano-roll/`, `drum-roll/`, `timeline/`, `audio/`.

`ButtonGroup.vue` stays at top level as a shared UI primitive used by both `DrumNodeView` and `PianoNodeView`.
