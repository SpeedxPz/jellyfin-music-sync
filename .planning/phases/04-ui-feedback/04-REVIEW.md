---
phase: 04-ui-feedback
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - shared/ipc-types.ts
  - src/main/index.ts
  - src/main/ipc/shell.ts
  - src/main/ipc/sync.ts
  - src/main/lib/sync-engine.ts
  - src/preload/index.ts
  - src/renderer/src/App.tsx
  - src/renderer/src/components/ProgressBar.tsx
  - src/renderer/src/screens/PlaylistBrowserScreen.tsx
  - src/renderer/src/screens/SyncScreen.tsx
  - src/renderer/src/screens/SyncSummaryScreen.tsx
  - src/renderer/src/store/syncStore.ts
  - tests/ipc/shell.test.ts
  - tests/store/syncStore.test.ts
  - package.json
findings:
  critical: 3
  warning: 4
  info: 3
  total: 10
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-04-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed all 15 source files for Phase 4 (UI & Feedback). The IPC layer, sync engine, renderer screens, and store are all well-structured and follow project architecture rules (contextIsolation enforced, atomic manifest writes, typed IPC bridge). Three critical issues were found: an unhandled runtime error path that permanently strands the renderer in the syncing screen, missing validation of IPC input arrays from the renderer, and an unsafe SDK internal property access with no runtime guard. Four warnings address a misleading live failure counter in SyncScreen, the unsubscribed `sync:error` event (also contributes to the stuck-screen problem), a dependency version mismatch between `package.json` and CLAUDE.md, and a silent error swallow in the "Open destination folder" flow. Three informational items cover unimplemented test stubs, emoji use contrary to CLAUDE.md, and a minor React hooks lint violation.

## Critical Issues

### CR-01: Renderer stuck in syncing state on sync error — no `sync:error` IPC sent on exception

**File:** `src/main/ipc/sync.ts:42-76`

**Issue:** The `sync:start` handler wraps `runSync` in a `try/catch`, but the catch block only calls `reset()` on `_abortController` — it never sends any IPC event to the renderer. If `runSync` throws for any reason (e.g., `Not authenticated`, pagination failure, M3U8 write error, manifest write failure), the renderer receives no `sync:complete` and no `sync:error` event. The `syncPhase` in `syncStore` remains `'syncing'` and the user is permanently stuck on `SyncScreen` with no way back except restarting the application.

**Fix:** Add an explicit catch block that sends `sync:error` to the renderer. The `sync:error` channel is already declared in `ipc-types.ts` (line 99) and the `on('sync:error', ...)` subscription is part of the public API contract — it just needs to be wired up on both ends.

```typescript
// src/main/ipc/sync.ts — inside the try/catch in sync:start handler
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (!evt.sender.isDestroyed()) {
        evt.sender.send('sync:error', { message })
      }
    } finally {
      _abortController = null
    }
```

Then in `SyncScreen.tsx`, subscribe to `sync:error` alongside `sync:complete`:

```typescript
// src/renderer/src/screens/SyncScreen.tsx — inside the useEffect
    const removeError = window.electronAPI.on('sync:error', (err) => {
      // Navigate back to playlist browser with an error; or call reset() + show toast
      reset()
      // optionally surface err.message to the user
    })
    return () => {
      removeProgress()
      removeComplete()
      removeError()
    }
```

---

### CR-02: Unvalidated renderer-supplied `playlistIds` array crashes main process

**File:** `src/main/ipc/sync.ts:17`, `src/main/lib/sync-engine.ts:177`

**Issue:** `opts: SyncOptions` arrives from the renderer (untrusted context) over IPC. The main process never checks that `opts.playlistIds` is a non-empty array before passing it to `runSync`, where it is immediately iterated with `for...of`. If the renderer sends a malformed payload (e.g., `playlistIds: null`, `playlistIds: undefined`, or `playlistIds: "string"`), `runSync` throws an unhandled `TypeError: opts.playlistIds is not iterable` that propagates past the IPC handler's catch block without sending `sync:error` to the renderer (compounding CR-01).

**Fix:** Validate at the IPC boundary before calling `runSync`:

```typescript
// src/main/ipc/sync.ts — after destination is resolved, before runSync
    if (!Array.isArray(opts.playlistIds) || opts.playlistIds.length === 0) {
      throw new Error('No playlists selected.')
    }
    // Sanitize: keep only strings
    const safePlaylistIds = opts.playlistIds.filter((id): id is string => typeof id === 'string')
```

---

### CR-03: Unsafe cast of SDK internal `authorizationHeader` with no runtime guard

**File:** `src/main/lib/sync-engine.ts:282`

**Issue:** The authorization header is accessed via `(api as unknown as { authorizationHeader: string }).authorizationHeader`. If `authorizationHeader` is `undefined` at runtime (SDK version change, property renamed, or the Jellyfin instance not fully initialized), all `downloadTrack` calls will be made with `undefined` as the auth header. The HTTP requests will fail with 401 errors, but each failure will be recorded as an individual track download failure rather than surfacing a clear "authentication broken" error. With 500 tracks in a playlist this means 500 silent failures counted in `summary.failed`.

**Fix:** Add a runtime guard and throw clearly if the header is missing:

```typescript
// src/main/lib/sync-engine.ts — around line 282
    const authHeader = (api as unknown as { authorizationHeader: string }).authorizationHeader
    if (!authHeader) {
      throw new Error(
        'Jellyfin SDK did not expose authorizationHeader — cannot authenticate downloads. ' +
        'This is likely an SDK version incompatibility.'
      )
    }
```

---

## Warnings

### WR-01: Live "failed" counter in SyncScreen always shows 0 or 1 — never accumulates

**File:** `src/renderer/src/screens/SyncScreen.tsx:57`

**Issue:** The failure counter displayed during sync is computed as:
```typescript
const failed = progress?.status === 'error' ? 1 : 0
```
This evaluates the most-recently-received progress event's status. It never accumulates across events, so after 5 failed tracks followed by a successful one, the display reads "0 failed". The counter resets to 0 with every successful progress event. This is misleading — a user watching a large sync will not know how many tracks have failed.

**Fix:** Accumulate failures in the store. Add a `failedCount` field to `SyncState` incremented in `updateProgress`:

```typescript
// src/renderer/src/store/syncStore.ts
  failedCount: 0,
  updateProgress: (p) =>
    set((s) => ({
      progress: p,
      failedCount: p.status === 'error' ? s.failedCount + 1 : s.failedCount,
    })),
```

Then reset `failedCount` in `startSync` and `reset`, and read it in `SyncScreen`:

```typescript
// src/renderer/src/screens/SyncScreen.tsx
const { progress, failedCount, updateProgress, setSummary, cancel } = useSyncStore()
// ...
<p className="text-sm text-gray-400">
  ✔ {done} done  •  ⧖ {remaining} remaining  •  ✖ {failedCount} failed
</p>
```

---

### WR-02: `sync:error` event subscribed in `ipc-types.ts` but never handled in renderer

**File:** `src/renderer/src/screens/SyncScreen.tsx:19-38`

**Issue:** `ipc-types.ts` declares `on(event: 'sync:error', cb: (err: { message: string }) => void): () => void` as part of the public API. The `SyncScreen` subscribes to `sync:progress` and `sync:complete` but never subscribes to `sync:error`. If the main process emits `sync:error` (after CR-01 is fixed, or even from other error paths), the renderer drops the event silently and the screen remains frozen. This is a contract violation — a declared event is not consumed.

**Fix:** Add the `sync:error` subscription in the `useEffect` cleanup block (code shown in CR-01 fix above). Also ensure `reset` is imported from `useSyncStore` in `SyncScreen`:

```typescript
const { progress, updateProgress, setSummary, cancel, reset } = useSyncStore()
```

---

### WR-03: `p-limit` version in `package.json` conflicts with CLAUDE.md specification

**File:** `package.json:28`

**Issue:** `package.json` declares `"p-limit": "^3.1.0"` but CLAUDE.md states the project uses `p-limit 6`. These are different major versions with different module systems: v3 is CommonJS, v6 is pure ESM. The import in `sync-engine.ts` (`import pLimit from 'p-limit'`) is ESM syntax. If the installed version is actually 3.x, `electron-vite` may or may not shim this correctly depending on its bundler configuration. If v6 is installed (despite the `^3.1.0` constraint being too restrictive to resolve it), the lockfile would reflect that, but a fresh `npm install` would install v3. This creates a reproducibility hazard.

**Fix:** Update `package.json` to match the documented version:

```json
"p-limit": "^6.1.0"
```

Then run `npm install` to update the lockfile. Verify the build still works (`npm run build`).

---

### WR-04: `handleOpenDestination` silently swallows shell errors — no user feedback

**File:** `src/renderer/src/screens/SyncSummaryScreen.tsx:12-15`

**Issue:** `handleOpenDestination` calls `window.electronAPI.shell.openPath()` without `.catch()`. If the path doesn't exist (e.g., USB drive was ejected), `shell:openPath` rejects with an error, which becomes an unhandled promise rejection in the renderer. The user sees no feedback — the button appears to do nothing.

**Fix:** Add error handling with user-visible feedback:

```typescript
const [openError, setOpenError] = useState<string | null>(null)

const handleOpenDestination = () => {
  if (!summary.destination) return
  window.electronAPI.shell
    .openPath(summary.destination)
    .catch((err: Error) => setOpenError(err.message))
}

// In JSX, below the Open button:
{openError && <p className="text-red-400 text-sm mt-1">{openError}</p>}
```

---

## Info

### IN-01: All shell handler tests are unimplemented stubs

**File:** `tests/ipc/shell.test.ts:6-11`

**Issue:** All four tests in `registerShellHandlers` are `it.todo` stubs. The `shell:openPath` handler is fully implemented and straightforward to test. Leaving the test file as stubs means there is zero automated coverage for the empty-path guard, the success path, and the error-string rejection path.

**Fix:** Implement the test suite with Vitest mocks for `electron`'s `ipcMain` and `shell`. The three non-trivial cases to cover are: (1) empty path returns without calling `shell.openPath`, (2) non-empty path calls `shell.openPath(path)` and resolves, (3) `shell.openPath` returns an error string → handler rejects with `new Error(errorString)`.

---

### IN-02: Emoji characters in UI files conflict with CLAUDE.md "avoid emojis" guideline

**File:** `src/renderer/src/screens/SyncScreen.tsx:113`, `src/renderer/src/screens/SyncSummaryScreen.tsx:46,49`

**Issue:** CLAUDE.md states "avoid writing emojis to files unless asked." Several emoji characters appear in shipped UI code:
- `SyncScreen.tsx:113`: `✔`, `⧖`, `✖` in the counter row
- `SyncSummaryScreen.tsx:46`: `🗑` (trash can) for removed count
- `SyncSummaryScreen.tsx:49`: `⏭` for unchanged count

**Fix:** Replace with plain text or SVG icon components. For example:

```tsx
// SyncScreen.tsx line 113 — before
✔ {done} done  •  ⧖ {remaining} remaining  •  ✖ {failedCount} failed

// after
{done} done  •  {remaining} remaining  •  {failedCount} failed
```

For the summary screen, replace `🗑` and `⏭` with text labels or the same `✔`/`✖` convention used elsewhere.

---

### IN-03: `useEffect` missing dependencies in SyncScreen — React hooks lint violation

**File:** `src/renderer/src/screens/SyncScreen.tsx:19-38`

**Issue:** The `useEffect` captures `updateProgress` and `setSummary` from `useSyncStore` but declares an empty dependency array `[]`. While Zustand action references are stable (they don't change between renders), `eslint-plugin-react-hooks`'s `exhaustive-deps` rule will flag this. The empty array is the correct intent (subscribe once on mount), but the code will produce a lint warning that may block CI if lint is enforced.

**Fix:** Destructure actions outside the effect to make the stable-reference intent explicit, or use `useRef` to capture them. The simplest approach is to extract the actions before the effect:

```typescript
const updateProgress = useSyncStore((s) => s.updateProgress)
const setSummary = useSyncStore((s) => s.setSummary)
const cancel = useSyncStore((s) => s.cancel)
const reset = useSyncStore((s) => s.reset)
// ...
useEffect(() => {
  // ... subscriptions ...
}, [updateProgress, setSummary, reset])
```

Because these are stable Zustand references, adding them to deps causes no re-subscriptions while satisfying the linter.

---

_Reviewed: 2026-04-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
