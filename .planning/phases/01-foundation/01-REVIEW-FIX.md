---
phase: 01-foundation
fixed_at: 2026-04-20T05:03:50Z
review_path: .planning/phases/01-foundation/01-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-04-20T05:03:50Z
**Source review:** .planning/phases/01-foundation/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (1 Critical, 3 Warning — Info excluded per fix_scope)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Logger crashes on startup — `app.getPath()` called before `app.whenReady()`

**Files modified:** `src/main/lib/logger.ts`
**Commit:** 43d9a94
**Applied fix:** Replaced top-level `app.getPath('logs')` and `mkdirSync` calls (which executed at import time) with a lazy `ensureLogPath()` helper. The helper initializes `_logPath` on first call, which only happens after `app.whenReady()` has resolved. The public `log()` and `getLogPath()` exports now delegate to `ensureLogPath()` with no API surface change.

---

### WR-01: `sync:cancel` channel mismatch — `ipcRenderer.send` vs `ipcMain.handle`

**Files modified:** `src/main/ipc/stubs.ts`
**Commit:** 0f0f360
**Applied fix:** Removed `'sync:cancel'` from `PHASE3_CHANNELS` (which fed the `ipcMain.handle` loop) and added a dedicated `ipcMain.on('sync:cancel', ...)` stub below the loop. This matches the preload's `ipcRenderer.send('sync:cancel')` call. Added a comment marking it for replacement in Phase 3.

---

### WR-02: Stale `src/preload/index.d.ts` conflicts with the real type contract

**Files modified:** `src/preload/index.d.ts` (deleted)
**Commit:** 29b5670
**Applied fix:** Deleted the file entirely via `git rm`. It declared phantom `window.electron` and `window.api` properties backed by `@electron-toolkit/preload` types that the actual preload never exposes. The authoritative ambient declaration for `window.electronAPI` in `shared/ipc-types.ts` is already included transitively through `tsconfig.web.json`.

---

### WR-03: Unhandled promise rejections in `App.tsx` `useEffect`

**Files modified:** `src/renderer/src/App.tsx`
**Commit:** 2e8f1cf
**Applied fix:** Added `.catch((err) => console.error(...))` to both `settings.get()` and `settings.getLogPath()` promise chains. Rejections are now surfaced to the dev console rather than silently discarded. The fix note in REVIEW.md recommends upgrading to a user-visible error state in Phase 4.

---

_Fixed: 2026-04-20T05:03:50Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
