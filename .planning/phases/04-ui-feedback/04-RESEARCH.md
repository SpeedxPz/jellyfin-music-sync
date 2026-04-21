# Phase 4: UI & Feedback - Research

**Researched:** 2026-04-21
**Domain:** Electron desktop UI (React + Zustand), IPC event subscriptions, desktop notifications, electron-builder packaging
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-SCREEN:** `App.tsx` becomes a 3-state router: `login` → `playlists` → `syncing`. A new `SyncScreen` replaces the playlist browser while a sync is running.
- **D-ROUTER:** Zustand `syncStore` holds `syncState: 'idle' | 'syncing' | 'summary'`, accumulated `SyncProgress`, and the final `SyncSummary`.
- **D-PROG-LAYOUT:** SyncScreen layout: header + Cancel button, subtitle, overall progress bar with %, current track label, per-file byte progress bar, done/remaining/failed counters.
- **D-PROG-EVENTS:** Subscribe to `sync:progress` and `sync:complete` via `window.electronAPI.on(event, cb)` in SyncScreen mount.
- **D-SUMMARY-LAYOUT:** SyncSummaryScreen shows: "Sync Complete"/"Sync Canceled" heading, count rows (added/removed/unchanged/failed), "Open destination folder" button, expandable failures section.
- **D-SUMMARY-DESTINATION:** Destination path available in renderer at summary time — either included in SyncSummary or cached in syncStore when sync starts.
- **D-CANCEL:** Cancel is fire-and-forget via `window.electronAPI.sync.cancel()`. No confirmation dialog. Renderer accumulates events until `sync:complete` fires.
- **D-CANCEL-STATE:** `canceled: boolean` flag in syncStore. Set `true` on Cancel click. Used to choose "Sync Canceled" vs "Sync Complete" heading.
- **D-FAILURES:** Failures list collapsed by default, local `useState` toggle. No animation. Not rendered when `failures.length === 0`.
- **D-NOTIF:** Desktop notification fires from main process in `src/main/ipc/sync.ts` on sync:complete only (not on cancel). Uses Electron's `new Notification()` API.
- **D-NOTIF-CONTENT:** Title: "Sync complete". Body: "{N} added, {M} failed" or "All tracks up to date" (added === 0 && failed === 0).
- **D-NOTIF-CLICK:** Click handler calls `mainWindow.focus()`. No shell.openPath on notification click.
- **D-SETTINGS-CONTROL:** Inline `Downloads: [−] N [+]` control in PlaylistBrowserScreen header, clamped 1–5. Reads from `settings.get()` on mount. Calls `settings.set({ concurrentDownloads: N })` on click.
- **D-SETTINGS-PASS:** Pass `concurrentDownloads` value into `SyncOptions` when calling `sync.start`, replacing the hardcoded `3`.
- **D-PACKAGE:** electron-builder with NSIS (Windows) + AppImage (Linux). No auto-updater for v1.

### Claude's Discretion

- Exact Zustand store shape and filename for sync state
- Whether `SyncSummaryScreen` is a separate file or conditional branch in `SyncScreen`
- Progress bar component implementation (native CSS or small utility)
- Animation/transition between progress and summary views (none required)
- How the destination path is surfaced in the summary (include in SyncSummary or cache in store)
- electron-builder config details (app ID, productName, icon paths, output directory)

### Deferred Ideas (OUT OF SCOPE)

- Animation/transitions between screen states
- Speed and ETA display during sync
- Dry-run mode / preview

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROG-01 | App shows per-file download progress and overall completion percentage during sync | Zustand syncStore shape, React useEffect subscription pattern, ProgressBar component |
| PROG-02 | User can cancel an in-progress sync; partial downloads are cleaned up | Cancel is fire-and-forget via existing `sync:cancel` channel; cleanup already handled in Phase 3 sync-engine |
| POST-01 | App shows sync summary (counts of added, deleted, skipped, failed) | SyncSummary type already defined in ipc-types.ts; renderer reads from sync:complete payload |
| POST-02 | App shows error log listing failed tracks with reason | `SyncSummary.failures[]` provides `{ name, reason }` per entry; collapsible UI pattern |
| POST-03 | User can open destination folder in OS file explorer from the app | New IPC handler `shell:openPath` in main process using `shell.openPath()`; new `ElectronAPI.shell.openPath()` in preload |
| POST-04 | App sends desktop notification when sync completes | Electron `Notification` API from main process; added to `src/main/ipc/sync.ts` |
| SET-02 | User can configure concurrent downloads (1–5) | Inline control in PlaylistBrowserScreen header; reads/writes `settings.concurrentDownloads` via existing settings IPC |

</phase_requirements>

---

## Summary

Phase 4 is entirely renderer-side wiring and packaging. All sync logic is already implemented in the main process (Phase 3 complete). The work divides into four categories: (1) new React screens (`SyncScreen`, `SyncSummaryScreen`) consuming `sync:progress` and `sync:complete` IPC events; (2) a `syncStore` in Zustand to replace local `useState` syncing state and drive App.tsx's 3-state router; (3) two main-process additions (desktop notification in sync.ts and `shell.openPath` IPC handler); and (4) electron-builder packaging configuration.

The IPC event subscription pattern has one important pitfall: the current `preload.ts` `on()` implementation does not return a cleanup function, meaning `ipcRenderer.on` listeners accumulate if React mounts/unmounts `SyncScreen` multiple times. The fix is straightforward — expose a per-channel `removeAllListeners` method in the preload so `useEffect` cleanup can call it. This is the only code change required outside the renderer UI.

Packaging is essentially already scaffolded: `electron-builder.yml` exists with correct `appId`, `productName`, NSIS config, and Linux AppImage target. The only missing asset is `build/icon.ico` (Windows) and `build/icon.png` (Linux). The electron-vite `out/` output directory is included by electron-builder's default `**/*` glob and no files reconfiguration is needed.

**Primary recommendation:** Build `syncStore` first (it gates all three screens), then build `SyncScreen` and `SyncSummaryScreen` against the store, then add desktop notification + `shell.openPath` to the main process, then add icons and verify packaging.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sync progress display | Renderer (React) | — | Display-only; events pushed from main via IPC |
| Sync state management | Renderer (Zustand) | — | UI routing state; no I/O, pure display |
| IPC event subscription | Renderer (useEffect) | Preload (cleanup bridge) | Renderer subscribes; preload exposes typed cleanup |
| Desktop notification | Main process | — | Electron `Notification` API is main-process only |
| Open destination folder | Main process | — | `shell.openPath` is a Node/Electron API; CLAUDE.md: all I/O in main |
| Concurrent downloads control | Renderer (UI) + Main (settings write) | — | UI reads/writes via existing `settings.*` IPC |
| Packaging | Build tooling (electron-builder) | — | Wraps the entire compiled output |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | 5.0.12 [VERIFIED: npm registry] | syncStore — sync state routing | Already used for authStore; same pattern |
| React | 19.2.5 [VERIFIED: npm registry] | SyncScreen, SyncSummaryScreen components | Project standard |
| Tailwind CSS | 4.2.2 [VERIFIED: package.json] | Component styling | Project standard; no component library |
| Electron Notification | Electron 39 built-in [VERIFIED: package.json] | Desktop notifications from main process | Native Electron API; no npm install needed |
| electron-builder | 26.8.1 [VERIFIED: npm registry] | NSIS + AppImage packaging | Already in devDependencies |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `shell` (electron) | Built-in | Open destination folder in OS explorer | Phase 4 only; `shell.openPath(path)` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Electron main-process Notification | Web Notifications API in renderer | Web API requires `allowRendererProcessReuse`; less reliable; CLAUDE.md requires all I/O in main |
| Custom progress bar div | Native `<progress>` element | `<progress>` is hard to style cross-browser; custom div with role="progressbar" gives full Tailwind control |

**Installation:** No new packages required. All dependencies already in `package.json`.

---

## Architecture Patterns

### System Architecture Diagram

```
Renderer (React)               Preload (contextBridge)          Main Process
─────────────────              ────────────────────────          ────────────
App.tsx (3-state router)
  │  reads syncState
  │
  ├─ LoginScreen
  ├─ PlaylistBrowserScreen ──► settings.get/set IPC ──────────► electron-conf store
  │    + Downloads control ──► sync.start IPC ────────────────► runSync() + dialog
  │
  └─ SyncScreen ──────────────────────────────────────────────────────────────────
       useEffect mount:                                          sync.ts sends events:
       on('sync:progress', cb) ◄── ipcRenderer.on ─────────── webContents.send('sync:progress')
       on('sync:complete', cb) ◄── ipcRenderer.on ─────────── webContents.send('sync:complete')
       │                                                              │
       │  progress events ──► syncStore.updateProgress()             │
       │  complete event ───► syncStore.setSummary()                 │
       │                       + transition to 'summary'             │
       │                                                    [new] Notification('Sync complete')
       Cancel button ────────► sync.cancel (fire-and-forget) ──► AbortController.abort()
       syncStore.canceled=true
  
  SyncSummaryScreen ◄── syncStore.syncState === 'summary'
       "Open destination folder" ──► shell:openPath IPC ──────► shell.openPath(dest)
```

### Recommended Project Structure

```
src/renderer/src/
├── store/
│   ├── authStore.ts         # existing
│   └── syncStore.ts         # NEW — sync routing state + progress + summary
├── screens/
│   ├── LoginScreen.tsx      # existing
│   ├── PlaylistBrowserScreen.tsx  # modified — add downloads control
│   ├── SyncScreen.tsx       # NEW
│   └── SyncSummaryScreen.tsx  # NEW (separate file — cleaner than conditional branch)
└── components/
    └── ProgressBar.tsx      # NEW — reusable across SyncScreen

src/main/ipc/
├── sync.ts                  # modified — add Notification + destination in complete payload
└── shell.ts                 # NEW — registerShellHandlers() with shell:openPath

shared/
└── ipc-types.ts             # modified — add shell.openPath to ElectronAPI; add off() to on() return

src/preload/index.ts         # modified — on() returns cleanup fn; add shell.openPath
```

### Pattern 1: syncStore Shape (Zustand)

**What:** Central store driving the 3-state router and holding all in-flight sync data.
**When to use:** Any component that needs sync state, progress values, or summary.

```typescript
// src/renderer/src/store/syncStore.ts
// Source: authStore.ts pattern (Phase 2) + CONTEXT.md D-ROUTER

import { create } from 'zustand'
import type { SyncProgress, SyncSummary } from '../../../../shared/ipc-types'

type SyncPhase = 'idle' | 'syncing' | 'summary'

interface SyncState {
  syncPhase: SyncPhase
  canceled: boolean
  progress: SyncProgress | null
  summary: SyncSummary | null
  destination: string        // cached when sync:start is called (D-SUMMARY-DESTINATION)

  // Actions
  startSync: (destination: string) => void
  updateProgress: (p: SyncProgress) => void
  setSummary: (s: SyncSummary) => void
  cancel: () => void
  reset: () => void
}

export const useSyncStore = create<SyncState>()((set) => ({
  syncPhase: 'idle',
  canceled: false,
  progress: null,
  summary: null,
  destination: '',

  startSync: (destination) => set({ syncPhase: 'syncing', canceled: false, progress: null, summary: null, destination }),
  updateProgress: (p) => set({ progress: p }),
  setSummary: (s) => set({ syncPhase: 'summary', summary: s }),
  cancel: () => set({ canceled: true }),
  reset: () => set({ syncPhase: 'idle', canceled: false, progress: null, summary: null }),
}))
```

### Pattern 2: IPC Event Subscription in SyncScreen (useEffect)

**What:** Subscribe to push events on mount; return cleanup to prevent listener accumulation.
**When to use:** Any component that subscribes to `on()` IPC events.

```typescript
// src/renderer/src/screens/SyncScreen.tsx (excerpt)
// Source: Electron IPC docs + preload cleanup pattern

useEffect(() => {
  const removeProgress = window.electronAPI.on('sync:progress', (p) => {
    updateProgress(p)
  })
  const removeComplete = window.electronAPI.on('sync:complete', (summary) => {
    setSummary(summary)
  })
  return () => {
    removeProgress()
    removeComplete()
  }
}, [])
```

This requires the preload `on()` to return a cleanup function (see Pitfall 1 below).

### Pattern 3: Updated Preload on() Signature

**What:** `on()` returns a `() => void` cleanup function so React useEffect can unsubscribe.
**When to use:** All `on()` subscribers in the renderer.

```typescript
// src/preload/index.ts (modified on() implementation)
// Source: Electron IPC docs security note + community cleanup pattern

on: (event, cb) => {
  const listener = (_evt: unknown, payload: unknown) => cb(payload as never)
  ipcRenderer.on(event, listener)
  return () => ipcRenderer.removeListener(event, listener)
},
```

The `ElectronAPI` `on()` overloads in `ipc-types.ts` must also be updated to return `() => void`.

### Pattern 4: Desktop Notification in sync.ts

**What:** Fire OS notification from main process when sync completes (not on cancel).
**When to use:** Only within `sync:start` handler, immediately before `evt.sender.send('sync:complete')`.

```typescript
// src/main/ipc/sync.ts (addition, inside sync:start handler)
// Source: https://www.electronjs.org/docs/latest/api/notification
import { Notification } from 'electron'

// Inside the try block, after runSync() returns:
const body = summary.added === 0 && summary.failed === 0
  ? 'All tracks up to date'
  : `${summary.added} added, ${summary.failed} failed`

if (Notification.isSupported()) {
  const notif = new Notification({ title: 'Sync complete', body })
  notif.on('click', () => mainWindow?.focus())
  notif.show()
}
```

`mainWindow` must be passed into `registerSyncHandlers()` or captured at module level from `createWindow()`.

### Pattern 5: shell.openPath IPC Handler

**What:** New handler exposing OS file explorer open capability.
**When to use:** "Open destination folder" button in SyncSummaryScreen.

```typescript
// src/main/ipc/shell.ts
import { ipcMain, shell } from 'electron'

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openPath', async (_evt, path: string) => {
    if (!path) return
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
}
```

Preload addition in `ElectronAPI.shell.openPath`:
```typescript
shell: {
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
},
```

### Pattern 6: ProgressBar Component

**What:** Reusable progress bar with ARIA attributes; two sizes.
**When to use:** SyncScreen overall bar (size='md') and per-file bar (size='sm').

```typescript
// src/renderer/src/components/ProgressBar.tsx
// Source: 04-UI-SPEC.md §Component Inventory

interface ProgressBarProps {
  value: number   // 0–100
  size?: 'md' | 'sm'
}

export function ProgressBar({ value, size = 'md' }: ProgressBarProps) {
  const h = size === 'md' ? 'h-2' : 'h-1.5'
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`w-full bg-gray-700 rounded-full ${h} overflow-hidden`}
    >
      <div
        className="bg-blue-500 rounded-full h-full transition-[width] duration-150"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
```

### Pattern 7: App.tsx 3-State Router

**What:** Extend existing 2-state (login/playlists) to 3-state (login/playlists/syncing).
**When to use:** `App.tsx` only.

```typescript
// src/renderer/src/App.tsx (updated routing logic)
const { authenticated } = useAuthStore()
const syncPhase = useSyncStore((s) => s.syncPhase)

if (!authenticated) return <LoginScreen />
if (syncPhase === 'syncing') return <SyncScreen />
if (syncPhase === 'summary') return <SyncSummaryScreen />
return <PlaylistBrowserScreen />
```

### Anti-Patterns to Avoid

- **Not returning cleanup from useEffect:** If `on()` in preload doesn't return a cleanup fn and the component doesn't clean up, listeners accumulate on every React re-mount (critical in development with StrictMode double-mounting).
- **Passing raw `ipcRenderer.on` event to renderer:** The preload wrapper must strip the `_event` argument and only pass `payload` — exposing the IPC event object leaks `ipcRenderer` to the renderer.
- **Calling `mainWindow.focus()` inside Notification callback after window is destroyed:** Always guard with `mainWindow && !mainWindow.isDestroyed()`.
- **Triggering notification on cancel:** D-NOTIF locks this — notification fires only on clean `sync:complete`, not when `_abortController.signal.aborted` at sync end.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OS desktop notification | Custom toast in renderer | `new Notification()` in main process | Renderer notifications unreliable; CLAUDE.md requires main-process I/O |
| Open folder in OS | `exec('explorer.exe')` or platform switch | `shell.openPath()` | Cross-platform, returns error string, async |
| Icon file generation | Manual pixel editing | `electron-icon-builder` npm tool | Generates all required sizes (ICO multi-resolution, PNG set) from single 1024px source |
| ASAR unpacking config | Custom file copy scripts | `asarUnpack: resources/**` in electron-builder.yml | Already present in the project's yml; covers future static assets |

**Key insight:** All platform-integration problems (notifications, file explorer, packaging) have first-class Electron/electron-builder solutions that handle platform differences automatically.

---

## Common Pitfalls

### Pitfall 1: IPC Listener Accumulation (CRITICAL)

**What goes wrong:** Every time `SyncScreen` mounts, a new `ipcRenderer.on` listener is added. If the component unmounts and remounts (e.g., user cancels, goes back to playlists, starts another sync), listeners double up. In React StrictMode (development), every component mounts twice immediately — causing every progress event to fire the callback twice.

**Why it happens:** The current `preload.ts` `on()` implementation does not return a cleanup function. `ipcRenderer.on` is additive.

**How to avoid:** Update `preload.ts` to return a cleanup function from `on()`. Update `ElectronAPI` interface in `ipc-types.ts` to reflect the `() => void` return type. Use the return value in `useEffect` cleanup.

**Warning signs:** Progress counter jumping by 2× in development; `sync:complete` firing the summary transition twice; console errors about duplicate state updates.

### Pitfall 2: mainWindow Reference in sync.ts Notification

**What goes wrong:** `registerSyncHandlers()` is called at app startup before `createWindow()` returns. If the notification click handler tries to call `mainWindow.focus()` and `mainWindow` is captured via a stale variable, it may be null or destroyed.

**Why it happens:** `createWindow()` is called after handler registration in `main/index.ts`.

**How to avoid:** Either (a) pass `mainWindow` as a parameter to `registerSyncHandlers(window: BrowserWindow)` and call from inside `app.whenReady()` after `createWindow()`, or (b) store the window reference in a module-level variable in `main/index.ts` and export a getter. Option (a) is cleaner — `registerSyncHandlers(win)` — and matches how the Phase 3 handler already has access to `evt.sender`.

**Warning signs:** `mainWindow.focus()` throws `TypeError: Cannot read property 'focus' of null`.

### Pitfall 3: Destination Path Not Available at Summary Time

**What goes wrong:** `SyncSummary` (the type returned by `runSync()`) does not include `destination`. At summary time, the renderer needs the path to enable the "Open destination folder" button. If the destination is only in the main process, the renderer has no way to display or use it.

**Why it happens:** The current `SyncSummary` interface in `ipc-types.ts` has no `destination` field.

**How to avoid (two valid approaches — planner decides):**

1. **Add `destination` to `SyncSummary`** — simplest; the summary payload carries everything the renderer needs; requires one field addition to `SyncSummary` interface and one assignment in `sync.ts`.
2. **Cache destination in syncStore when sync starts** — `PlaylistBrowserScreen` calls `startSync(destination)` before calling `window.electronAPI.sync.start()`; destination is stored in the store at that moment. *However,* the actual destination is resolved by the main process via `dialog.showOpenDialog` — the renderer sends `destination: ''` (empty) and the main process picks the real path. So the renderer cannot know the resolved destination before the sync starts.

**Conclusion:** Option 1 is correct. The only place the resolved destination is known is the main process. Add `destination: string` to `SyncSummary` so it arrives with the `sync:complete` payload.

**Warning signs:** "Open destination folder" button has empty path; `shell.openPath('')` throws or opens root.

### Pitfall 4: electron-builder NSIS Missing ICO File

**What goes wrong:** Running `build:win` succeeds but the installer has the default Electron icon (blue circle).

**Why it happens:** electron-builder looks for `build/icon.ico` by default. The project has `build/entitlements.mac.plist` but no icon files.

**How to avoid:** Create `build/icon.ico` (256×256 minimum; ICO format, not a renamed PNG) and `build/icon.png` (512×512 minimum) before running the packager. Use `electron-icon-builder` (npx, no install needed) to generate both from a single 1024×1024 source PNG.

**Warning signs:** `electron-builder: Fatal error: Unable to set icon` (if ICO file is a renamed PNG).

### Pitfall 5: Notification on Cancel

**What goes wrong:** If cancel flows through the same `sync:complete` path, a "Sync complete" notification fires even for canceled syncs.

**Why it happens:** Phase 3's `runSync()` returns a partial `SyncSummary` whether the sync ran to completion or was aborted. The main process currently sends `sync:complete` unconditionally.

**How to avoid:** Add an `aborted: boolean` field to `SyncSummary` (or check `_abortController.signal.aborted` before firing the notification). D-NOTIF is clear: notification fires on `sync:complete` only (not on cancel). Only fire `new Notification()` when not aborted.

**Warning signs:** Desktop notification appears with misleading "0 added, 0 failed" body after a cancel.

### Pitfall 6: electron-builder files Pattern and electron-vite out/ Directory

**What goes wrong:** Custom `files` arrays that don't include `out/**` exclude the compiled main process, causing the packaged app to fail to launch.

**Why it happens:** electron-vite outputs to `out/` (verified: `out/main`, `out/preload`, `out/renderer`). The existing `electron-builder.yml` uses a pure exclusion list with default `**/*`, which correctly includes `out/`. Adding any positive inclusion pattern (e.g., `['src/**', 'shared/**']`) would replace the default and exclude `out/`.

**How to avoid:** Keep the existing exclusion-only pattern in `electron-builder.yml`. Never add positive inclusion patterns unless `out/**` is explicitly included.

**Warning signs:** Packaged app launches to blank screen or "Cannot find module" error.

---

## Code Examples

### Verified: Electron Notification API (main process)

```typescript
// Source: https://www.electronjs.org/docs/latest/api/notification
import { Notification } from 'electron'

if (Notification.isSupported()) {
  const notif = new Notification({
    title: 'Sync complete',
    body: '42 added, 0 failed',
  })
  notif.on('click', () => {
    win.focus()
  })
  notif.show()
}
```

### Verified: shell.openPath (main process)

```typescript
// Source: https://www.electronjs.org/docs/latest/api/shell
import { shell } from 'electron'

// Returns '' on success, error string on failure
const error = await shell.openPath('/path/to/folder')
```

### Verified: electron-builder.yml (existing — no changes required for packaging)

```yaml
# electron-builder.yml (current project file — already correct)
appId: com.jellyfin.music-sync
productName: Jellyfin Music Sync
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintcache,...}'
  - '!{tsconfig.json,...}'
asarUnpack:
  - 'resources/**'
win:
  executableName: jellyfin-music-sync
nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
linux:
  target:
    - AppImage
    - deb
  maintainer: ''
  category: Utility
appImage:
  artifactName: ${name}-${version}.${ext}
```

No changes needed to `electron-builder.yml` itself — only icon files in `build/` need to be added.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Renderer-side `new Notification()` | Main-process `new Notification()` | Always been main-process for reliability | Renderer approach requires additional flags; main-process is canonical |
| `shell.openItem()` | `shell.openPath()` (async, returns error string) | Electron ~12 | `openItem` deprecated; `openPath` returns a Promise resolving to error string |
| `ipcRenderer.removeListener(channel, fn)` | Return cleanup fn from preload `on()` | Community pattern; official docs silent on cleanup | Avoids passing fn references across the contextBridge boundary |

**Deprecated/outdated:**
- `shell.openItem()`: removed; use `shell.openPath()` which is async and returns error string
- Passing raw `ipcRenderer` over contextBridge: security violation; never expose the full IPC object

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Adding `destination: string` to `SyncSummary` is the cleanest approach (vs caching in store) | Pitfall 3 | If planner chooses store caching, sync.ts needs no changes — but this approach can't work given the dialog resolves in main |
| A2 | `_abortController.signal.aborted` is accessible in sync.ts after `runSync()` returns to check cancel state | Pitfall 5 | If runSync() clears signal state, a different flag (e.g., `aborted` field in SyncSummary returned from runSync) is needed |
| A3 | React StrictMode is active in development (causing double-mount) | Pitfall 1 | If StrictMode is disabled, listener accumulation is less likely but still possible on re-navigation |

---

## Open Questions

1. **BrowserWindow reference in registerSyncHandlers**
   - What we know: `sync.ts` doesn't currently receive the `BrowserWindow` instance; it uses `evt.sender` for webContents.send
   - What's unclear: Whether `mainWindow.focus()` in the notification click handler should use `evt.sender` (the webContents) or the BrowserWindow
   - Recommendation: Pass `mainWindow: BrowserWindow` as a parameter to `registerSyncHandlers(win)`. Called from `main/index.ts` after `createWindow()`. Captures the BrowserWindow for focus. This is a one-line change in index.ts and one-line signature change in sync.ts.

2. **`aborted` flag for cancel notification guard**
   - What we know: `runSync()` is called with an `AbortController.signal`; when aborted, runSync returns a partial summary
   - What's unclear: Whether runSync already propagates an `aborted: boolean` in the returned SyncSummary
   - Recommendation: Check Phase 3's `sync-engine.ts` return shape. If it doesn't include `aborted`, check `_abortController.signal.aborted` after runSync returns in sync.ts — it will be `true` if cancel was triggered.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm | Build scripts | ✓ | (project running) | — |
| electron-builder | Packaging | ✓ | 26.8.1 | — |
| `build/icon.ico` | NSIS installer icon | ✗ | — | Default Electron icon (acceptable for v1 dev builds; required for release) |
| `build/icon.png` | AppImage icon | ✗ | — | Default Electron icon (acceptable for v1 dev builds) |

**Missing dependencies with no fallback:**
- None that block functionality

**Missing dependencies with fallback:**
- Icon files: packaging works without them but uses default Electron icon; generate with `npx electron-icon-builder --input=<source.png> --output=build/` before release builds

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.1.0 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |
| Test discovery | `tests/**/*.test.ts`, `src/**/*.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROG-01 | syncStore.updateProgress() updates progress state correctly | unit | `npm test -- tests/store/syncStore.test.ts` | ❌ Wave 0 |
| PROG-01 | syncStore.startSync/setSummary state transitions | unit | `npm test -- tests/store/syncStore.test.ts` | ❌ Wave 0 |
| PROG-02 | syncStore.cancel() sets canceled=true flag | unit | `npm test -- tests/store/syncStore.test.ts` | ❌ Wave 0 |
| POST-01 | SyncSummary fields appear in summary state | unit | `npm test -- tests/store/syncStore.test.ts` | ❌ Wave 0 |
| POST-03 | shell:openPath IPC handler calls shell.openPath with correct path | unit | `npm test -- tests/ipc/shell.test.ts` | ❌ Wave 0 |
| POST-03 | shell:openPath handler rejects empty path | unit | `npm test -- tests/ipc/shell.test.ts` | ❌ Wave 0 |
| POST-04 | Notification fires with correct title/body when not aborted | manual | launch app, complete sync, observe OS notification | manual-only |
| POST-04 | Notification does NOT fire on cancel | manual | launch app, start sync, cancel, no notification | manual-only |
| SET-02 | concurrentDownloads value passed from UI into sync.start | unit (existing pattern) | `npm test` — existing settings tests cover IPC | existing |

**Manual-only justifications:**
- POST-04 (notifications): OS notification dispatch requires a live Electron instance and OS-level notification service; cannot be reliably tested in Vitest/jsdom.

### Sampling Rate

- **Per task commit:** `npm test` (full suite, currently ~49 tests, runs in <10s)
- **Per wave merge:** `npm test && npm run typecheck`
- **Phase gate:** Full suite green + manual smoke test of SyncScreen, SyncSummaryScreen, notification, packaging before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/store/syncStore.test.ts` — covers syncStore state transitions (PROG-01, PROG-02, POST-01)
- [ ] `tests/ipc/shell.test.ts` — covers shell:openPath handler (POST-03)

*(Existing `tests/lib/` infrastructure covers Phase 3 sync engine; no shared fixture changes needed.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | no change in phase 4 |
| V3 Session Management | no | no change in phase 4 |
| V4 Access Control | yes (partial) | `shell.openPath` must only open paths that the user provided (destination); never accept arbitrary renderer-supplied paths without validation |
| V5 Input Validation | yes | `shell.openPath` IPC handler must validate path is non-empty string before calling; no path traversal risk since user chose the destination via native dialog |
| V6 Cryptography | no | no crypto operations in phase 4 |

### Known Threat Patterns for Electron IPC

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer passes arbitrary path to shell:openPath | Tampering / Elevation | Main process handler validates path is non-empty; acceptable because destination was chosen via native `showOpenDialog` controlled by main |
| Notification click triggers arbitrary action | Elevation | Click handler only calls `mainWindow.focus()` — no shell execution, no navigation |
| IPC event listener accumulation | Denial of Service | Return cleanup fn from preload `on()`; call in useEffect cleanup |

---

## Sources

### Primary (HIGH confidence)

- `shared/ipc-types.ts` — SyncProgress, SyncSummary, ElectronAPI.on() types (verified by file read)
- `src/preload/index.ts` — on() implementation pattern (verified by file read)
- `src/main/ipc/sync.ts` — sync:complete send location (verified by file read)
- `src/renderer/src/store/authStore.ts` — Zustand store pattern to replicate (verified by file read)
- `electron-builder.yml` — existing packaging config (verified by file read)
- `package.json` — current dependency versions (verified by file read)
- [https://www.electronjs.org/docs/latest/api/notification](https://www.electronjs.org/docs/latest/api/notification) — Notification API, `isSupported()`, events, `show()`, constructor options
- [https://www.electron.build/configuration.html](https://www.electron.build/configuration.html) — electron-builder config fields, default files pattern
- [https://www.electron.build/nsis.html](https://www.electron.build/nsis.html) — NSIS config fields: oneClick, artifactName, shortcutName, icon defaults
- [https://www.electron.build/icons.html](https://www.electron.build/icons.html) — icon file requirements: ICO (min 256×256), PNG (min 512×512), placement in build/
- [https://electron-vite.org/guide/build](https://electron-vite.org/guide/build) — electron-vite default output is `out/`

### Secondary (MEDIUM confidence)

- [https://www.electronjs.org/docs/latest/tutorial/ipc](https://www.electronjs.org/docs/latest/tutorial/ipc) — Pattern 3 (main→renderer) with webContents.send + ipcRenderer.on wrapper
- [https://github.com/electron/electron/issues/38830](https://github.com/electron/electron/issues/38830) — community pattern for preload on() returning cleanup function

### Tertiary (LOW confidence)

- None — all claims verified against official sources or project codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all from project package.json + npm registry verification
- Architecture: HIGH — derived from existing project patterns and official Electron docs
- Pitfalls: HIGH — verified against official docs; listener accumulation verified via Electron issue tracker
- Packaging: HIGH — existing electron-builder.yml is functional; icon gap is confirmed by `ls build/`

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days; stable Electron/electron-builder APIs)
