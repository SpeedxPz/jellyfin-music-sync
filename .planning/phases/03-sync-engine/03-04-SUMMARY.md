---
phase: 03-sync-engine
plan: "04"
subsystem: ipc-integration
tags: [ipc, sync, electron, dialog, renderer]
dependency_graph:
  requires: [03-03]
  provides: [sync-ipc-handler, renderer-sync-button]
  affects: [src/main/ipc/sync.ts, src/main/ipc/stubs.ts, src/main/index.ts, src/renderer/src/screens/PlaylistBrowserScreen.tsx]
tech_stack:
  added: []
  patterns: [ipcMain.handle, dialog.showOpenDialog, AbortController, webContents.send, webContents.isDestroyed]
key_files:
  created:
    - src/main/ipc/sync.ts
  modified:
    - src/main/ipc/stubs.ts
    - src/main/index.ts
    - src/renderer/src/screens/PlaylistBrowserScreen.tsx
decisions:
  - "D-DEST-PICKER: dialog.showOpenDialog called from main process, not renderer — destination field from SyncOptions is intentionally ignored"
  - "D-DEST-PREFILL: lastDestination from store passed as defaultPath to dialog"
  - "D-DEST-SAVE: chosen destination written back to store immediately after dialog selection"
  - "AbortController at module level in sync.ts — enforces one-sync-at-a-time; prior controller aborted if a second sync:start arrives"
  - "PHASE3_CHANNELS emptied — stubs.ts is now a no-op placeholder only"
metrics:
  duration: "~5 min"
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_changed: 4
---

# Phase 3 Plan 04: IPC Integration Summary

**One-liner:** Thin IPC wrapper sync.ts wires dialog picker + runSync() to renderer Sync Selected button via ipcMain.handle/on.

## What Was Built

The final integration step for Phase 3: a new `src/main/ipc/sync.ts` module with `registerSyncHandlers()` that connects the renderer's "Sync Selected" button to the `runSync()` sync engine through a native folder picker dialog.

### src/main/ipc/sync.ts (created)

- `registerSyncHandlers()` registers two IPC handlers:
  - `ipcMain.handle('sync:start', ...)`: opens `dialog.showOpenDialog`, saves destination to store, creates `AbortController`, calls `runSync()`, sends `sync:complete` on success
  - `ipcMain.on('sync:cancel', ...)`: calls `_abortController?.abort()` (fire-and-forget)
- `getApi()` guard at entry: throws `'Not authenticated'` if no session (T-03-04-01)
- `webContents.isDestroyed()` guard before every `sender.send()` call

### src/main/ipc/stubs.ts (patched)

- `PHASE3_CHANNELS` changed from `['sync:start']` to `[]` (empty typed array)
- `ipcMain.on('sync:cancel', ...)` no-op block removed
- Comment updated to document that sync channels are now in sync.ts

### src/main/index.ts (wired)

- Added `import { registerSyncHandlers } from './ipc/sync'`
- Added `registerSyncHandlers()` call between `registerPlaylistHandlers()` and `registerStubs()`
- Updated `registerStubs()` comment to reflect it is now a no-op placeholder

### src/renderer/src/screens/PlaylistBrowserScreen.tsx (wired)

- Added `syncing: boolean` and `syncError: string | null` state
- Added `handleSyncSelected()` async handler: calls `window.electronAPI.sync.start()`, sets syncing state, catches errors
- Button: disabled when `selectedCount === 0 || syncing`, shows `'Syncing...'` during active sync
- Error display: `<p className="text-red-400 text-sm">` below button on failure
- `destination: ''` passed intentionally — resolved in main process via dialog (D-DEST-PICKER)

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1: Patch stubs.ts + create sync.ts | `55a3f9c` | src/main/ipc/stubs.ts, src/main/ipc/sync.ts |
| 2: Wire index.ts + PlaylistBrowserScreen | `cdb732c` | src/main/index.ts, src/renderer/src/screens/PlaylistBrowserScreen.tsx |

## Verification

- `npm run typecheck` (node + web): PASSED — 0 errors across all three contexts
- `npm test`: PASSED — 49/49 tests (no regressions from IPC wiring)
- No double-handler conflict: stubs.ts PHASE3_CHANNELS is empty; sync.ts is the only sync:start handler

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all sync channels are fully implemented. Phase 4 will add:
- Live progress display via `window.electronAPI.on('sync:progress', ...)` subscription in PlaylistBrowserScreen
- Settings UI to expose `concurrentDownloads` (currently hardcoded to 3 in renderer)

## Threat Flags

No new threat surface beyond what was modeled in the plan's threat register (T-03-04-01 through T-03-04-05).

## Self-Check: PASSED

Files verified:
- `src/main/ipc/sync.ts` — EXISTS
- `src/main/ipc/stubs.ts` — PHASE3_CHANNELS is empty, sync:cancel no-op removed
- `src/main/index.ts` — registerSyncHandlers() import and call present
- `src/renderer/src/screens/PlaylistBrowserScreen.tsx` — sync.start() call, syncing state, button wired

Commits verified:
- `55a3f9c` — feat(03-04): create sync.ts IPC handler and clean stubs.ts
- `cdb732c` — feat(03-04): wire registerSyncHandlers in index.ts and sync button in renderer
