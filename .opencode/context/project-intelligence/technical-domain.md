<!-- Context: project-intelligence/technical | Priority: critical | Version: 1.0 | Updated: 2026-02-28 -->

# Technical Domain — Audaciously

**Purpose**: Tech stack, architecture, and development patterns for this browser-based DAW.
**Last Updated**: 2026-02-28

## Quick Reference
**Update Triggers**: New lib added | Pattern changes | Worker protocol changes | Audio API changes
**Audience**: Developers, AI agents

---

## Primary Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Vue 3 (`<script setup>`) | ^3.5 |
| Language | TypeScript (strict) | ^5.9 |
| Build | Vite | ^6.4 |
| Styling | Tailwind v4 + DaisyUI 5 | ^4.2 / 5.0-beta |
| Audio | Web Audio API (browser-native) | — |
| Workers | Vite `?worker` Web Workers | — |
| IDs | nanoid | ^5.1 |

---

## Core Architecture Pattern

All stateful objects use **factory functions** (not classes). Private state lives in a closure. Events use `createEmitter`.

```ts
// ✅ Correct pattern — createX() returning an interface
export interface AudioTrack extends Emitter<AudioTrackEventMap> {
  readonly id: string;
  volume: number;
  play(context: AudioContext, options?: AudioTrackPlayOptions): Promise<void>;
  stop(): void;
}

export const createAudioTrack = (name: string): AudioTrack => {
  const internal: AudioTrackInternal = { id: nanoid(), volume: 1, ... };
  const { dispatchEvent, ...emitter } = createEmitter<AudioTrackEventMap>(
    (event) => { event.track = track; return event; }
  );
  const track: AudioTrack = {
    get id() { return internal.id; },
    set volume(v) { internal.volume = v; dispatchEvent({ type: "change" }); },
    ...emitter,
  };
  return track;
};
```

---

## Vue Component Pattern

`<script setup>` SFCs. Props typed with `defineProps<{}>()`. Dependencies via `inject`.

```vue
<script setup lang="ts">
import { computed, inject } from "vue";
import type { Ref } from "vue";
import { playerKey } from "../lib/provider-keys";
import type { AudioPlayer } from "../lib/audio/player";

const props = defineProps<{ track: AudioTrack; isSelected: boolean }>();
const emit = defineEmits<{ select: [AudioTrack | null] }>();

const player = inject<AudioPlayer>(playerKey);
const duration = computed(() => props.track.duration);
</script>
```

---

## Web Worker Pattern

Workers live in `src/workers/`, use `?worker` Vite suffix, pure DSP only (no Web Audio API in workers).

```ts
// Main thread: synthWorker.ts
import SynthWorker from "../../workers/synth-processor?worker";
const worker = new SynthWorker(); // one shared instance

// Worker → main: typed request/response + seqNum cancellation
export interface SynthRequest { trackId: string; seqNum: number; ... }
export interface SynthResponse { trackId: string; seqNum: number; left: Float32Array; right: Float32Array; }

// Transfer result zero-copy
self.postMessage(response, [response.left.buffer, response.right.buffer]);
```

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `instrument-track.ts`, `AudioPlayer.vue` |
| Vue components | PascalCase | `TrackSidebar.vue`, `AudioSequence.vue` |
| Factories | `createX()` | `createAudioTrack()`, `createPlayer()` |
| Interfaces | PascalCase noun | `AudioTrack`, `InstrumentTrack` |
| Internal state | `XInternal` interface | `AudioTrackInternal` |
| Provider keys | `xKey` symbol | `playerKey`, `timelineKey` |
| Workers | `x-processor.ts` | `synth-processor.ts` |

---

## Code Standards

- TypeScript strict + `noUnusedLocals` + `noUnusedParameters` (enforced by build)
- `src/workers/` excluded from `tsconfig.app.json` (separate `tsconfig.worker.json`)
- Workers: pure math only — no `AudioContext`, `GainNode`, etc.
- Hidden `AudioTrack`s (instrument playback) **never** passed to `player.addTrack()` — avoids spurious UI rows
- `player.setExtraDuration()` used to register external duration contributors
- Composables (`useX`) use `watchEffect` + `onUnmounted` cleanup pattern
- `nanoid()` for all stable IDs (tracks, sequences, notes)
- Transferable `Float32Array` buffers for zero-copy worker results

---

## Security / Constraints

- Pure browser app — no server, no user-generated HTML, no eval
- Worker isolation: synth DSP runs in worker, never touches DOM
- No external network requests at runtime
- Audio output routed through master `GainNode` → `AnalyserNode` → `destination`

---

## 📂 Codebase References

| Pattern | File |
|---------|------|
| Factory + emitter pattern | `src/lib/audio/track.ts`, `src/lib/audio/player.ts` |
| Emitter implementation | `src/lib/emitter.ts` |
| Sequence protocol | `src/lib/audio/sequence/AudioBufferSequence.ts` |
| Worker protocol | `src/workers/synth-processor.ts` |
| Worker client | `src/lib/music/synthWorker.ts` |
| Composable pattern | `src/lib/music/useInstrumentPlayback.ts` |
| Provider keys | `src/lib/provider-keys.ts` |
| Vue component example | `src/components/TrackSidebar.vue` |
| Build config | `tsconfig.app.json`, `vite.config.ts` |
