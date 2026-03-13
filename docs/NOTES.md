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
