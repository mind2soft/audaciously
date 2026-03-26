# Roadmap

Audaciously is v0.1.0 — a working experiment, not a finished tool.
The directions below are being actively explored, not promised. This list is not in priority order — and some of these may never get implemented.

---

## Editing

**Undo / Redo** — a full command history stack. Currently absent; destructive operations (Cut, Overwrite) have no recovery path.

**Keyboard shortcuts** — Space to play/stop, R to record, tool switching by key. Standard DAW expectation, currently missing entirely.

**Paste modes** — the current paste always shifts notes right. Three additional modes are designed for both the Piano Roll and Sequence Panel:

| Mode      | Behaviour                                                     |
| --------- | ------------------------------------------------------------- |
| Splice    | Insert and shift the current track right (current, default)   |
| Fill      | Place only into silences; skip anything already there         |
| Overwrite | Drop in place, truncating or replacing whatever is underneath |

---

## Recording

**Loop recording / Punch-in** — record only over a selected region without disturbing the rest of the track. Essential for fixing mistakes without re-recording entire takes.

**Latency compensation** — account for output→input round-trip delay when overdubbing with playback monitoring.

---

## Tempo & Timeline

**BPM / tempo system** — the timeline is currently sample-accurate but has no concept of beats or bars. A BPM grid unlocks quantisation, snap-to-beat, and makes the composition easier.

**Timeline improvements** — snapping controls, markers.

---

## Audio Processing

Per-node effects being designed:

- **Compressor / limiter** — control dynamic range
- **Equaliser** — per-node frequency shaping
- **Reverb / delay** — time-based spatial effects
- **Normalise** — peak or RMS normalisation of recorded audio
- **Pitch shift** — time-independent pitch adjustment
- **Speed** — change playback speed without affecting pitch
- **Noise reduction** — subtract a noise profile from a recorded node
- **Echo / voice effects** — and other creative processing

---

## Automation

**Automation lanes** — the volume keyframe system exists internally but isn't surfaced as a first-class concept. Automation lanes for volume, balance, and effect parameters over time is the natural next step as the effects chain grows.

---

## Import / Export

**Audio file import** — load `.wav` / `.mp3` / `.ogg` files directly into recorded nodes. `AudioBuffer` decoding is already in place for export; reading it back is the natural counterpart.

**MIDI import** — parse `.mid` files into piano roll notes. No MIDI device needed — MIDI files are binary data the browser can read without external libraries.

**Stem export** — export individual tracks rather than only the full mix. The `OfflineAudioContext` rendering pipeline is already there; per-track routing is the missing piece.

---

## Collaboration

**Peer-to-peer collaborative editing** — real-time multi-user sessions using WebRTC DataChannels. Project state changes (node edits, sequence moves, piano roll notes) would sync directly between peers with no server in the data path — consistent with the no-backend constraint.

A signalling step is required to establish the initial WebRTC connection, but once peers are connected all communication is browser-to-browser. The main challenges are conflict resolution (concurrent edits to the same node), latency compensation, and keeping the shared state consistent across the Pinia store.

---

## Instruments

**Sample-based instrument** — a node type that maps audio files to piano keys using pitch-shifted `AudioBufferSourceNode` playback. Complements the existing piano and drum instruments with no external library required.

Additional synth types are planned. What gets built depends on what is interesting to implement and what the Web Audio API can sustain without reaching for a wrapper.

---

## Tracks and Sequences

Complete overhaul of the track/sequence model:

- A **track** contains **sequences**
- A **sequence** plays an audio **node**, either in full or in part

---

## Audio Nodes

Currently: **recorded** and **instrument**. Adding:

- **Project node** — plays a referenced project's rendered audio
  (`source` = project ID, `target` = rendered audio buffer)
- **URL node** — dynamically loads audio from a URL
  (`source` = URL, `target` = decoded audio buffer)

---

## Low-Level / Platform

**AudioWorklet DSP** — custom audio processing on the audio thread, enabling sample-level operations (noise gates, custom compressors, distortion) that `ScriptProcessorNode` could never do efficiently.

**WebAssembly** — for heavier processing tasks where JS throughput is the bottleneck (e.g. noise reduction, pitch shifting algorithms).

**Browser compatibility** — Firefox and Safari have partial support today, primarily around output device selection. Gaps will close as browser APIs mature; known limitations are tracked in the [user guide](docs/user-guide.md).

---

## Agent-Assisted Features

Opt-in agent workflows layered on top of existing node and sequence primitives. No server required — processing targets the browser or a locally-running model where possible.

**Instrument node assist** — an agent that helps configure a new instrument node by suggesting sample mappings, velocity layers, and playback parameters based on the role the node is intended to fill (e.g. lead, pad, bass, percussion). The agent works from the existing node model and does not require external plugin support.

**Recorded audio enhancement assist** — an agent-guided workflow for improving a recorded node's audio quality. Covers denoising (using a captured noise profile), normalisation, EQ curve suggestions, and gain staging recommendations. Surfaced contextually per node rather than requiring manual effect chain assembly.

**Audio tracks voice alignment on sequence** — agent-assisted timing alignment of a vocal or melodic recorded node against a reference track on the sequence. Detects drift and micro-timing mismatches, then proposes or applies offset corrections at the sequence level — no manual warp markers needed.

---

## Not planned

- A server or backend of any kind
- User accounts or cloud sync
- A plugin system (VST / AU / LV2 / etc.)

The constraint of running entirely in the browser is intentional, not a temporary limitation.
