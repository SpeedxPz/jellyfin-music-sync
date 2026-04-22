---
phase: 04-ui-feedback
fixed_at: 2026-04-22T00:00:00Z
review_path: .planning/phases/04-ui-feedback/04-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 4: Code Review Fix Report

**Fixed at:** 2026-04-22T00:00:00Z
**Source review:** .planning/phases/04-ui-feedback/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (3 Critical, 4 Warning)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: Renderer stuck in syncing state on sync error

**Files modified:** `src/main/ipc/sync.ts`
**Commit:** 0b3b1df
**Applied fix:** Added a `catch (err: unknown)` block inside the `sync:start` ipcMain handler. The catch block extracts a human-readable message from the error and calls `evt.sender.send('sync:error', { message })` (guarded by `isDestroyed()`), allowing the renderer to exit the permanent `syncing` phase. The existing `finally` block that nulls `_abortController` is preserved.

---

### CR-02: Unvalidated renderer-supplied `playlistIds` array crashes main process

**Files modified:** `src/main/ipc/sync.ts`
**Commit:** 0b3b1df
**Applied fix:** Added input validation immediately after `_abortController` is created and before `runSync` is called. Checks that `opts.playlistIds` is a non-empty array (throws `'No playlists selected.'` otherwise) and filters to string-only elements via a type predicate. The sanitized array `safePlaylistIds` is passed to `runSync` instead of the raw `opts.playlistIds`. The validation throw sits outside the try/catch so it rejects the `invoke()` promise cleanly; the try/catch handles mid-sync errors separately.

---

### CR-03: Unsafe cast of SDK internal `authorizationHeader` with no runtime guard

**Files modified:** `src/main/lib/sync-engine.ts`
**Commit:** a609bd2
**Applied fix:** Added a runtime guard immediately after the `authorizationHeader` cast. If `authHeader` is falsy, throws a descriptive `Error` naming the SDK version incompatibility as the likely cause. This surfaces as a single clear failure via the CR-01 `sync:error` path instead of accumulating 500 individual 401 download failures.

---

### WR-01: Live "failed" counter in SyncScreen always shows 0 or 1

**Files modified:** `src/renderer/src/store/syncStore.ts`, `src/renderer/src/screens/SyncScreen.tsx`
**Commit:** 9942cff
**Applied fix:** Added `failedCount: number` field to the `SyncState` interface and initial state (value `0`). Changed `updateProgress` from a simple `set({ progress: p })` to a reducer that increments `failedCount` when `p.status === 'error'`. Both `startSync` and `reset` now include `failedCount: 0` to clear the counter at the right lifecycle points. In `SyncScreen`, removed the stale per-event `failed` local variable and replaced the JSX reference with `failedCount` from the store. `reset` is also now destructured from `useSyncStore` (required for WR-02).

---

### WR-02: `sync:error` event declared in ipc-types.ts but never subscribed in renderer

**Files modified:** `src/renderer/src/screens/SyncScreen.tsx`
**Commit:** 9942cff
**Applied fix:** Added a `sync:error` subscription inside the `useEffect` alongside `sync:progress` and `sync:complete`. The handler calls `reset()` (imported via destructuring added for WR-01) to return `syncPhase` to `'idle'`, unblocking the renderer. The cleanup function now calls `removeError()` in addition to `removeProgress()` and `removeComplete()` to prevent listener accumulation on unmount.

---

### WR-03: `p-limit` version in `package.json` conflicts with CLAUDE.md specification

**Files modified:** `package.json`
**Commit:** 7979a84
**Applied fix:** Updated `"p-limit"` from `"^3.1.0"` to `"^6.1.0"` to match the version specified in CLAUDE.md. electron-vite bundles ESM dependencies correctly so v6 works in the main process build output.

---

### WR-04: `handleOpenDestination` silently swallows shell errors

**Files modified:** `src/renderer/src/screens/SyncSummaryScreen.tsx`
**Commit:** ea9ffb8
**Applied fix:** Added `const [openError, setOpenError] = useState<string | null>(null)` state. Changed `handleOpenDestination` to chain `.catch((err: Error) => setOpenError(err.message))` on the `shell.openPath()` promise. Added a conditional `<p className="text-red-400 text-sm mt-1">{openError}</p>` below the "Open destination folder" button so the error is visible to the user (e.g. when a USB drive has been ejected).

---

_Fixed: 2026-04-22T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
