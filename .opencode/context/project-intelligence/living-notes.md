<!-- Context: project-intelligence/notes | Priority: high | Version: 2.0 | Updated: 2026-04-06 -->

# Living Notes — Audaciously

> Active issues, technical debt, gotchas, and patterns worth preserving.

**Last Updated**: 2026-04-06

---

## Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Main timeline player doesn't react to targetBuffer changes during playback | Medium | Future work |
| LSP reports false errors in worker files (`'Promise' only refers to a type`) | None | Spurious — `pnpm build` passes |
| LSP false errors about `Promise`, `Set`, `Map` in test files / composables | None | Spurious — `tsc --noEmit` passes |

---

## Technical Debt

| Item | Impact | Priority |
|------|--------|----------|
| `docs/NOTES.md` stale sections (lines 74-81, 92-97) | Misleading documentation — references old two-worker architecture | Low |
| Main player `buildTracksFromStore` captures buffer refs at play() time | No hot-swap for main timeline playback | Medium |
| Timeline components not yet implemented | SegmentBlock, SequencePanel, NodeTree/NodeTreeItem are stubs | Medium |

---

## Gotchas for Maintainers

- **Vue reactive proxies + workers**: Always `JSON.parse(JSON.stringify())` before `postMessage`. Spread is NOT enough for nested objects.
- **Sparse arrays**: `new Array(n)` creates holes. Use `Array.from({ length: n })` when you need `.every()`, `.map()`, etc. to visit all slots.
- **LSP errors in worker/test files**: False positives about `Promise`, `Set`, `Map`, ES5 target. Trust `tsc --noEmit` and `pnpm build`, not the LSP squiggles.
- **Synth worker has per-note cache**: Re-rendering same notes is fast (cache hits). Mixing + limiting always run proportional to track length.
- **AbortController pattern**: ONE controller per regeneration cycle. Abort previous, create new, pass signal. No generation counters.
- **Worker seqNum**: Per-nodeId in the worker only. Lightweight optimization — correctness comes from AbortController on main thread.
- **Buffer ID nullable pattern**: `getBuffer(node.targetBufferId ?? "")?.duration ?? 0` — the `?? ""` safely handles null (empty string won't match any entry).
- **Vue template ref unwrapping**: Composables returning plain objects with `ComputedRef` props do NOT auto-unwrap in templates. Use `.value`.
- **Module-level synth singleton**: `useInstrumentAudioNode.ts` has `const synthClient = createSynthWorkerClient()` at module level — preserved across component mounts.
- **Source buffers are IMMUTABLE**: Nothing should EVER mutate a source buffer. AudioBuffer corruption is a browser bug, not our code.

---

## Patterns Worth Preserving

- **Factory composables** — `useX(nodeId)` returns typed object, never a class
- **Per-type composables** — `useRecordedAudioNode`, `useInstrumentAudioNode`, `useFolderNode` with `pipeline` opt-in
- **AudioBuffer repository** — module-level Map outside reactivity, pristine `Float32Array[]` snapshots
- **DSP modules** — pure functions on `Float32Array[]` + `DspContext`, no Web Audio dependency
- **Listener pattern** — `onTargetBufferChange` returns unsubscribe function, used in `onUnmounted`
- **Provide/inject** — `PlaybackContextKey` / `NodePlaybackContextKey` for cross-tree playback state
- **Co-located tests** — `.test.ts` next to source, not in separate directory

---

## Next Steps

1. Wire main timeline player to react to targetBuffer changes during playback
2. Update `docs/NOTES.md` stale sections
3. Implement timeline components (SegmentBlock, SequencePanel, NodeTree/NodeTreeItem)

---

## 📂 Codebase References

| Context | File |
|---------|------|
| Stale docs | `docs/NOTES.md` (lines 74-81, 92-97) |
| Main player (future work) | `src/features/playback/build-tracks.ts` |
| AudioBuffer repository | `src/lib/audio/audio-buffer-repository.ts` |
| Per-type composables | `src/composables/useRecordedAudioNode.ts`, `useInstrumentAudioNode.ts`, `useFolderNode.ts` |
