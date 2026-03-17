# Contributing to Audaciously

Thanks for wanting to contribute. Audaciously is a browser-based DAW experiment — intentionally rough, intentionally lean, intentionally pushing the Web Audio API to see where it gives out. Contributions that share that spirit are welcome.

---

## Before you start

A few things that are **out of scope by design** — please don't propose or open PRs for:

| Not happening | Why |
|---|---|
| Server-side anything | The whole point is that nothing leaves your browser |
| User accounts / cloud sync | Same reason |
| A plugin system | Out of scope for this experiment |
| Audio library wrappers (Tone.js, Howler, etc.) | Raw Web Audio is intentional — failure modes should be visible |

If you're not sure whether something fits, open a [Discussion](https://github.com/mind2soft/audaciously/discussions) first.

---

## Setup

**Requirements:** Node.js 20+, pnpm 10+

```bash
git clone https://github.com/mind2soft/audaciously.git
cd audaciously
pnpm install      # also installs the Husky pre-commit hook
pnpm dev          # dev server at http://localhost:5173
```

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Type-check (`vue-tsc`) + bundle (`vite build`) |
| `pnpm preview` | Preview the production build locally |
| `pnpm format` | Auto-format all files with Biome (runs automatically on commit) |
| `pnpm lint` | Lint with Biome |

> **pnpm only.** npm and yarn are not supported — the lockfile is pnpm-specific.

---

## Architecture

Understanding the shape of the codebase will save you time.

### No classes — factory functions

Audaciously uses factory functions instead of classes throughout. If you're adding a new audio primitive, effect, or data structure, follow that pattern.

```ts
// ✅ Do this
export function createVolumeEffect(params: VolumeEffectParams): VolumeEffect {
  // ...
}

// ❌ Not this
export class VolumeEffect {
  constructor(params: VolumeEffectParams) { ... }
}
```

### Audio goes through the raw Web Audio API

No wrappers. Use `AudioContext`, `GainNode`, `AnalyserNode`, `AudioBufferSourceNode`, etc. directly. If the API doesn't have what you need, build it the same way the custom stereo balance node was built — split, cross, wire.

### CPU-heavy work belongs in a Worker

Anything that blocks the main thread (sample analysis, waveform path computation, encoding) goes in a dedicated Web Worker. See `src/workers/` for existing examples.

### Persistence is IndexedDB via Dexie

All project data is auto-saved to IndexedDB. There is no manual save. If you're storing new data, it goes through Dexie. See `src/lib/storage/` for the schema.

### Node tree, not flat tracks

Sequences live in a node tree: folder nodes aggregate, instrument nodes generate, recorded nodes play back. New instrument types should fit into this architecture rather than working around it.

---

## Code conventions

The project uses **Biome** for both formatting and linting (no ESLint, no Prettier). The pre-commit hook runs `pnpm format` automatically — you don't need to think about it.

- **TypeScript strict mode** — no `any`, no `@ts-ignore` without a comment explaining why
- **`<script setup>` Composition API** — all Vue components use this style
- **Imperative mood in comments** — explain *why*, not *what*
- **`// HACK:` / `// TODO:`** for anything that needs a follow-up

---

## Workflow

### Branching

```
feature/issue-NUMBER-short-description
fix/issue-NUMBER-short-description
```

### Commit messages

Follow the conventional commit format with emoji used throughout this repo:

```
✨ feat: add compressor effect to the per-node effects chain
🐛 fix: resolve silent MP3 export when project has no recorded nodes
♻️ refactor: simplify AudioTrack generic constraints
🔧 chore: update Biome to 2.5.0
```

The pre-commit hook formats your staged files automatically. Just commit — Biome handles the rest.

### Pull requests

- Keep PRs focused. One concern per PR is easier to review and easier to revert if something goes wrong.
- `pnpm build` must pass — no new type errors.
- Fill in the PR template. The "Notes for Reviewers" section is especially useful for non-obvious decisions.
- Link the relevant issue with `Closes #NNN` or `Fixes #NNN` so it auto-closes on merge.

---

## What to work on

The [roadmap](docs/roadmap.md) lists known areas:

- **Audio filters** — equaliser, normalise, pitch shift, noise reduction
- **Paste modes** — splice, fill, overwrite (design notes in [docs/NOTES.md](docs/NOTES.md))
- **Timeline improvements** — zoom, snapping, scrolling
- **More instruments** — the node architecture is ready

Open issues labelled [`good first issue`](https://github.com/mind2soft/audaciously/labels/good%20first%20issue) are a good starting point if you're new to the codebase.

---

## Reporting bugs

Use the [Bug Report](https://github.com/mind2soft/audaciously/issues/new?template=bug_report.yml) issue template. The more reproduction detail you include, the faster it gets fixed.

---

## License

By contributing, you agree that your work will be released under the [GNU General Public License v3.0](LICENSE) — the same license as the project.
