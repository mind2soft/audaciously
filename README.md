# Audaciously

> A browser-based audio recorder and editor inspired by [Audacity](https://www.audacityteam.org/) — built entirely with the Web Audio API, Vue 3, and TypeScript.

**[🎙️ Try it live →](https://mind2soft.github.io/audaciously/)**

---

## What is it?

Audaciously is an experiment in how far the modern browser's audio capabilities can take you. It gives you a familiar multi-track DAW-style interface — record from your microphone, layer tracks, cut and rearrange sequences, control volume — all without installing anything, without a server, and without any native audio libraries.

Under the hood everything runs on the raw [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), with waveform rendering offloaded to a Web Worker so the UI stays smooth no matter how large your project gets.

---

## Features

### Recording
- Record from any connected microphone
- Overdub safely: echo cancellation, noise suppression, and auto gain control are **off by default** so playback audio doesn't bleed into your recording
- Live waveform visualisation while recording

### Playback
- Multi-track simultaneous playback
- Play, pause, resume, stop, and seek
- Master volume with up to **3× boost** (300%)
- Real-time output waveform display

### Instrument tracks
- Add note-based instrument tracks alongside recorded audio tracks
- Built-in instruments: piano, drums, and more
- **Piano roll editor** for placing and editing notes with precision

### Editing tools
| Tool | What it does |
|------|--------------|
| **Select** | Click a sequence to select it |
| **Split** | Cut a sequence at any point into two independent clips |
| **Move** | Drag a sequence to reposition it on the timeline |
| **Cut** | Remove a sequence from its track |

### Projects
- **Auto-save** keeps your work safe as you go — no manual save required
- Projects persist across browser sessions via **IndexedDB** (no server, no account)
- **Project browser** — open, rename, and delete saved projects from one place
- **AWP import/export** — share projects as `.awp` (Audaciously Web Project) files
- **Save indicator** shows auto-save status at a glance
- **Storage dashboard** displays IndexedDB usage and available quota

### Export
- Export your mix to **WAV** or **MP3** via a dedicated export dialog

### Settings
- Choose your **input device** (microphone) and **output device** (speakers / headphones)
- Toggle **echo cancellation**, **noise suppression**, and **auto gain control** per session
- Output device changes take effect immediately in supported browsers (Chrome 110+)

### Under the hood
- Waveforms computed as SVG paths in a **Web Worker** — no main-thread blocking
- Custom **stereo balance node** built on top of the Web Audio graph (the API doesn't ship one)
- Zero audio libraries — pure `AudioContext`, `GainNode`, `AnalyserNode`, `AudioBufferSourceNode`, `MediaRecorder`
- Project data stored entirely client-side via **Dexie** (IndexedDB wrapper) — nothing leaves your browser

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | [Vue 3](https://vuejs.org/) — Composition API |
| Language | [TypeScript 5](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) + [DaisyUI 5](https://v5.daisyui.com/) |
| Build | [Vite 6](https://vite.dev/) |
| Persistence | [Dexie](https://dexie.org/) (IndexedDB wrapper) |
| Icons | [Iconify / Material Design Icons](https://icon-sets.iconify.design/mdi/) |
| CI / CD | GitHub Actions → GitHub Pages |
| License | GPL-3.0 |

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+

### Install & run

```bash
# Install dependencies
pnpm install

# Start the dev server (http://localhost:5173)
pnpm dev
```

### Build for production

```bash
# Type-check + bundle
pnpm build

# Preview the production build locally
pnpm preview
```

The output lands in `dist/`. The project is automatically deployed to GitHub Pages on every push to `main` via the workflow in `.github/workflows/static.yml`.

---

## Browser compatibility

Audaciously requires a modern browser with full Web Audio API support.

| Feature | Chrome | Firefox | Safari |
|---------|--------|---------|--------|
| Playback & recording | ✅ | ✅ | ✅ |
| Output device selection | ✅ 110+ | ❌ | ❌ |

> **Tip:** Use headphones when recording with other tracks playing back. This eliminates acoustic feedback and lets you record with audio processing fully disabled for the cleanest overdubs.

---

## Roadmap

Things that are not yet implemented but are planned:

- **Audio filters** — fade in/out, equaliser, normalise, pitch shift, noise reduction
- **Paste operations** — splice, fill, overwrite
- **Scrolling and zooming** improvements on the timeline

---

## License

Audaciously is free software released under the [GNU General Public License v3.0](LICENSE).  
Copyright © 2025 Yanick Rochon
