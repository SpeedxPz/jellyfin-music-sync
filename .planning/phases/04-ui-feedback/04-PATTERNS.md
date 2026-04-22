# Phase 4: UI & Feedback - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 11 (7 new, 4 modified)
**Analogs found:** 11 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/renderer/src/store/syncStore.ts` | store | event-driven | `src/renderer/src/store/authStore.ts` | exact |
| `src/renderer/src/screens/SyncScreen.tsx` | component/screen | event-driven | `src/renderer/src/screens/PlaylistBrowserScreen.tsx` | role-match |
| `src/renderer/src/screens/SyncSummaryScreen.tsx` | component/screen | request-response | `src/renderer/src/screens/PlaylistBrowserScreen.tsx` | role-match |
| `src/renderer/src/components/ProgressBar.tsx` | component | transform | `src/renderer/src/screens/LoginScreen.tsx` (spinner element) | partial |
| `src/renderer/src/App.tsx` | component/router | request-response | `src/renderer/src/App.tsx` (self — extend) | self |
| `src/renderer/src/screens/PlaylistBrowserScreen.tsx` | component/screen | CRUD | `src/renderer/src/screens/PlaylistBrowserScreen.tsx` (self — extend) | self |
| `src/main/ipc/sync.ts` | handler | request-response | `src/main/ipc/sync.ts` (self — extend) | self |
| `src/main/ipc/shell.ts` | handler | request-response | `src/main/ipc/settings.ts` | exact |
| `src/main/index.ts` | entry | request-response | `src/main/index.ts` (self — extend) | self |
| `src/preload/index.ts` | bridge | request-response | `src/preload/index.ts` (self — extend) | self |
| `shared/ipc-types.ts` | types/contract | — | `shared/ipc-types.ts` (self — extend) | self |

---

## Pattern Assignments

### `src/renderer/src/store/syncStore.ts` (store, event-driven)

**Analog:** `src/renderer/src/store/authStore.ts`

**Imports pattern** (authStore.ts lines 1–6):
```typescript
// src/renderer/src/store/authStore.ts
import { create } from 'zustand'
import type { AuthResult } from '../../../../shared/ipc-types'
```

**Core Zustand store shape** (authStore.ts lines 8–45):
```typescript
interface AuthState {
  authenticated: boolean
  userId: string | null
  // ... fields
  setAuthenticated: (result: ...) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  authenticated: false,
  userId: null,
  // ... initial values

  setAuthenticated: (result) =>
    set({
      authenticated: true,
      userId: result.userId,
      // ...
    }),

  clearAuth: () =>
    set({
      authenticated: false,
      userId: null,
      // ...
    }),
}))
```

**Adapt for syncStore** — replace interface and actions with:
```typescript
import type { SyncProgress, SyncSummary } from '../../../../shared/ipc-types'

type SyncPhase = 'idle' | 'syncing' | 'summary'

interface SyncState {
  syncPhase: SyncPhase
  canceled: boolean
  progress: SyncProgress | null
  summary: SyncSummary | null
  destination: string

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

---

### `src/renderer/src/screens/SyncScreen.tsx` (component/screen, event-driven)

**Analog:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx`

**Imports pattern** (PlaylistBrowserScreen.tsx lines 1–3):
```typescript
import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
```
Adapt: import `useSyncStore` from `../store/syncStore` instead.

**useEffect subscription pattern** — no existing analog in codebase; use the preload `on()` wrapper:
```typescript
// Mount: subscribe to push events; return cleanup to prevent listener accumulation.
// CRITICAL: on() must return () => void (preload fix required — see preload section).
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

**Loading spinner element** (PlaylistBrowserScreen.tsx lines 134–137):
```typescript
<div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
```

**Screen layout wrapper** (PlaylistBrowserScreen.tsx lines 91–103):
```typescript
<div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
  <header className="bg-gray-800 border-b border-gray-600 px-6 py-3 flex items-center justify-between">
    <span className="font-semibold">Jellyfin Music Sync</span>
    <button type="button" onClick={...} className="text-red-400 hover:text-red-300 text-sm">
      Cancel
    </button>
  </header>
  <main className="flex-1 flex flex-col p-6 gap-4">
    {/* content */}
  </main>
</div>
```

**Disabled button pattern** (PlaylistBrowserScreen.tsx lines 186–198):
```typescript
<button
  type="button"
  disabled={selectedCount === 0 || syncing}
  className={`bg-blue-600 text-white font-semibold py-2 w-full rounded transition-colors ${
    selectedCount === 0 || syncing ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-700'
  }`}
>
```

**Cancel handler pattern** (PlaylistBrowserScreen.tsx lines 55–73 for async handler structure):
```typescript
const handleCancel = () => {
  cancel()                                  // set canceled=true in syncStore
  window.electronAPI.sync.cancel()          // fire-and-forget — no await
}
```

---

### `src/renderer/src/screens/SyncSummaryScreen.tsx` (component/screen, request-response)

**Analog:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx`

**Screen layout wrapper** — same `bg-gray-900` + header pattern as SyncScreen above.

**Back to playlists button** — mirrors Logout button style (PlaylistBrowserScreen.tsx lines 95–100):
```typescript
<button
  type="button"
  onClick={reset}           // syncStore.reset() → syncPhase='idle' → App.tsx shows PlaylistBrowserScreen
  className="text-blue-400 hover:text-blue-300 text-sm"
>
  Back to playlists
</button>
```

**Inline error message** (PlaylistBrowserScreen.tsx lines 199–201):
```typescript
{syncError && (
  <p className="text-red-400 text-sm">{syncError}</p>
)}
```
Adapt for failure count row: `{summary.failed > 0 && (<p className="text-red-400 text-sm">...</p>)}`.

**Expandable failures toggle** — use local `useState` (no analog in codebase; standard React pattern):
```typescript
const [showFailures, setShowFailures] = useState(false)
// render:
{summary.failures.length > 0 && (
  <div>
    <button type="button" onClick={() => setShowFailures(v => !v)} className="text-sm text-gray-400 hover:text-gray-200">
      {showFailures ? 'Hide details ▴' : `✖ ${summary.failures.length} failed — show details ▾`}
    </button>
    {showFailures && (
      <ul className="mt-2 space-y-1">
        {summary.failures.map((f, i) => (
          <li key={i} className="text-sm text-red-400">• {f.name} — {f.reason}</li>
        ))}
      </ul>
    )}
  </div>
)}
```

**Open destination folder button** — same primary button style as "Sync Selected" (PlaylistBrowserScreen.tsx lines 186–195):
```typescript
<button
  type="button"
  onClick={() => window.electronAPI.shell.openPath(summary.destination)}
  className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 w-full rounded transition-colors"
>
  Open destination folder
</button>
```

---

### `src/renderer/src/components/ProgressBar.tsx` (component, transform)

**Analog:** Spinner element in `src/renderer/src/screens/PlaylistBrowserScreen.tsx` lines 134–137 (closest inline style element; no reusable component exists)

**Tailwind color/sizing tokens** in use across codebase:
- Track: `bg-gray-700`
- Fill: `bg-blue-500` (consistent with `accent-blue-500` used on checkboxes — PlaylistBrowserScreen.tsx line 162)
- Rounded: `rounded-full`

**Component implementation** (no existing analog — build from scratch using project Tailwind tokens):
```typescript
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

---

### `src/renderer/src/App.tsx` (component/router, request-response) — MODIFY

**Analog:** `src/renderer/src/App.tsx` (current file — extend the 2-state router)

**Current routing pattern** (App.tsx lines 1–36):
```typescript
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import LoginScreen from './screens/LoginScreen'
import PlaylistBrowserScreen from './screens/PlaylistBrowserScreen'

export default function App() {
  const { authenticated, setAuthenticated } = useAuthStore()

  useEffect(() => {
    window.electronAPI.auth.getStatus().then((status) => {
      if (status.connected) {
        setAuthenticated({ ... })
      }
    }).catch(() => {})
  }, [])

  return authenticated ? <PlaylistBrowserScreen /> : <LoginScreen />
}
```

**Extend to 3-state** — add these imports and change the return:
```typescript
import { useSyncStore } from './store/syncStore'
import SyncScreen from './screens/SyncScreen'
import SyncSummaryScreen from './screens/SyncSummaryScreen'

// Inside App():
const syncPhase = useSyncStore((s) => s.syncPhase)

// Replace single-line return with:
if (!authenticated) return <LoginScreen />
if (syncPhase === 'syncing') return <SyncScreen />
if (syncPhase === 'summary') return <SyncSummaryScreen />
return <PlaylistBrowserScreen />
```

---

### `src/renderer/src/screens/PlaylistBrowserScreen.tsx` — MODIFY

**Analog:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx` (self — add to existing)

**Existing mount pattern** (lines 23–34) — add settings read alongside playlist fetch:
```typescript
useEffect(() => {
  window.electronAPI.sync.getPlaylists()
    .then((data) => { setPlaylists(data); setLoading(false) })
    .catch((err) => { setError((err as Error).message); setLoading(false) })
}, [])
```
Extend to also call `window.electronAPI.settings.get()` in the same useEffect and set `concurrentDownloads` state.

**Existing header** (lines 93–102) — add downloads control inline:
```typescript
<header className="bg-gray-800 border-b border-gray-600 px-6 py-3 flex items-center justify-between">
  <span className="font-semibold">Jellyfin Music Sync</span>
  {/* Add between title and logout: */}
  <div className="flex items-center gap-2 text-sm text-gray-300">
    <span>Downloads:</span>
    <button type="button" onClick={() => setDownloads(v => Math.max(1, v - 1))} disabled={downloads <= 1} className="w-6 h-6 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-40">−</button>
    <span className="w-4 text-center">{downloads}</span>
    <button type="button" onClick={() => setDownloads(v => Math.min(5, v + 1))} disabled={downloads >= 5} className="w-6 h-6 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-40">+</button>
  </div>
  <button type="button" onClick={handleLogout} className="text-red-400 hover:text-red-300 text-sm">Log out</button>
</header>
```

**Existing sync call** (lines 55–73) — replace hardcoded `3` and add store transition:
```typescript
const handleSyncSelected = async () => {
  if (selected.size === 0) return
  startSync('')    // syncStore.startSync — transitions App to SyncScreen
  try {
    await window.electronAPI.sync.start({
      playlistIds: Array.from(selected),
      destination: '',
      concurrentDownloads: downloads,   // was hardcoded 3
      playlistNames: Object.fromEntries(
        playlists.filter((p) => selected.has(p.id)).map((p) => [p.id, p.name])
      ),
    })
  } catch (err) {
    // On error: reset sync state and show inline error
    reset()
    setSyncError((err as Error).message)
  }
}
```

---

### `src/main/ipc/sync.ts` — MODIFY

**Analog:** `src/main/ipc/sync.ts` (self — add notification + destination)

**Current complete-send pattern** (sync.ts lines 52–55):
```typescript
if (!evt.sender.isDestroyed()) {
  evt.sender.send('sync:complete', summary)
}
```

**Add before the send** — notification block (D-NOTIF, D-NOTIF-CLICK, Pitfall 2, Pitfall 5):
```typescript
import { ipcMain, dialog, Notification } from 'electron'
import type { BrowserWindow } from 'electron'

// Change signature to accept mainWindow:
export function registerSyncHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('sync:start', async (evt, opts: SyncOptions) => {
    // ... existing code unchanged up to after runSync() ...

    const summary = await runSync(...)

    // D-NOTIF: Fire notification only on clean complete (not cancel) — Pitfall 5
    if (!_abortController?.signal.aborted && Notification.isSupported()) {
      const body = summary.added === 0 && summary.failed === 0
        ? 'All tracks up to date'
        : `${summary.added} added, ${summary.failed} failed`
      const notif = new Notification({ title: 'Sync complete', body })
      // D-NOTIF-CLICK: focus window; guard against destroyed window — Pitfall 2
      notif.on('click', () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus()
      })
      notif.show()
    }

    // D-SUMMARY-DESTINATION: add destination to summary payload — Pitfall 3
    const summaryWithDest = { ...summary, destination }

    if (!evt.sender.isDestroyed()) {
      evt.sender.send('sync:complete', summaryWithDest)
    }
  })
```

---

### `src/main/ipc/shell.ts` (handler, request-response) — NEW

**Analog:** `src/main/ipc/settings.ts` (exact match — same `registerXHandlers()` export + `ipcMain.handle` pattern)

**Full handler pattern** (settings.ts lines 1–28):
```typescript
// src/main/ipc/settings.ts
import { ipcMain } from 'electron'
import { store } from '../lib/store'
import type { Settings } from '../../../shared/ipc-types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (): Settings => {
    return store.store
  })
  ipcMain.handle('settings:set', (_evt, partial: Partial<Settings>): void => {
    // ...
  })
}
```

**Adapt for shell.ts**:
```typescript
import { ipcMain, shell } from 'electron'

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openPath', async (_evt, path: string): Promise<void> => {
    if (!path) return
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
}
```

---

### `src/main/index.ts` — MODIFY

**Analog:** `src/main/index.ts` (self — add import + pass mainWindow)

**Current handler registration** (index.ts lines 40–54):
```typescript
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.jellyfin.music-sync')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerSettingsHandlers()
  registerAuthHandlers()
  registerPlaylistHandlers()
  registerSyncHandlers()      // ← change to registerSyncHandlers(win)
  registerStubs()
  log('INFO', 'App started')
  createWindow()              // ← createWindow() returns win; capture it
```

**Extend to**:
```typescript
import { registerShellHandlers } from './ipc/shell'

app.whenReady().then(() => {
  // ...existing registrations that don't need mainWindow...
  registerSettingsHandlers()
  registerAuthHandlers()
  registerPlaylistHandlers()
  registerShellHandlers()
  registerStubs()
  log('INFO', 'App started')

  const win = createWindow()
  registerSyncHandlers(win)   // must come AFTER createWindow() — Pitfall 2
```

---

### `src/preload/index.ts` — MODIFY

**Analog:** `src/preload/index.ts` (self — fix on() return type + add shell)

**Current on() implementation** (preload/index.ts lines 31–34):
```typescript
on: (event, cb) => {
  ipcRenderer.on(event, (_evt, payload) => cb(payload))
},
```

**Fix: return cleanup function** (Pitfall 1 — listener accumulation):
```typescript
on: (event, cb) => {
  const listener = (_evt: unknown, payload: unknown) => cb(payload as never)
  ipcRenderer.on(event, listener)
  return () => ipcRenderer.removeListener(event, listener)
},
```

**Add shell namespace** (same pattern as `settings`, `auth`, `sync` blocks — lines 9–28):
```typescript
shell: {
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
},
```

---

### `shared/ipc-types.ts` — MODIFY

**Analog:** `shared/ipc-types.ts` (self — three targeted additions)

**1. Add `destination` to SyncSummary** (currently lines 49–55 — Pitfall 3):
```typescript
export interface SyncSummary {
  added: number
  removed: number
  unchanged: number
  failed: number
  failures: Array<{ name: string; reason: string }>
  destination: string   // ADD — resolved path from main process; needed by summary screen (POST-03)
}
```

**2. Update `on()` overloads return type** (currently lines 90–93 — Pitfall 1):
```typescript
// Change all on() overloads from void to () => void:
on(event: 'sync:progress', cb: (p: SyncProgress) => void): () => void
on(event: 'sync:complete', cb: (summary: SyncSummary) => void): () => void
on(event: 'sync:error', cb: (err: { message: string }) => void): () => void
```

**3. Add `shell` to ElectronAPI** (after `sync` block, before `on` — line 88 area):
```typescript
// ── Phase 4: Shell (implemented in main/ipc/shell.ts) ────────────────────
shell: {
  /** Opens path in the OS file explorer. Rejects if path is invalid. */
  openPath(path: string): Promise<void>
}
```

---

## Shared Patterns

### Dark Gray Theme
**Source:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx` (lines 91, 93, 107)
**Apply to:** All new screen components (SyncScreen, SyncSummaryScreen)
```typescript
// Page wrapper:    className="min-h-screen bg-gray-900 text-gray-100 flex flex-col"
// Header bar:      className="bg-gray-800 border-b border-gray-600 px-6 py-3 flex items-center justify-between"
// Warning banner:  className="bg-yellow-900/40 border-y border-yellow-700 text-yellow-300 text-sm px-6 py-2"
// Main content:    className="flex-1 flex flex-col p-6 gap-4"
```

### Primary Action Button
**Source:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx` (lines 186–198)
**Apply to:** SyncSummaryScreen "Open destination folder" button, "Back to playlists" button
```typescript
<button
  type="button"
  disabled={condition}
  className={`bg-blue-600 text-white font-semibold py-2 w-full rounded transition-colors ${
    condition ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-700'
  }`}
>
```

### IPC invoke Pattern
**Source:** `src/preload/index.ts` (lines 10–13)
**Apply to:** `shell.openPath` in preload
```typescript
// All invoke-based calls use this exact form — no event arg to renderer:
methodName: (arg) => ipcRenderer.invoke('channel:name', arg),
```

### ipcMain.handle Registration
**Source:** `src/main/ipc/settings.ts` (lines 7–28)
**Apply to:** `src/main/ipc/shell.ts`
```typescript
export function registerXHandlers(): void {
  ipcMain.handle('x:method', async (_evt, arg: Type): Promise<ReturnType> => {
    // implementation
  })
}
```

### useEffect + async IPC on mount
**Source:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx` (lines 23–34)
**Apply to:** PlaylistBrowserScreen settings read addition; SyncScreen event subscriptions
```typescript
useEffect(() => {
  window.electronAPI.someMethod()
    .then((data) => setState(data))
    .catch((err) => setError((err as Error).message))
}, [])
```

### Inline error display
**Source:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx` (lines 199–201)
**Apply to:** SyncSummaryScreen error states
```typescript
{error && <p className="text-red-400 text-sm">{error}</p>}
```

---

## No Analog Found

All files have analogs in the codebase. No entries in this section.

---

## Metadata

**Analog search scope:** `src/renderer/src/`, `src/main/ipc/`, `src/preload/`, `shared/`
**Files read:** 9 source files
**Pattern extraction date:** 2026-04-21
