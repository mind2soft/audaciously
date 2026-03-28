<!-- Context: project-intelligence/notes | Priority: high | Version: 1.0 | Updated: 2026-03-28 -->

# Living Notes — Audaciously

> Active issues, technical debt, gotchas, and patterns worth preserving.

**Last Updated**: 2026-03-28

---

## Uncommitted Work (dev branch)

Large batch of changes on `dev` branch, not yet committed (last commit: `b69bf0d`):

- **>=30s bug fix** — sparse array root cause (`Array.from` fix)
- **Worker consolidation** — `effectWorker.ts` + `chunkOrchestrator.ts` deleted, replaced by `processEffects.ts`
- **AbortController redesign** — 6 files rewritten
- **targetBuffer change notification** — store listener pattern + `useNodePlayback` hot-swap
- **QA fixes** — 8 issues found and fixed (7/8 applied, Fix 7 = decisions-log update now done)
- **Component reorganization** — 19 components moved to subdirectories
- **DSP chunk-aware effects** — fade-in, fade-out, volume with `DspContext.globalOffset`
- **18 chunked end-to-end tests** + existing tests updated

**Status**: 60 tests pass. Build has one issue: unused `onScopeDispose` import in `useAudioPipeline.ts` (imported but call not added to function body).

---

## Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| `useAudioPipeline.ts` imports `onScopeDispose` but doesn't call it | Medium | Fix pending |
| `NOTES.md` lines 74-81, 92-97 reference old two-stage/two-worker architecture | Low | Stale docs |
| Main timeline player doesn't react to targetBuffer changes during playback | Medium | Future work |
| LSP reports false errors in worker files (`'Promise' only refers to a type`) | None | Spurious — `pnpm build` passes |

---

## Technical Debt

| Item | Impact | Priority |
|------|--------|----------|
| `docs/NOTES.md` stale sections | Misleading documentation | Low |
| Main player `buildTracksFromStore` captures buffer refs at play() time, never updates | No hot-swap for main timeline playback | Medium |
| `useAudioPipeline.ts` missing `onScopeDispose` call | AbortController not cleaned up on scope dispose | Medium |

---

## Gotchas for Maintainers

- **Vue reactive proxies + workers**: Always `JSON.parse(JSON.stringify())` before `postMessage`. Spread is NOT enough for nested objects.
- **Sparse arrays**: `new Array(n)` creates holes. Use `Array.from({ length: n })` when you need `.every()`, `.map()`, etc. to visit all slots.
- **LSP errors in worker files**: False positives. The project targets modern ES. Trust `pnpm build`, not the LSP squiggles.
- **Synth worker has per-note cache**: Re-rendering same notes is fast (cache hits). Mixing + limiting always run proportional to track length.
- **AbortController pattern**: ONE controller per regeneration cycle. Abort previous, create new, pass signal. No generation counters.
- **Worker seqNum**: Per-nodeId in the worker only. Lightweight optimization — correctness comes from AbortController on main thread.

---

## Patterns Worth Preserving

- **Factory composables** — `useX()` returns typed object, never a class
- **DSP modules** — pure functions on `Float32Array[]` + `DspContext`, no Web Audio dependency
- **Listener pattern** — `onTargetBufferChange` returns unsubscribe function, used in `onUnmounted`
- **Provide/inject** — `PlaybackContextKey` / `NodePlaybackContextKey` for cross-tree playback state
- **Co-located tests** — `.test.ts` next to source, not in separate directory

---

## Next Steps

1. Fix `useAudioPipeline.ts` — add `onScopeDispose(() => controller?.abort())` call
2. Update `docs/NOTES.md` stale sections
3. Reverify: `pnpm vitest run` + `pnpm build`
4. User validates → commit
5. Wire main timeline player to react to targetBuffer changes during playback

---

## 📂 Codebase References

| Context | File |
|---------|------|
| Uncommitted pipeline changes | `src/lib/audio/processEffects.ts` |
| Stale docs | `docs/NOTES.md` (lines 74-81, 92-97) |
| Missing cleanup | `src/composables/useAudioPipeline.ts` |
| Main player (future work) | `src/features/playback/build-tracks.ts` |
