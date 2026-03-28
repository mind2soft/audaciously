# Audaciously

> What happens when you build a DAW entirely inside the browser — no server, no plugins, no native libs — and see how far the Web Audio API will bend before it breaks?

**[🎙️ Open the live demo →](https://mind2soft.github.io/audaciously/)**

_v0.1.0 — intentionally rough. Audaciously experimental._

---

## Wait, the browser can do THAT?

Multi-track recording. A piano roll. A node-based instrument tree. WAV and MP3 export. Project files that compress and travel as a single `.awp` bundle. Stereo balance — including a custom `AudioNode` the Web Audio API forgot to ship.

All of it runs in your tab. Nothing leaves your browser. No account. No install. Just the raw Web Audio API, pushed to see where it gives out.

This is **Audaciously** — an Audacity-inspired DAW experiment built on Vue 3, TypeScript, and the browser's own audio primitives.

---

## Features

### 🎙️ Recording

- Record from any connected microphone
- Echo cancellation, noise suppression, and AGC are **off by default** — clean overdubs, no bleed
- Live waveform visualisation while recording

### ▶️ Playback

- Multi-track simultaneous playback
- Master volume with up to **3× boost** (300%)
- Real-time output waveform display

### 🎹 Node-based instrument system

Notes aren't organised in a flat track list — they live in a **node tree**: folder nodes, instrument nodes, recorded nodes. It scales better, and it's architecturally more interesting.

- Built-in instruments: **piano** and **drums**
- Full **piano roll editor** with five dedicated tools:

| Tool      | What it does                                                                   |
| --------- | ------------------------------------------------------------------------------ |
| **Place** | Draw notes directly onto the grid; click existing notes to erase               |
| **Pan**   | Drag every note after a beat boundary in time (snaps to longest note duration) |
| **Copy**  | Drag-select a range, copy it to the internal clipboard                         |
| **Cut**   | Drag-select a range, remove notes and close the resulting gap                  |
| **Paste** | Insert clipboard notes at the cursor, pushing existing notes right             |

- Internal clipboard backed by `localStorage` — paste across tabs
- Piano roll zoom control

### ✂️ Timeline editing

| Tool       | What it does                                           |
| ---------- | ------------------------------------------------------ |
| **Select** | Click a sequence to select it                          |
| **Split**  | Cut a sequence at any point into two independent clips |
| **Move**   | Drag a sequence to any position on the timeline        |
| **Cut**    | Remove a sequence from its track                       |

### 🎚️ Per-node effects chain

Every node in the tree can carry: **Gain**, **Balance**, **Fade In**, **Fade Out**, **Volume Automation**, **Split**.

### 💾 Projects

- **Auto-save** to IndexedDB as you work — no manual save, no lost sessions
- Project browser to open, rename, and delete saved projects
- **AWP import/export** — portable `.awp` project bundles (fflate-compressed)
- Storage dashboard showing IndexedDB quota and usage

### 📤 Export

- **WAV** and **MP3** export via offline Web Audio rendering

### ⚙️ Settings

- Choose input (microphone) and output (speakers/headphones) devices
- Toggle echo cancellation, noise suppression, auto gain control
- Output device switching takes effect immediately (Chrome 110+)

---

## How it works (under the hood)

The interesting parts — the things that required working around the Web Audio API rather than with it:

**Custom stereo balance node** — The Web Audio API has no built-in balance/pan node that works on stereo sources the way you'd expect. Audaciously implements its own by splitting audio into two `GainNode`s and crossing the levels. It's wired directly into the audio graph like any other native node.

**SVG waveforms in a Web Worker** — Waveform paths are computed as SVG `d` strings inside a dedicated worker thread. The main thread never touches the raw sample data. No matter how large your project, the UI doesn't block.

**Zero audio libraries** — Every audio operation goes through the raw browser API: `AudioContext`, `GainNode`, `AnalyserNode`, `AudioBufferSourceNode`, `MediaRecorder`. No wrappers. This makes the code more verbose and the failure modes more visible — which is the point.

**Node tree architecture** — Rather than a flat list of tracks, sequences are organised in a tree. Folder nodes aggregate, instrument nodes generate, recorded nodes play back. This maps more closely to how complex arrangements actually grow.

**Client-side persistence** — All project data lives in IndexedDB via Dexie. Project files exported as `.awp` are fflate-compressed bundles. Nothing ever touches a server.

**MP3 encoding in-browser** — Export to MP3 runs via lamejs, entirely client-side, after an offline AudioContext renders the full mix.

**Effect pipeline in Web Workers** — Effects are processed as pure DSP functions on `Float32Array` data inside Web Workers — no Web Audio API dependency in the DSP layer. For long audio (≥ 30 s), a chunked pipeline splits processing into 10-second segments, keeping memory bounded at ~50 MB regardless of total duration. Short audio (< 30 s) takes a faster single-shot path.

---

## Tech stack

| Layer        | Technology                                                                        |
| ------------ | --------------------------------------------------------------------------------- |
| Framework    | [Vue 3](https://vuejs.org/) — `<script setup>` Composition API                    |
| Language     | [TypeScript 5](https://www.typescriptlang.org/) (strict)                          |
| Styling      | [Tailwind CSS 4](https://tailwindcss.com/) + [DaisyUI 5](https://v5.daisyui.com/) |
| Build        | [Vite 6](https://vite.dev/)                                                       |
| State        | [Pinia](https://pinia.vuejs.org/)                                                 |
| Persistence  | [Dexie](https://dexie.org/) (IndexedDB wrapper)                                   |
| Audio        | Web Audio API — zero libraries                                                    |
| MP3 encoding | [lamejs](https://github.com/zhuker/lamejs)                                        |
| Compression  | [fflate](https://github.com/101arrowz/fflate)                                     |
| Icons        | [Iconify / MDI](https://icon-sets.iconify.design/mdi/)                            |
| CI / CD      | GitHub Actions → GitHub Pages                                                     |
| License      | GPL-3.0                                                                           |

---

## Getting started

**Requirements:** Node.js 20+, pnpm 10+

```bash
pnpm install

pnpm dev      # dev server at http://localhost:5173
pnpm build    # type-check + bundle → dist/
pnpm preview  # preview the production build locally
pnpm test     # run test suite (59 tests: DSP pipeline, volume automation, chunked processing)
```

The project deploys automatically to GitHub Pages on every push to `main` via `.github/workflows/static.yml`.

---

## Browser compatibility

| Feature                 | Chrome  | Firefox | Safari |
| ----------------------- | ------- | ------- | ------ |
| Playback & recording    | ✅      | ✅      | ✅     |
| Full feature set        | ✅      | ✅      | ✅     |
| Output device selection | ✅ 110+ | ❌      | ❌     |

> **Recording tip:** Use headphones when overdubbing with playback. With audio processing off by default, acoustic feedback is the only enemy.

---

## Contributing / Experimenting

Fork it. Break it. See what the browser does when you push it.

The architecture is intentionally lean — factory functions over classes, raw Web Audio over library abstractions, workers for anything CPU-heavy. If you want to add an instrument, an effect node, or an entirely different audio primitive, there's room.

```bash
# Start here
pnpm dev
```

Report bugs, propose ideas, or open a PR. This is v0.1.1 — there's a lot of road ahead.

---

## License

Audaciously is free software released under the [GNU General Public License v3.0](LICENSE).  
Copyright © 2025 Yanick Rochon
