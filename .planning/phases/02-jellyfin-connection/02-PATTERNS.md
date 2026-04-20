# Phase 2: Jellyfin Connection - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 8 (5 new, 3 modified)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/main/ipc/auth.ts` | handler | request-response | `src/main/ipc/settings.ts` | role-match |
| `src/main/ipc/playlists.ts` | handler | request-response | `src/main/ipc/settings.ts` | role-match |
| `src/renderer/src/screens/LoginScreen.tsx` | component | request-response | `src/renderer/src/App.tsx` | role-match |
| `src/renderer/src/screens/PlaylistBrowserScreen.tsx` | component | request-response | `src/renderer/src/App.tsx` | role-match |
| `src/renderer/src/store/authStore.ts` | store | event-driven | `src/renderer/src/App.tsx` (useState pattern) | partial-match |
| `shared/ipc-types.ts` | types | — | `shared/ipc-types.ts` (self) | exact |
| `src/main/lib/store.ts` | config | — | `src/main/lib/store.ts` (self) | exact |
| `src/main/index.ts` | entry | — | `src/main/index.ts` (self) | exact |
| `electron.vite.config.ts` | config | — | `electron.vite.config.ts` (self) | exact |

---

## Pattern Assignments

### `src/main/ipc/auth.ts` (handler, request-response)

**Analog:** `src/main/ipc/settings.ts`

**Imports pattern** (`src/main/ipc/settings.ts` lines 1–5):
```typescript
import { ipcMain } from 'electron'
import { store } from '../lib/store'
import { getLogPath } from '../lib/logger'
import type { Settings } from '../../../shared/ipc-types'
```

**New file imports — extend the analog with these additions:**
```typescript
import { ipcMain, safeStorage } from 'electron'
import { store } from '../lib/store'
import { log } from '../lib/logger'
import type { AuthResult } from '../../../shared/ipc-types'
// NOTE: Exact @jellyfin/sdk subpaths must be confirmed after npm install.
// Assumption A1 in RESEARCH.md: helpers may be importable directly from '@jellyfin/sdk'.
import { getSystemApi } from '@jellyfin/sdk/...'
import { getUserApi } from '@jellyfin/sdk/...'
import { getSessionApi } from '@jellyfin/sdk/...'
import { createJellyfinApi, getApi, clearApi } from '../lib/jellyfin'
import axios from 'axios'
```

**Core handler registration pattern** (`src/main/ipc/settings.ts` lines 7–28):
```typescript
export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (): Settings => {
    return store.store
  })

  ipcMain.handle('settings:set', (_evt, partial: Partial<Settings>): void => {
    // ...validation, then:
    store.set(partial)
  })
}
```
Apply the same `export function registerAuthHandlers(): void { ... }` wrapper.
Each handler uses `ipcMain.handle(channel, async (_evt, ...args) => { ... })`.

**store.set / store.get usage** (`src/main/lib/store.ts` lines 18, `src/main/ipc/settings.ts` line 11):
```typescript
// Read full store object:
store.store
// Read single key (electron-conf supports .get(key)):
store.get('encryptedToken')
// Write partial merge:
store.set({ serverUrl: url, userId: '...', encryptedToken: '...' })
```

**Logging pattern** (`src/main/lib/logger.ts` lines 19–21):
```typescript
log('INFO', 'App started')
log('ERROR', 'Something failed')
// Levels: 'INFO' | 'WARN' | 'ERROR'
```

**Error handling:** Throw `new Error('Human-readable message')` from an `ipcMain.handle` callback — the renderer receives it as a rejected Promise. Catch Axios errors with `axios.isAxiosError(err)` before rethrowing. See RESEARCH.md Pattern 3 for full error variant logic.

**safeStorage timing constraint:** `safeStorage.encryptString()` and `safeStorage.decryptString()` must only be called inside `ipcMain.handle()` callbacks (which fire after `app.whenReady()`), never at module load time. See RESEARCH.md Pitfall 2.

---

### `src/main/ipc/playlists.ts` (handler, request-response)

**Analog:** `src/main/ipc/settings.ts`

**Imports pattern** — same structure as settings.ts, with Jellyfin additions:
```typescript
import { ipcMain } from 'electron'
import { getItemsApi } from '@jellyfin/sdk/...'
import { BaseItemKind } from '@jellyfin/sdk/generated-client'
import { getApi } from '../lib/jellyfin'
import { store } from '../lib/store'
```

**Core handler registration pattern** (`src/main/ipc/settings.ts` lines 7–28):
```typescript
export function registerPlaylistHandlers(): void {
  ipcMain.handle('sync:getPlaylists', async (): Promise<Array<{ id: string; name: string; trackCount: number }>> => {
    // ...paginated fetch loop (see RESEARCH.md Pattern 5)
  })
}
```

**Stub to replace** (`src/main/ipc/stubs.ts` line 16): `'sync:getPlaylists'` is currently in `PHASE3_CHANNELS` — move it to Phase 2 implementation by removing it from stubs and registering the real handler. Note: `'auth:login'`, `'auth:logout'`, `'auth:getStatus'` are in `PHASE2_CHANNELS` (lines 6–9).

---

### `src/renderer/src/screens/LoginScreen.tsx` (component, request-response)

**Analog:** `src/renderer/src/App.tsx`

**Imports pattern** (`src/renderer/src/App.tsx` lines 1–5):
```typescript
import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/ipc-types'
```
Extend with:
```typescript
import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import type { AuthResult } from '../../../shared/ipc-types'
```

**IPC call pattern** (`src/renderer/src/App.tsx` lines 13–21):
```typescript
window.electronAPI.settings
  .get()
  .then(setSettings)
  .catch((err) => console.error('settings:get failed', err))
```
For LoginScreen, use async form inside an event handler:
```typescript
try {
  const result = await window.electronAPI.auth.login(url, username, password)
  setAuthenticated(result)
} catch (err) {
  setError((err as Error).message)
}
```

**Tailwind styling conventions** (`src/renderer/src/App.tsx` lines 32–82):
```tsx
// Root container:
<div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
// Card wrapper:
<div className="border border-gray-600 rounded p-6 w-80 space-y-4">
// Section label:
<p className="text-sm font-medium text-gray-300">Label</p>
// Muted text:
<span className="text-gray-400">secondary</span>
// Button (enabled):
className="px-2 py-0.5 border border-gray-500 rounded hover:bg-gray-700"
// Button (disabled):
className="... disabled:opacity-40 disabled:cursor-not-allowed"
// Small footer text:
className="text-xs text-gray-500 border-t border-gray-600 pt-2"
```
Follow this dark-theme (bg-gray-900 base, gray-600 borders, gray-100 text) consistently.

**Local state pattern for loading/error** (`src/renderer/src/App.tsx` lines 8–10):
```typescript
const [settings, setSettings] = useState<Settings | null>(null)
const [logPath, setLogPath] = useState<string>('')
```
Apply same pattern for LoginScreen:
```typescript
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
```

**Inline error display (D-ERROR-DISPLAY):** Error renders below the Connect button as a `<p>` element, not a modal or toast. Fields stay populated — never clear them on error. Fields remain `value`-controlled inputs.

---

### `src/renderer/src/screens/PlaylistBrowserScreen.tsx` (component, request-response)

**Analog:** `src/renderer/src/App.tsx`

**Imports pattern:**
```typescript
import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
```

**useEffect IPC-on-mount pattern** (`src/renderer/src/App.tsx` lines 11–21):
```typescript
useEffect(() => {
  window.electronAPI.settings
    .get()
    .then(setSettings)
    .catch((err) => console.error('settings:get failed', err))
}, [])
```
Apply for playlist fetch on mount:
```typescript
useEffect(() => {
  window.electronAPI.sync
    .getPlaylists()
    .then(setPlaylists)
    .catch((err) => setError((err as Error).message))
}, [])
```

**Tailwind styling conventions:** Same dark theme as App.tsx (see LoginScreen section above). Use `space-y-2` for list items, `flex items-center gap-2` for checkbox rows.

**Multi-select state pattern** (`src/renderer/src/App.tsx` lines 8–10 as baseline):
```typescript
const [selected, setSelected] = useState<Set<string>>(new Set())
```
Toggle item: `setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })`

**Client-side filter (D-FILTER):**
```typescript
const [filter, setFilter] = useState('')
const visible = playlists.filter(p =>
  p.name.toLowerCase().includes(filter.toLowerCase())
)
```

---

### `src/renderer/src/store/authStore.ts` (store, event-driven)

**Analog:** `src/renderer/src/App.tsx` (useState pattern — no Zustand store exists yet)

There is no existing Zustand store in the codebase. Use RESEARCH.md Pattern 7 as the direct template.

**Imports pattern** (no existing analog — use RESEARCH.md):
```typescript
import { create } from 'zustand'
import type { AuthResult } from '../../../shared/ipc-types'
```

**Zustand store creation pattern** (RESEARCH.md Pattern 7):
```typescript
// Double-parentheses required for TypeScript inference with create<T>()()
export const useAuthStore = create<AuthState>()((set) => ({
  // initial state fields,
  // action functions that call set(...)
}))
```

**No persist middleware:** Token lives in main process electron-conf only. Renderer re-hydrates via `auth:getStatus` IPC on mount in `App.tsx`.

---

### `shared/ipc-types.ts` (types — modify existing)

**Analog:** `shared/ipc-types.ts` (self)

**Existing `AuthResult` interface** (lines 14–19):
```typescript
export interface AuthResult {
  userId: string
  accessToken: string
  serverId: string
  serverName: string
}
```
**Add two fields** (RESEARCH.md IPC Contract section):
```typescript
  displayName: string        // From AuthenticationResult.User.Name
  linuxPlaintextWarning: boolean  // true when safeStorage unavailable on Linux
```

**Existing `Settings` interface** (lines 9–12):
```typescript
export interface Settings {
  lastDestination: string
  concurrentDownloads: number
}
```
**Add five fields** (RESEARCH.md IPC Contract section):
```typescript
  serverUrl: string          // default: ''
  userId: string             // default: ''
  encryptedToken: string     // base64-encoded encrypted token (or plaintext on Linux)
  displayName: string        // default: ''
  serverName: string         // default: ''
```

---

### `src/main/lib/store.ts` (config — modify existing)

**Analog:** `src/main/lib/store.ts` (self)

**Existing pattern** (lines 1–18):
```typescript
import { Conf } from 'electron-conf/main'
import type { Settings } from '../../../shared/ipc-types'

const schema = {
  type: 'object',
  properties: {
    lastDestination: { type: 'string' },
    concurrentDownloads: { type: 'number', minimum: 1, maximum: 5 },
  },
} as const

const defaults: Settings = {
  lastDestination: '',
  concurrentDownloads: 3,
}

export const store = new Conf<Settings>({ schema, defaults })
```
**Extend `schema.properties`** with string entries for each new Settings field, and **extend `defaults`** with empty-string defaults for `serverUrl`, `userId`, `encryptedToken`, `displayName`, `serverName`.

The import `'electron-conf/main'` (not bare `'electron-conf'`) is mandatory — CJS main process requirement. Do not change it.

---

### `src/main/index.ts` (entry — modify existing)

**Analog:** `src/main/index.ts` (self)

**Existing handler registration pattern** (lines 37–47):
```typescript
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.jellyfin.music-sync')
  // ...
  registerSettingsHandlers()
  registerStubs()
  log('INFO', 'App started')
  createWindow()
})
```

**Phase 2 change — add new imports and registrations, remove replaced stubs:**
```typescript
import { registerAuthHandlers } from './ipc/auth'
import { registerPlaylistHandlers } from './ipc/playlists'

// Inside app.whenReady():
registerSettingsHandlers()
registerAuthHandlers()       // replaces PHASE2_CHANNELS stubs
registerPlaylistHandlers()   // replaces sync:getPlaylists stub
registerStubs()              // stubs.ts must have Phase 2 + getPlaylists channels removed
```

**Critical (Pitfall 6 in RESEARCH.md):** Registering a handler for a channel that already has a stub will throw `Error: Attempted to register a second handler for '...'`. Phase 2 stub channels (`auth:login`, `auth:logout`, `auth:getStatus`, `sync:getPlaylists`) must be removed from `stubs.ts` at the same time real handlers are added.

---

### `src/renderer/src/App.tsx` (entry — modify existing)

**Analog:** `src/renderer/src/App.tsx` (self)

**Existing structure** (lines 1–82): Phase 1 DevPanel. Replace the body entirely.

**Phase 2 pattern** (RESEARCH.md Pattern 8):
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
    })
  }, [])

  return authenticated ? <PlaylistBrowserScreen /> : <LoginScreen />
}
```

The `useState` + `useEffect` IPC call pattern from lines 8–21 of the existing App.tsx directly applies; replace the specific channel calls and state shape.

---

### `electron.vite.config.ts` (config — modify existing)

**Analog:** `electron.vite.config.ts` (self)

**Existing config** (lines 1–19):
```typescript
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
    },
  },
  renderer: {
    plugins: [tailwindcss(), react()],
  },
})
```

**Phase 2 change:** The `main.build.externalizeDeps: true` shorthand must become an object to add `exclude`. This is the critical ESM fix (RESEARCH.md Critical Build Configuration Change):
```typescript
main: {
  build: {
    externalizeDeps: {
      exclude: ['@jellyfin/sdk'],  // Bundle ESM-only SDK as CJS for main process
    },
  },
},
```
`preload` and `renderer` sections are unchanged.

---

## Shared Patterns

### IPC Handler Registration
**Source:** `src/main/ipc/settings.ts` lines 7–28
**Apply to:** `src/main/ipc/auth.ts`, `src/main/ipc/playlists.ts`
```typescript
export function register<Domain>Handlers(): void {
  ipcMain.handle('domain:action', async (_evt, ...args): Promise<ReturnType> => {
    // implementation
  })
  // additional handles...
}
```

### electron-conf Store Access
**Source:** `src/main/lib/store.ts` line 18; `src/main/ipc/settings.ts` lines 10–11, 20–22
**Apply to:** `src/main/ipc/auth.ts`, `src/main/ipc/playlists.ts`
```typescript
// Import (CJS main — mandatory subpath)
import { Conf } from 'electron-conf/main'
// Usage
store.store           // full object
store.get('key')      // single field
store.set({ ... })    // partial merge
```

### Logging
**Source:** `src/main/lib/logger.ts` lines 19–21; `src/main/index.ts` line 47
**Apply to:** `src/main/ipc/auth.ts`
```typescript
log('INFO', 'Login success: user=..., server=...')
log('ERROR', 'Login failed: ...')
// Levels: 'INFO' | 'WARN' | 'ERROR'
```

### IPC Type Import Path
**Source:** `src/main/ipc/settings.ts` line 5
**Apply to:** `src/main/ipc/auth.ts`, `src/main/ipc/playlists.ts`
```typescript
import type { Settings } from '../../../shared/ipc-types'
// Pattern: three-level up from src/main/ipc/ to project root, then shared/
```

### Renderer: useEffect IPC on Mount
**Source:** `src/renderer/src/App.tsx` lines 11–21
**Apply to:** `src/renderer/src/App.tsx` (Phase 2 replace), `src/renderer/src/screens/PlaylistBrowserScreen.tsx`
```typescript
useEffect(() => {
  window.electronAPI.someNamespace
    .someMethod()
    .then(setLocalState)
    .catch((err) => console.error('channel:name failed', err))
}, [])
```

### Renderer: Tailwind Dark Theme Base
**Source:** `src/renderer/src/App.tsx` lines 32–35
**Apply to:** `src/renderer/src/screens/LoginScreen.tsx`, `src/renderer/src/screens/PlaylistBrowserScreen.tsx`
```tsx
<div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
  <div className="border border-gray-600 rounded p-6 w-80 space-y-4">
    {/* content */}
  </div>
</div>
```

### Renderer: IPC Type Import Path
**Source:** `src/renderer/src/App.tsx` line 5
**Apply to:** All screen components, authStore
```typescript
import type { Settings } from '../../../shared/ipc-types'
// Pattern: three-level up from src/renderer/src/ to project root, then shared/
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/main/lib/jellyfin.ts` (implied new file) | service | request-response | No SDK wrapper module exists yet; use RESEARCH.md Pattern 1 directly |
| `src/renderer/src/store/authStore.ts` | store | event-driven | No Zustand store exists in codebase; use RESEARCH.md Pattern 7 directly |

---

## Metadata

**Analog search scope:** `src/main/ipc/`, `src/main/lib/`, `src/renderer/src/`, `shared/`, project root
**Files scanned:** 10
**Pattern extraction date:** 2026-04-20
