---
phase: 04-ui-feedback
plan: "02"
subsystem: ui

tags: [zustand, react, store, router, sync, typescript, vitest]

requires:
  - phase: 04-ui-feedback
    plan: "00"
    provides: Wave 0 test stubs for syncStore — replaced with real tests in this plan
  - phase: 04-ui-feedback
    plan: "01"
    provides: SyncSummary with destination field; on() cleanup return type; IPC contracts syncStore depends on

provides:
  - Zustand syncStore with SyncPhase type and 5 actions (PROG-01, PROG-02, POST-01)
  - App.tsx 3-state router dispatching to SyncScreen/SyncSummaryScreen/PlaylistBrowserScreen (D-SCREEN, D-ROUTER)
  - SyncScreen.tsx and SyncSummaryScreen.tsx stub files (full impl in 04-03)
  - 6 passing syncStore unit tests replacing Wave 0 it.todo() stubs

affects: [04-03, 04-04]

tech-stack:
  added: []
  patterns:
    - "syncStore pattern: Zustand create<SyncState>() following authStore.ts exact structure"
    - "3-state router: if (!authenticated) → if (syncPhase==='syncing') → if (syncPhase==='summary') → fallback"
    - "TDD RED→GREEN: write failing tests first (module-not-found error), commit test, then implement"

key-files:
  created:
    - src/renderer/src/store/syncStore.ts
    - src/renderer/src/screens/SyncScreen.tsx
    - src/renderer/src/screens/SyncSummaryScreen.tsx
  modified:
    - src/renderer/src/App.tsx
    - tests/store/syncStore.test.ts

key-decisions:
  - "04-02: destination preserved across reset() — reset() clears phase/canceled/progress/summary but not destination, so summary screen can still reference last sync path"
  - "04-02: Stub screens created in 04-02 to keep typecheck passing — SyncScreen and SyncSummaryScreen are minimal div wrappers replaced wholesale in 04-03"

requirements-completed: [PROG-01, PROG-02, POST-01]

duration: 2min
completed: 2026-04-21
---

# Phase 4 Plan 02: syncStore + App.tsx 3-state Router Summary

**Zustand syncStore with SyncPhase='idle'|'syncing'|'summary' and 5 actions wired to App.tsx 3-state router; 6 unit tests replace Wave 0 it.todo() stubs**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T20:04:49Z
- **Completed:** 2026-04-21T20:06:46Z
- **Tasks:** 2 (Task 1 is TDD with 2 commits: test + feat)
- **Files modified:** 5

## Accomplishments

- Created `src/renderer/src/store/syncStore.ts` following the authStore.ts Zustand pattern: exports `useSyncStore` and `SyncPhase` type, 5 actions (startSync, updateProgress, setSummary, cancel, reset)
- Replaced all 6 `it.todo()` stubs in `tests/store/syncStore.test.ts` with real passing assertions covering all state transitions
- Extended `src/renderer/src/App.tsx` from a single ternary to a 4-branch router keyed on `authenticated` + `syncPhase`
- Created `SyncScreen.tsx` and `SyncSummaryScreen.tsx` minimal stubs so typecheck passes before 04-03 fills them
- Full test suite: 55 passing, 4 todo (ipc/shell Wave 0); typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing syncStore tests** — `3de63c4` (test)
2. **Task 1 GREEN: Implement syncStore** — `8ce0e74` (feat)
3. **Task 2: Extend App.tsx to 3-state router + stub screens** — `dc3ee94` (feat)

## Files Created/Modified

- `src/renderer/src/store/syncStore.ts` — Zustand store; exports `useSyncStore`, `SyncPhase` type; 5 actions
- `tests/store/syncStore.test.ts` — 6 real unit tests replacing Wave 0 it.todo() stubs
- `src/renderer/src/App.tsx` — 3-state router: login → syncing → summary → playlists
- `src/renderer/src/screens/SyncScreen.tsx` — minimal stub (div wrapper); replaced in 04-03
- `src/renderer/src/screens/SyncSummaryScreen.tsx` — minimal stub (div wrapper); replaced in 04-03

## Decisions Made

- `destination` is preserved across `reset()` — the store resets phase/canceled/progress/summary but keeps `destination` so a future summary display can show where the last sync went. This matches the plan spec ("destination is NOT reset").
- Stub screen files created in this plan (not 04-03) because App.tsx imports them — without them typecheck fails. The stubs are explicit about their intent via `// stub — full implementation in plan 04-03` comments.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `SyncScreen` renders empty div | `src/renderer/src/screens/SyncScreen.tsx` | Full UI implemented in plan 04-03 |
| `SyncSummaryScreen` renders empty div | `src/renderer/src/screens/SyncSummaryScreen.tsx` | Full UI implemented in plan 04-03 |

These stubs are intentional per the plan design. They do not prevent this plan's goal (syncStore + router) from being achieved.

## Threat Flags

None — syncStore is renderer-only Zustand state with no I/O or trust boundaries (confirmed by plan threat model).

## Next Phase Readiness

- 04-03 can import `useSyncStore` and all 5 actions from `syncStore.ts` immediately
- 04-03 can replace `SyncScreen.tsx` and `SyncSummaryScreen.tsx` with full implementations; App.tsx routing is already live
- All IPC contracts (from 04-01) and store state (from this plan) are ready; 04-03 only needs to wire up UI components

---

## Self-Check: PASSED

- `src/renderer/src/store/syncStore.ts` exists — FOUND
- `src/renderer/src/store/syncStore.ts` exports `useSyncStore` — VERIFIED (line 22)
- `src/renderer/src/store/syncStore.ts` contains `SyncPhase` type — VERIFIED (line 7)
- `tests/store/syncStore.test.ts` has 6 real `it(` entries (no `it.todo`) — VERIFIED
- `src/renderer/src/screens/SyncScreen.tsx` exists — FOUND
- `src/renderer/src/screens/SyncSummaryScreen.tsx` exists — FOUND
- `src/renderer/src/App.tsx` contains `useSyncStore` — VERIFIED (lines 10, 18)
- `src/renderer/src/App.tsx` contains `syncPhase === 'syncing'` — VERIFIED (line 42)
- Commit `3de63c4` (RED) — FOUND
- Commit `8ce0e74` (GREEN) — FOUND
- Commit `dc3ee94` (Task 2) — FOUND
- `npm test` exits 0 with 55 passing — VERIFIED
- `npm run typecheck` exits 0 — VERIFIED

---
*Phase: 04-ui-feedback*
*Completed: 2026-04-21*
