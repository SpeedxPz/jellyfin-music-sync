---
phase: 01-foundation
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - electron-builder.yml
  - electron.vite.config.ts
  - package.json
  - shared/ipc-types.ts
  - src/main/index.ts
  - src/main/ipc/settings.ts
  - src/main/ipc/stubs.ts
  - src/main/lib/fs-utils.ts
  - src/main/lib/logger.ts
  - src/main/lib/store.ts
  - src/preload/index.d.ts
  - src/preload/index.ts
  - src/renderer/index.html
  - src/renderer/src/App.tsx
  - src/renderer/src/assets/main.css
  - src/renderer/src/env.d.ts
  - src/renderer/src/main.tsx
  - tests/lib/fs-utils.test.ts
  - tsconfig.json
  - tsconfig.node.json
  - tsconfig.web.json
  - vitest.config.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

The Phase 1 foundation is well-structured. Security posture is solid: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, typed IPC via `contextBridge`, CSP meta tag in HTML, and atomic manifest writes are all correctly implemented. The FAT32 utilities and settings store are clean.

Three issues require attention before Phase 2 begins. One is a crash risk in production (logger initialized before `app.whenReady()`). Two are functional bugs (IPC channel mismatch for `sync:cancel`, stale preload type declaration). Two informational items round out the findings.

---

## Critical Issues

### CR-01: Logger crashes on startup — `app.getPath()` called before `app.whenReady()`

**File:** `src/main/lib/logger.ts:6-9`

**Issue:** Lines 6 and 9 execute at module-import time — `app.getPath('logs')` and `mkdirSync` are called as top-level statements, not inside any function. In `src/main/index.ts`, line 6 contains a bare ES module `import { log } from './lib/logger'`, which runs the logger module body before `app.whenReady()` is awaited (line 37). Electron's `app.getPath()` throws `"Failed to get 'logs' path"` when called before the app is ready. This will crash the main process on startup in a production build where `app.isReady()` is `false` at import resolution time.

```
// Current (crashes before app.whenReady):
const logDir = app.getPath('logs')      // line 6 — throws in cold start
const logPath = join(logDir, 'app.log')
mkdirSync(logDir, { recursive: true })  // line 9 — never reached
```

**Fix:** Defer initialization to first use with a lazy getter, or initialize inside `app.whenReady()`:

```typescript
// Option A — lazy init (recommended, no API changes):
let _logPath: string | null = null

function ensureLogPath(): string {
  if (!_logPath) {
    const logDir = app.getPath('logs')
    mkdirSync(logDir, { recursive: true })
    _logPath = join(logDir, 'app.log')
  }
  return _logPath
}

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`
  appendFileSync(ensureLogPath(), line, 'utf-8')
}

export function getLogPath(): string {
  return ensureLogPath()
}
```

```typescript
// Option B — call initLogger() explicitly inside app.whenReady() in index.ts:
export function initLogger(): void {
  const logDir = app.getPath('logs')
  mkdirSync(logDir, { recursive: true })
  logPath = join(logDir, 'app.log')
}
```

---

## Warnings

### WR-01: `sync:cancel` channel mismatch — `ipcRenderer.send` vs `ipcMain.handle`

**File:** `src/preload/index.ts:27`

**Issue:** The preload dispatches `sync:cancel` via `ipcRenderer.send()`, which routes to `ipcMain.on()` listeners. The stub in `src/main/ipc/stubs.ts:22` registers it with `ipcMain.handle()`, which only responds to `ipcRenderer.invoke()`. As a result, cancel messages sent from the renderer are silently dropped — no stub throws, no error surfaces. When Phase 3 implements the real handler it will inherit this mismatch and cancel will silently no-op unless the disconnect is noticed.

**Fix:** Either use `ipcRenderer.invoke` in the preload (and update the return type to `Promise<void>`), or register the main-side handler with `ipcMain.on` instead of `ipcMain.handle`. The `ipcMain.on` approach is more idiomatic for fire-and-forget:

```typescript
// In stubs.ts — replace handle with on for sync:cancel:
ipcMain.on('sync:cancel', () => {
  // stub: no-op until Phase 3
})

// In Phase 3, replace with the real handler:
ipcMain.on('sync:cancel', () => {
  cancelActiveSync()
})
```

Remove `'sync:cancel'` from `PHASE3_CHANNELS` in `stubs.ts` so it does not also get an `ipcMain.handle` registration (double-registration will throw at runtime).

---

### WR-02: Stale `src/preload/index.d.ts` conflicts with the real type contract

**File:** `src/preload/index.d.ts:1-8`

**Issue:** This file declares `window.electron: ElectronAPI` (from `@electron-toolkit/preload`) and `window.api: unknown`. Neither property is exposed by the actual preload (`src/preload/index.ts`), which exposes `window.electronAPI` only. The `tsconfig.web.json` includes `src/preload/*.d.ts`, so this file is compiled into the renderer's type environment. The result is that the renderer's `Window` interface simultaneously declares `window.electron`, `window.api`, and (via `shared/ipc-types.ts`) `window.electronAPI`. The first two are phantom properties with no runtime backing — any renderer code that accidentally references `window.electron.*` will fail silently at runtime while compiling without errors.

**Fix:** Delete `src/preload/index.d.ts` entirely. The correct ambient declaration lives in `shared/ipc-types.ts` (the `declare global { interface Window { electronAPI: ElectronAPI } }` block) and is already included transitively via the renderer tsconfig.

---

### WR-03: Unhandled promise rejections in `App.tsx` `useEffect`

**File:** `src/renderer/src/App.tsx:13-14`

**Issue:** Both IPC calls in the `useEffect` are fire-and-forget `.then()` chains with no `.catch()`. If either IPC call rejects (e.g., the main process throws, the channel is not registered, or the app starts in an unexpected state), the rejection is silently discarded. `settings` remains `null` and `logPath` remains `''` with no user-visible error. The UI renders as if loading forever.

**Fix:** Add error handling, at minimum logging to console in the dev panel context:

```tsx
useEffect(() => {
  window.electronAPI.settings
    .get()
    .then(setSettings)
    .catch((err) => console.error('settings:get failed', err))
  window.electronAPI.settings
    .getLogPath()
    .then(setLogPath)
    .catch((err) => console.error('settings:getLogPath failed', err))
}, [])
```

For Phase 4 real UI, surface the error to the user with an error state variable.

---

## Info

### IN-01: Placeholder auto-update URL in `electron-builder.yml`

**File:** `electron-builder.yml:32`

**Issue:** The `publish.url` is set to `https://example.com/auto-updates`. If `electron-updater` is added in a future phase and this placeholder is not replaced, the app will silently fail to check for updates (or, depending on configuration, log errors on every startup).

**Fix:** Replace with a real URL before packaging a release build, or remove the `publish` block entirely until auto-update is implemented.

---

### IN-02: Mixed `require()` and ES module imports in test file

**File:** `tests/lib/fs-utils.test.ts:80`

**Issue:** Line 80 uses `require('fs')` (`const { existsSync } = require('fs')`) inside a test body while the rest of the file uses ES `import` syntax. This works because Vitest runs under Node with CJS interop, but it is inconsistent with the project's TypeScript/ESM style and will produce a lint warning if `no-require-imports` or `@typescript-eslint/no-require-imports` is ever enabled.

**Fix:**

```typescript
// Add to the top-level imports:
import { existsSync } from 'fs'

// Remove the require() inside the test body.
```

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
