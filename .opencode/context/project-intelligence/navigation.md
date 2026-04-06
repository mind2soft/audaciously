<!-- Context: project-intelligence/navigation | Priority: critical | Version: 3.0 | Updated: 2026-04-06 -->

# Project Intelligence — Audaciously

Browser-based DAW (Digital Audio Workstation). Vue 3 + Pinia + Web Audio API. Node-based architecture with AudioBuffer repository. No server.

## Quick Routes

| Need | File |
|------|------|
| Tech stack, patterns, standards | [technical-domain.md](technical-domain.md) |
| Why decisions were made | [decisions-log.md](decisions-log.md) |
| Current state, debt, gotchas | [living-notes.md](living-notes.md) |

## Deep Dives

| File | Description | Priority |
|------|-------------|----------|
| [technical-domain.md](technical-domain.md) | Stack, node architecture, AudioBuffer repository, Pinia stores, per-type composables, DSP/component patterns, naming, standards, security | critical |
| [decisions-log.md](decisions-log.md) | AudioBuffer repository + pristine channels, per-type composables, chunked pipeline, consolidated worker, AbortController, sparse array fix, targetBuffer notification, proxy stripping | high |
| [living-notes.md](living-notes.md) | Known issues, tech debt, gotchas (buffer ID nullable pattern, Vue template ref unwrapping, source buffer immutability), next steps | high |
