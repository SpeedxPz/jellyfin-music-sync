---
phase: 4
slug: ui-feedback
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.1.0 |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run typecheck` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green + manual smoke of SyncScreen, SyncSummaryScreen, notification, and packaging
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| syncStore state transitions | 01 | 0 | PROG-01, PROG-02, POST-01 | — | N/A | unit | `npm test -- tests/store/syncStore.test.ts` | ❌ W0 | ⬜ pending |
| shell:openPath handler | 01 | 0 | POST-03 | — | Rejects empty path; only opens user-chosen destination | unit | `npm test -- tests/ipc/shell.test.ts` | ❌ W0 | ⬜ pending |
| preload on() cleanup | 01 | 1 | PROG-01 | — | N/A | unit | `npm test && npm run typecheck` | ✅ existing infra | ⬜ pending |
| App.tsx 3-state router | 02 | 1 | PROG-01 | — | N/A | typecheck | `npm run typecheck` | ✅ existing | ⬜ pending |
| SyncScreen progress display | 02 | 1 | PROG-01 | — | N/A | manual | Launch app, start sync, observe live progress bars | manual-only | ⬜ pending |
| SyncScreen cancel | 02 | 1 | PROG-02 | — | N/A | manual | Start sync, click Stop Sync, observe "Sync Canceled" summary | manual-only | ⬜ pending |
| SyncSummaryScreen display | 03 | 2 | POST-01, POST-02 | — | N/A | manual | Complete a sync, verify count rows and failures section | manual-only | ⬜ pending |
| Open destination folder | 03 | 2 | POST-03 | — | Empty path disables button | unit + manual | `npm test -- tests/ipc/shell.test.ts` | ❌ W0 | ⬜ pending |
| Desktop notification | 03 | 2 | POST-04 | — | No notification on cancel | manual | Complete sync → observe OS notification; cancel sync → no notification | manual-only | ⬜ pending |
| Downloads control | 04 | 2 | SET-02 | — | N/A | manual | Adjust Downloads value in header, verify passed to sync | manual-only | ⬜ pending |
| Packaging (NSIS/AppImage) | 05 | 3 | (success criteria 5) | — | N/A | manual | `npm run build:win` / `npm run build:linux`, verify installer | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/store/syncStore.test.ts` — stubs for syncStore state transitions (PROG-01, PROG-02, POST-01)
- [ ] `tests/ipc/shell.test.ts` — stubs for shell:openPath handler (POST-03)

*Existing `tests/lib/` infrastructure covers Phase 3 sync engine; no shared fixture changes needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live progress bars update during sync | PROG-01 | Requires live Electron + IPC event stream | Launch app, pick destination, start sync, observe overall and per-file bars updating in real time |
| Cancel stops downloads cleanly | PROG-02 | Requires live Electron + AbortController | Start sync, click Stop Sync, verify "Sync Canceled" summary appears; verify no .part files remain in destination |
| Summary counts are correct | POST-01 | Requires real sync run | Complete sync, compare shown counts (added/removed/unchanged/failed) against destination folder state |
| Failures list is expandable | POST-02 | UI interaction | If failures exist, click "show details ▾" and verify list expands; click again to collapse |
| Desktop notification fires on complete (not on cancel) | POST-04 | OS notification service required | (1) Complete sync → OS notification appears with correct body; (2) Cancel sync → no notification |
| Open destination folder | POST-03 | Requires OS file explorer | Click "Open destination folder" → OS file explorer opens at destination path |
| Downloads control reads/writes setting | SET-02 | Requires live Electron settings IPC | Adjust Downloads control, close and reopen app, verify value persists |
| Packaged NSIS installer installs and launches | success criteria 5 | Requires Windows + installer run | Run `npm run build:win`, install with NSIS installer, launch app, verify all screens function |
| Packaged AppImage runs on Linux | success criteria 5 | Requires Linux runtime | Run `npm run build:linux`, execute AppImage, verify all screens function |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
