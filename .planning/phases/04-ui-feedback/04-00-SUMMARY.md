---
phase: 04-ui-feedback
plan: "00"
subsystem: testing

tags: [vitest, zustand, syncStore, ipc, shell, wave0, tdd-stubs]

requires:
  - phase: 03-sync-engine
    provides: SyncProgress and SyncSummary types in shared/ipc-types.ts; 49 passing tests as baseline

provides:
  - Wave 0 test stubs for useSyncStore state transitions (PROG-01, PROG-02, POST-01)
  - Wave 0 test stubs for shell:openPath IPC handler (POST-03)
  - Red/green test targets for Wave 1a (shell.ts) and Wave 1b (syncStore.ts)

affects: [04-01, 04-02, 04-03, 04-04]

tech-stack:
  added: []
  patterns:
    - "it.todo() stubs: use it.todo() for Wave 0 test contracts when production files do not yet exist — todos are not failures in Vitest"
    - "Test directory layout: tests/store/ for renderer store tests, tests/ipc/ for main-process IPC handler tests"

key-files:
  created:
    - tests/store/syncStore.test.ts
    - tests/ipc/shell.test.ts
  modified: []

key-decisions:
  - "04-00: it.todo() chosen over it.skip() for Wave 0 stubs — todos appear in Vitest output as named contracts, providing clearer intent to subsequent executors"
  - "04-00: tests/ipc/ directory created alongside tests/store/ — IPC handler tests are structurally separate from lib unit tests"

patterns-established:
  - "Wave 0 stub pattern: file header comment identifies production target path and run command; all cases use it.todo() with behavior description as the todo string"

requirements-completed: [PROG-01, PROG-02, POST-01, POST-03]

duration: 2min
completed: 2026-04-22
---

# Phase 4 Plan 00: Wave 0 Test Stubs Summary

**Vitest it.todo() contracts for useSyncStore state transitions and shell:openPath IPC handler — red/green targets for Wave 1a and Wave 1b before any production code exists**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-22T02:56:37Z
- **Completed:** 2026-04-22T02:57:40Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `tests/store/syncStore.test.ts` with 6 `it.todo()` stubs covering all SyncState transitions (initial state, startSync, updateProgress, setSummary, cancel, reset)
- Created `tests/ipc/shell.test.ts` with 4 `it.todo()` stubs covering registerShellHandlers and shell:openPath behavior (valid path, empty string guard, error rejection)
- All 49 existing tests remain green; full suite exits 0 with 10 todos shown (not failures)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tests/store/syncStore.test.ts stubs** - `acc7483` (test)
2. **Task 2: Create tests/ipc/shell.test.ts stubs** - `3fdcca1` (test)

**Plan metadata:** *(final docs commit below)*

## Files Created/Modified

- `tests/store/syncStore.test.ts` - 6 it.todo() stubs for useSyncStore; Wave 1b implementation target
- `tests/ipc/shell.test.ts` - 4 it.todo() stubs for registerShellHandlers; Wave 1a implementation target

## Decisions Made

- `it.todo()` used over `it.skip()` — todos are named contracts that appear in Vitest output, giving Wave 1 executors unambiguous targets without requiring `--reporter=verbose`
- `tests/ipc/` directory created (was absent); `tests/store/` created alongside it — maintains structural separation matching the src/ layout (src/main/ipc/ vs src/renderer/src/store/)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 0 contracts in place; Wave 1a can implement `src/main/ipc/shell.ts` against `tests/ipc/shell.test.ts`
- Wave 1b can implement `src/renderer/src/store/syncStore.ts` against `tests/store/syncStore.test.ts`
- No blockers.

---

## Self-Check: PASSED

- `tests/store/syncStore.test.ts` — FOUND
- `tests/ipc/shell.test.ts` — FOUND
- Commit `acc7483` — FOUND
- Commit `3fdcca1` — FOUND
- npm test exits 0 with 49 passing + 10 todos — VERIFIED

---
*Phase: 04-ui-feedback*
*Completed: 2026-04-22*
