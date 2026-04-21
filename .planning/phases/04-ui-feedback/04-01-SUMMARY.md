---
phase: 04-ui-feedback
plan: "01"
subsystem: ipc-contracts

tags: [ipc-types, preload, shell, notification, sync, electron, typescript]

requires:
  - phase: 04-ui-feedback
    plan: "00"
    provides: Wave 0 test stubs for shell.ts and syncStore — red/green targets now fulfilled by this plan

provides:
  - Updated SyncSummary with destination field (POST-03, Pitfall 3)
  - ElectronAPI.shell namespace with openPath (POST-03)
  - preload on() returning cleanup function (T-04-02 listener accumulation fix)
  - shell:openPath IPC handler with empty-path guard (T-04-01)
  - Desktop notification on sync complete with cancel guard (T-04-03, D-NOTIF)
  - registerSyncHandlers(BrowserWindow) wired after createWindow() (Pitfall 2)

affects: [04-02, 04-03, 04-04]

tech-stack:
  added: []
  patterns:
    - "preload on() cleanup: capture listener ref, register with ipcRenderer.on, return () => ipcRenderer.removeListener(event, listener)"
    - "BrowserWindow param pattern: IPC handlers that need window focus accept BrowserWindow; called after createWindow() in index.ts"
    - "Desktop notification guard: !_abortController?.signal.aborted && Notification.isSupported() before new Notification()"
    - "summaryWithDest pattern: sync.ts enriches summary from runSync() with destination before send"

key-files:
  created:
    - src/main/ipc/shell.ts
  modified:
    - shared/ipc-types.ts
    - src/preload/index.ts
    - src/main/ipc/sync.ts
    - src/main/index.ts
    - src/main/lib/sync-engine.ts

key-decisions:
  - "04-01: destination added to SyncSummary interface — renderer summary screen gets resolved path from sync:complete payload without a separate IPC call"
  - "04-01: sync-engine.ts initializes destination in summary object (engine receives opts.destination) — sync.ts summaryWithDest spread is redundant but kept for explicit documentation"
  - "04-01: registerSyncHandlers(win) called after const win = createWindow() — BrowserWindow available for notification click focus handler"

duration: 3min
completed: 2026-04-21
---

# Phase 4 Plan 01: IPC Contracts + Main-Process Changes Summary

**IPC contract updates, preload cleanup fix, shell:openPath handler, desktop notification, and BrowserWindow wiring — all main-process and shared-contract changes that Wave 1b renderer work depends on**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-21T19:59:18Z
- **Completed:** 2026-04-21T20:02:15Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Updated `shared/ipc-types.ts`: added `destination: string` to `SyncSummary`, added `shell` namespace with `openPath` to `ElectronAPI`, fixed all three `on()` overloads to return `() => void`
- Fixed `src/preload/index.ts`: `on()` now captures listener reference and returns `() => ipcRenderer.removeListener(event, listener)` — prevents listener accumulation on React re-mount
- Added `shell` namespace to preload: `openPath: (path) => ipcRenderer.invoke('shell:openPath', path)`
- Created `src/main/ipc/shell.ts`: `registerShellHandlers()` handles `shell:openPath` with empty-path guard (`if (!path) return`) and error rejection
- Patched `src/main/ipc/sync.ts`: accepts `BrowserWindow` param; fires `new Notification()` on clean complete (guarded by `!_abortController?.signal.aborted`); sends `summaryWithDest` with destination
- Patched `src/main/index.ts`: imports `registerShellHandlers`; `const win = createWindow()` before `registerSyncHandlers(win)`
- All 3 STRIDE threats (T-04-01, T-04-02, T-04-03) mitigated
- `npm run typecheck` exits 0; `npm test` exits 0 with 49 passing + 10 todos

## Task Commits

Each task was committed atomically:

1. **Task 1: Update shared/ipc-types.ts** — `7a59f8f` (feat)
2. **Task 2: Fix preload + create shell.ts** — `9ab3219` (feat)
3. **Task 3: Patch sync.ts + index.ts** — `15ac3d4` (feat)

## Files Created/Modified

- `shared/ipc-types.ts` — `destination` in SyncSummary; `shell` namespace; `on()` returns `() => void`
- `src/preload/index.ts` — `on()` with cleanup return; `shell.openPath` invoke
- `src/main/ipc/shell.ts` — new file; `registerShellHandlers()` with empty-path guard
- `src/main/ipc/sync.ts` — `BrowserWindow` param; notification with cancel guard; `summaryWithDest`
- `src/main/index.ts` — `registerShellHandlers()`; `const win = createWindow()`; `registerSyncHandlers(win)`
- `src/main/lib/sync-engine.ts` — `destination` added to summary initializer (Rule 1 fix)

## Decisions Made

- `destination` added to `SyncSummary` interface — renderer summary screen gets the resolved path from the `sync:complete` payload without a separate IPC call
- `sync-engine.ts` initializes `destination` in the summary object because it already receives `opts.destination`; `sync.ts` still spreads `summaryWithDest` for explicit documentation clarity
- `registerSyncHandlers(win)` called after `const win = createWindow()` — BrowserWindow available for notification click focus handler (Pitfall 2 mitigation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added destination to sync-engine.ts summary initializer**
- **Found during:** Task 3
- **Issue:** `SyncSummary` now requires `destination: string` field; `sync-engine.ts` line 153 constructed the summary object without it, causing TS2741 type error
- **Fix:** Added `destination` to the summary initializer in `sync-engine.ts` — engine already has `opts.destination` in scope
- **Files modified:** `src/main/lib/sync-engine.ts`
- **Commit:** `15ac3d4`

## Known Stubs

None — this plan has no stubs. All IPC contracts are fully implemented.

## Threat Flags

None — all surfaces introduced in this plan were present in the plan's `<threat_model>` (T-04-01, T-04-02, T-04-03), all mitigated.

---

## Self-Check: PASSED

- `shared/ipc-types.ts` contains `destination: string` in SyncSummary — VERIFIED (`grep -n "destination: string" shared/ipc-types.ts` line 55)
- `src/preload/index.ts` contains `removeListener` — VERIFIED (line 39)
- `src/main/ipc/shell.ts` exists and exports `registerShellHandlers` — FOUND
- `src/main/ipc/sync.ts` contains `new Notification` — VERIFIED (line 59)
- `src/main/index.ts` contains `registerSyncHandlers(win)` — VERIFIED (line 57)
- Commit `7a59f8f` — FOUND
- Commit `9ab3219` — FOUND
- Commit `15ac3d4` — FOUND
- `npm run typecheck` exits 0 — VERIFIED
- `npm test` exits 0 with 49 passing + 10 todos — VERIFIED

---
*Phase: 04-ui-feedback*
*Completed: 2026-04-21*
