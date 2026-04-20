# Phase 1: Foundation - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 13 new files (greenfield — no existing src/ code)
**Analogs found:** 0 / 13 (no codebase to scan; patterns sourced from RESEARCH.md and official documentation)

---

## Greenfield Notice

This project has no existing `src/` code. The scaffold (`npm create @quick-start/electron@latest . -- --template react-ts`) has not been run yet. All patterns in this document are derived from:

1. Official Electron documentation (contextBridge, ipcMain.handle, ipcRenderer.invoke)
2. electron-conf GitHub README (alex8088/electron-conf)
3. electron-vite project structure conventions
4. Tailwind CSS v4 Vite plugin documentation
5. RESEARCH.md verified patterns (2026-04-20)

**Phase 1 establishes ALL patterns** that Phases 2–4 will follow. There are no prior-art analogs in the repo.

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `electron.vite.config.ts` | config | — | none (greenfield) | no match |
| `shared/ipc-types.ts` | shared types | — | none (greenfield) | no match |
| `src/main/index.ts` | main-process entry | request-response | none (greenfield) | no match |
| `src/main/ipc/settings.ts` | main-process IPC handler | request-response (CRUD) | none (greenfield) | no match |
| `src/main/ipc/stubs.ts` | main-process IPC stubs | request-response | none (greenfield) | no match |
| `src/main/lib/store.ts` | main-process service | CRUD | none (greenfield) | no match |
| `src/main/lib/logger.ts` | main-process utility | file-I/O (append-only) | none (greenfield) | no match |
| `src/main/lib/fs-utils.ts` | main-process utility | file-I/O + transform | none (greenfield) | no match |
| `src/preload/index.ts` | preload bridge | request-response | none (greenfield) | no match |
| `src/renderer/src/App.tsx` | renderer component | request-response | none (greenfield) | no match |
| `src/renderer/src/assets/main.css` | renderer stylesheet | — | none (greenfield) | no match |
| `tests/lib/fs-utils.test.ts` | test | transform | none (greenfield) | no match |
| `vitest.config.ts` | config | — | none (greenfield) | no match |

---

## Pattern Assignments

### `electron.vite.config.ts` (config)

**Source:** RESEARCH.md Pattern 5 — Tailwind CSS v4 in electron-vite
**Note:** `externalizeDepsPlugin()` is deprecated in electron-vite 5.0 — use the `build.externalizeDeps` config option instead. RESEARCH.md §State-of-the-Art confirms this.

**Complete file pattern:**
```typescript
// electron.vite.config.ts
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

**Critical rules:**
- `tailwindcss()` plugin belongs ONLY in the `renderer` block — never in `main` or `preload`
- Do NOT add `externalizeDepsPlugin()` import — deprecated in v5
- `electron-conf` must NOT be in `externalizeDeps.exclude` — it is dual CJS+ESM and works without special treatment

---

### `shared/ipc-types.ts` (shared types)

**Source:** RESEARCH.md Pattern 1 — Typed IPC with contextBridge; CONTEXT.md §Specific Ideas
**Note:** This file has no runtime code — pure TypeScript interfaces only. It is the single source of truth for all IPC channel names and payload shapes across all 4 phases.

**Complete file pattern:**
```typescript
// shared/ipc-types.ts

export interface Settings {
  lastDestination: string
  concurrentDownloads: number  // 1–5, default 3
}

export interface AuthResult {
  userId: string
  accessToken: string
  serverId: string
  serverName: string
}

export interface SyncOptions {
  playlistIds: string[]
  destination: string
  concurrentDownloads: number
}

export interface SyncProgress {
  playlistId: string
  trackId: string
  trackName: string
  current: number
  total: number
  bytesDownloaded: number
  bytesTotal: number
  status: 'downloading' | 'complete' | 'error'
  error?: string
}

export interface ElectronAPI {
  // Phase 1 — implemented
  settings: {
    get(): Promise<Settings>
    set(s: Partial<Settings>): Promise<void>
    getLogPath(): Promise<string>
  }
  // Phase 2 stubs — throw 'Not implemented: <channel>' on call
  auth: {
    login(url: string, user: string, pass: string): Promise<AuthResult>
    logout(): Promise<void>
    getStatus(): Promise<{ connected: boolean; serverName?: string }>
  }
  // Phase 3 stubs
  sync: {
    start(opts: SyncOptions): Promise<void>
    cancel(): void
    getPlaylists(): Promise<Array<{ id: string; name: string; trackCount: number }>>
  }
  // Phase 4 stubs — event subscription
  on(event: 'sync:progress', cb: (p: SyncProgress) => void): void
  on(event: 'sync:complete', cb: (summary: { added: number; removed: number; unchanged: number }) => void): void
  on(event: 'sync:error', cb: (err: { message: string }) => void): void
}
```

**Augment `Window` interface pattern (add to bottom of file or in a separate `src/renderer/src/env.d.ts`):**
```typescript
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

**Import path convention:** Main imports as `'../../shared/ipc-types'`; preload imports as `'../../shared/ipc-types'`; renderer imports as `'../../../shared/ipc-types'` (or via tsconfig path alias `@shared/ipc-types`).

---

### `src/main/index.ts` (main-process entry, request-response)

**Source:** Official Electron docs — BrowserWindow creation with security flags; RESEARCH.md §Architecture Rules

**Core BrowserWindow pattern:**
```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerSettingsHandlers } from './ipc/settings'
import { registerStubs } from './ipc/stubs'
import { log } from './lib/logger'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 320,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,     // MANDATORY — never disable
      nodeIntegration: false,     // MANDATORY — never disable
      sandbox: true,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerSettingsHandlers()
  registerStubs()
  log('INFO', 'App started')
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

**Security mandate:** `contextIsolation: true` and `nodeIntegration: false` must appear on every BrowserWindow. Never remove them.

---

### `src/main/ipc/settings.ts` (main-process IPC handler, CRUD)

**Source:** RESEARCH.md Pattern 2 (electron-conf store); RESEARCH.md §Code Examples (electron-conf store, ipcMain.handle)

**Complete handler pattern:**
```typescript
// src/main/ipc/settings.ts
import { ipcMain } from 'electron'
import { store } from '../lib/store'
import { getLogPath } from '../lib/logger'
import type { Settings } from '../../../shared/ipc-types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (): Settings => {
    return store.store
  })

  ipcMain.handle('settings:set', (_evt, partial: Partial<Settings>): void => {
    // Clamp concurrentDownloads in handler regardless of schema validation behavior
    if (partial.concurrentDownloads !== undefined) {
      partial = {
        ...partial,
        concurrentDownloads: Math.max(1, Math.min(5, partial.concurrentDownloads)),
      }
    }
    store.set(partial)
  })

  ipcMain.handle('settings:getLogPath', (): string => {
    return getLogPath()
  })
}
```

**Key rules:**
- All `store.*` calls live in main process only — never in preload or renderer
- Clamp `concurrentDownloads` in the handler (not relying solely on schema validation)
- Return full `Settings` object from `settings:get` (not partial)

---

### `src/main/ipc/stubs.ts` (main-process IPC stubs, request-response)

**Source:** RESEARCH.md Pattern 1 — `registerStubs()` example; CONTEXT.md D-06

**Complete stub pattern:**
```typescript
// src/main/ipc/stubs.ts
import { ipcMain } from 'electron'

// Channels implemented in Phase 2
const PHASE2_CHANNELS = [
  'auth:login',
  'auth:logout',
  'auth:getStatus',
]

// Channels implemented in Phase 3
const PHASE3_CHANNELS = [
  'sync:start',
  'sync:cancel',
  'sync:getPlaylists',
]

// All stub channels combined
const ALL_STUB_CHANNELS = [...PHASE2_CHANNELS, ...PHASE3_CHANNELS]

export function registerStubs(): void {
  for (const channel of ALL_STUB_CHANNELS) {
    ipcMain.handle(channel, () => {
      throw new Error(`Not implemented: ${channel}`)
    })
  }
}
```

**Critical rule (D-06):** Stubs MUST throw — silent `return null` or `return undefined` is forbidden. Callers must get a clear error on accidental early invocation.

---

### `src/main/lib/store.ts` (main-process service, CRUD)

**Source:** RESEARCH.md Pattern 2 — electron-conf Typed Settings Store; RESEARCH.md §Code Examples

**Complete store pattern:**
```typescript
// src/main/lib/store.ts
import { Conf } from 'electron-conf/main'
import type { Settings } from '../../../shared/ipc-types'

const schema = {
  type: 'object',
  properties: {
    lastDestination: { type: 'string' },
    concurrentDownloads: { type: 'number', minimum: 1, maximum: 5 },
  },
  required: ['lastDestination', 'concurrentDownloads'],
} as const

const defaults: Settings = {
  lastDestination: '',
  concurrentDownloads: 3,
}

export const store = new Conf<Settings>({ schema, defaults })
```

**Import path:** `'electron-conf/main'` — not `'electron-conf'` bare. The `/main` subpath is required for CJS main process context.

**Anti-pattern:** Do NOT use `electron-store`. It is ESM-only and causes `ERR_REQUIRE_ESM` in electron-vite's CJS main process bundle.

---

### `src/main/lib/logger.ts` (main-process utility, file-I/O append-only)

**Source:** RESEARCH.md Pattern 6 — Debug Logging

**Complete logger pattern:**
```typescript
// src/main/lib/logger.ts
import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const logDir = app.getPath('logs')
const logPath = join(logDir, 'app.log')

mkdirSync(logDir, { recursive: true })

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`
  appendFileSync(logPath, line, 'utf-8')
}

export function getLogPath(): string {
  return logPath
}
```

**Critical rule:** `app.getPath('logs')` is main-process-only. The renderer gets the log path by calling `window.electronAPI.settings.getLogPath()` — never by calling `app.getPath` directly.

**Log format:** Plaintext lines — `[ISO-8601] [LEVEL] message\n`. One line per entry. No JSON structure needed for Phase 1.

---

### `src/main/lib/fs-utils.ts` (main-process utility, file-I/O + transform)

**Source:** RESEARCH.md Pattern 3 (FAT32 sanitization) and Pattern 4 (atomic manifest write)

**Complete utility pattern:**
```typescript
// src/main/lib/fs-utils.ts
import sanitize from 'sanitize-filename'
import { writeFileSync, renameSync, readFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

/**
 * Sanitize a single path segment for FAT32 compatibility.
 * Apply PER SEGMENT — not to full paths containing slashes.
 *
 * Handles:
 * - Illegal characters: \ / : * ? " < > | and control chars 0x00–0x1F
 * - Windows reserved names: CON, PRN, AUX, NUL, COM0–COM9, LPT0–LPT9
 *   (including variants with extensions: NUL.mp3, CON.flac)
 * - Trailing dots and trailing spaces
 * - 255-byte length limit (sanitize-filename enforces this)
 *
 * Returns '_' for empty or all-whitespace input.
 */
export function sanitizePathSegment(segment: string): string {
  const sanitized = sanitize(segment, { replacement: '_' })
  if (!sanitized || sanitized.trim() === '') {
    return '_'
  }
  return sanitized
}

/**
 * Write JSON atomically: write to <path>.tmp, then rename to final path.
 * The .tmp file is always in the same directory as the target to avoid
 * EXDEV (cross-device rename) errors.
 */
export function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  // renameSync is atomic on same-volume writes.
  // .tmp is always co-located with target — EXDEV cannot occur.
  renameSync(tmpPath, filePath)
}

/**
 * Read and parse a JSON file, returning fallback on any error.
 * Wraps parse in try/catch to handle corrupt or missing files.
 */
export function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
```

**Test cases that MUST pass for `sanitizePathSegment` (required by CLAUDE.md):**

| Input | Expected Output | Rule |
|-------|----------------|------|
| `'AC/DC'` | `'AC_DC'` | Forward slash stripped |
| `'CON'` | not `'CON'` | Reserved name |
| `'NUL.flac'` | not `'NUL.flac'` | Reserved name with extension |
| `'CON.mp3'` | not `'CON.mp3'` | Reserved name with extension |
| `'...And Justice For All'` | `'...And Justice For All'` | Leading dots preserved |
| `'track   '` | `'track'` | Trailing spaces stripped |
| `''` | `'_'` | Empty string fallback |
| `'   '` | `'_'` | Whitespace-only fallback |

---

### `src/preload/index.ts` (preload bridge, request-response)

**Source:** RESEARCH.md Pattern 1 — Typed IPC with contextBridge

**Complete preload pattern:**
```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../../shared/ipc-types'

const api: ElectronAPI = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (s) => ipcRenderer.invoke('settings:set', s),
    getLogPath: () => ipcRenderer.invoke('settings:getLogPath'),
  },
  auth: {
    login: (url, user, pass) => ipcRenderer.invoke('auth:login', url, user, pass),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getStatus: () => ipcRenderer.invoke('auth:getStatus'),
  },
  sync: {
    start: (opts) => ipcRenderer.invoke('sync:start', opts),
    cancel: () => ipcRenderer.send('sync:cancel'),
    getPlaylists: () => ipcRenderer.invoke('sync:getPlaylists'),
  },
  on: (event, cb) => {
    ipcRenderer.on(event, (_evt, payload) => cb(payload))
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
```

**Critical rules:**
- Never `exposeInMainWorld('ipcRenderer', ipcRenderer)` — only expose the typed wrapper
- Use `ipcRenderer.invoke` for all request-response calls (returns Promise)
- Use `ipcRenderer.send` only for fire-and-forget (sync:cancel)
- The `api` object must satisfy the full `ElectronAPI` type — TypeScript will catch missing channels

---

### `src/renderer/src/App.tsx` (renderer component, request-response)

**Source:** CONTEXT.md §Specific Ideas (dev panel layout); RESEARCH.md §Architecture Patterns

**Dev panel layout:**
```
+---------------------------------+
| Jellyfin Music Sync  v0.1.0-dev |
+---------------------------------+
| Settings                        |
|  Last folder: [not set]         |
|  Concurrent downloads: [3]  [+] |
|                                 |
| Debug log: %APPDATA%/jms/...    |
+---------------------------------+
```

**Component pattern:**
```typescript
// src/renderer/src/App.tsx
import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/ipc-types'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [logPath, setLogPath] = useState<string>('')

  useEffect(() => {
    window.electronAPI.settings.get().then(setSettings)
    window.electronAPI.settings.getLogPath().then(setLogPath)
  }, [])

  const adjustConcurrent = async (delta: number) => {
    if (!settings) return
    const next = Math.max(1, Math.min(5, settings.concurrentDownloads + delta))
    await window.electronAPI.settings.set({ concurrentDownloads: next })
    setSettings((prev) => prev ? { ...prev, concurrentDownloads: next } : prev)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
      <div className="border border-gray-600 rounded p-6 w-80 space-y-4">
        <div className="flex justify-between items-center border-b border-gray-600 pb-2">
          <span className="font-semibold">Jellyfin Music Sync</span>
          <span className="text-gray-400 text-sm">v0.1.0-dev</span>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-300">Settings</p>
          <p className="text-sm">
            Last folder:{' '}
            <span className="text-gray-400">
              {settings?.lastDestination || '[not set]'}
            </span>
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span>Concurrent downloads:</span>
            <button
              onClick={() => adjustConcurrent(-1)}
              className="px-2 py-0.5 border border-gray-500 rounded hover:bg-gray-700"
            >
              –
            </button>
            <span className="w-4 text-center">{settings?.concurrentDownloads ?? 3}</span>
            <button
              onClick={() => adjustConcurrent(1)}
              className="px-2 py-0.5 border border-gray-500 rounded hover:bg-gray-700"
            >
              +
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-500 border-t border-gray-600 pt-2 break-all">
          Debug log: {logPath}
        </div>
      </div>
    </div>
  )
}
```

**Key rules:**
- All data fetched via `window.electronAPI.*` — no direct Node or Electron imports
- State updates optimistically but await IPC before updating local state
- `window.electronAPI` is typed via the `Window` interface augmentation in `shared/ipc-types.ts` or `env.d.ts`

---

### `src/renderer/src/assets/main.css` (renderer stylesheet)

**Source:** RESEARCH.md Pattern 5 — Tailwind CSS v4 in electron-vite

**Complete file pattern:**
```css
/* src/renderer/src/assets/main.css */
@import "tailwindcss";
```

**That's the entire file.** Tailwind v4 with `@tailwindcss/vite` does not need:
- `tailwind.config.js`
- `postcss.config.js`
- `@tailwind base/components/utilities` directives
- A `content` array

---

### `tests/lib/fs-utils.test.ts` (test, transform)

**Source:** RESEARCH.md Pattern 7 — Vitest Configuration; RESEARCH.md Pattern 3 (required test cases)

**Test file structure pattern:**
```typescript
// tests/lib/fs-utils.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join, tmpdir } from 'path'
import { sanitizePathSegment, atomicWriteJson, safeReadJson } from '../../src/main/lib/fs-utils'

describe('sanitizePathSegment', () => {
  it('strips forward slash in AC/DC', () => {
    expect(sanitizePathSegment('AC/DC')).toBe('AC_DC')
  })

  it('does not return CON for reserved name CON', () => {
    expect(sanitizePathSegment('CON')).not.toBe('CON')
  })

  it('does not return NUL.flac for reserved name with extension', () => {
    expect(sanitizePathSegment('NUL.flac')).not.toBe('NUL.flac')
  })

  it('does not return CON.mp3 for reserved name with extension', () => {
    expect(sanitizePathSegment('CON.mp3')).not.toBe('CON.mp3')
  })

  it('preserves leading dots in ...And Justice For All', () => {
    const result = sanitizePathSegment('...And Justice For All')
    expect(result).toMatch(/^\.\.\./)
  })

  it('strips trailing spaces', () => {
    expect(sanitizePathSegment('track   ')).toBe('track')
  })

  it('returns _ for empty string', () => {
    expect(sanitizePathSegment('')).toBe('_')
  })

  it('returns _ for whitespace-only string', () => {
    expect(sanitizePathSegment('   ')).toBe('_')
  })
})

describe('atomicWriteJson / safeReadJson', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'jms-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('round-trips JSON data', () => {
    const filePath = join(tmpDir, 'data.json')
    const data = { foo: 'bar', n: 42 }
    atomicWriteJson(filePath, data)
    expect(safeReadJson(filePath, null)).toEqual(data)
  })

  it('returns fallback for missing file', () => {
    expect(safeReadJson(join(tmpDir, 'missing.json'), 'fallback')).toBe('fallback')
  })

  it('returns fallback for corrupt JSON', () => {
    const filePath = join(tmpDir, 'corrupt.json')
    atomicWriteJson(filePath, 'not-json-then-corrupted')
    // overwrite with corrupt content
    require('fs').writeFileSync(filePath, '{bad json', 'utf-8')
    expect(safeReadJson(filePath, null)).toBeNull()
  })

  it('creates intermediate directories', () => {
    const filePath = join(tmpDir, 'a', 'b', 'c', 'data.json')
    atomicWriteJson(filePath, { ok: true })
    expect(safeReadJson(filePath, null)).toEqual({ ok: true })
  })
})
```

**Key rule:** `sanitizePathSegment` and `atomicWriteJson` import only `sanitize-filename` and Node.js builtins — no `electron`. Tests run in `environment: 'node'` without launching Electron.

---

### `vitest.config.ts` (config)

**Source:** RESEARCH.md Pattern 7 — Vitest Configuration for Main Process Utilities

**Complete file pattern:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
```

---

## Shared Patterns

### contextIsolation + nodeIntegration Security Mandate

**Source:** CLAUDE.md §Architecture Rules
**Apply to:** `src/main/index.ts` (every BrowserWindow creation)

```typescript
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,   // MANDATORY
  nodeIntegration: false,   // MANDATORY
  sandbox: true,
}
```

Never disable these. This is enforced from the first commit and must never be changed.

---

### Atomic File Write Pattern

**Source:** RESEARCH.md Pattern 4
**Apply to:** `src/main/lib/fs-utils.ts` (`atomicWriteJson`); Phase 3 sync engine manifest writes

```typescript
const tmpPath = `${filePath}.tmp`   // same directory as target — no EXDEV
writeFileSync(tmpPath, content, 'utf-8')
renameSync(tmpPath, filePath)       // atomic on same volume
```

---

### IPC invoke vs send Convention

**Source:** RESEARCH.md Pitfall 4
**Apply to:** `src/preload/index.ts` and all future IPC additions

| Channel type | Method | Returns |
|---|---|---|
| Request-response (settings, auth, sync start) | `ipcRenderer.invoke` | `Promise<T>` |
| Fire-and-forget (sync cancel) | `ipcRenderer.send` | `void` |
| Main → Renderer push (progress events) | `ipcRenderer.on` | subscription |

---

### Stub Channel Error Convention

**Source:** CONTEXT.md D-06
**Apply to:** `src/main/ipc/stubs.ts`; all future stub registrations in Phases 2–4

```typescript
ipcMain.handle(channel, () => {
  throw new Error(`Not implemented: ${channel}`)
})
```

Never return `null`, `undefined`, or an empty object from a stub.

---

### FAT32 Per-Segment Sanitization

**Source:** CLAUDE.md §Critical Pitfalls; RESEARCH.md Pattern 3
**Apply to:** `src/main/lib/fs-utils.ts`; Phase 3 download path construction

```typescript
// CORRECT — apply per segment
const filePath = path.join(
  sanitizePathSegment(artist),
  sanitizePathSegment(album),
  sanitizePathSegment(filename),
)

// WRONG — never apply to a full path
const filePath = sanitizePathSegment(`${artist}/${album}/${filename}`)
```

---

## No Analog Found

All Phase 1 files are new (greenfield). The RESEARCH.md patterns above are the authoritative source for all implementations.

| File | Role | Reason |
|------|------|--------|
| All 13 files listed in File Classification | various | Greenfield project — no src/ directory exists. Scaffold not yet run. |

---

## Post-Scaffold Verification Checklist

After running `npm create @quick-start/electron@latest . -- --template react-ts`, verify:

1. `.planning/` directory still exists (scaffold must not overwrite it)
2. `CLAUDE.md` still exists
3. Generated `src/main/index.ts` uses `contextIsolation: true` (or is immediately replaced by the pattern above)
4. `shared/` directory does NOT exist — create it manually and add to tsconfig path aliases
5. `electron.vite.config.ts` exists — replace generated content with Phase 1 pattern above
6. `package.json` has `"type"` field — if present and set to `"module"`, verify electron-conf still works (it should, it is dual CJS+ESM)

---

## Metadata

**Analog search scope:** Entire project root (no src/ exists — nothing to scan)
**Files scanned:** 0 source files (greenfield)
**Pattern sources:** RESEARCH.md (2026-04-20), CONTEXT.md (2026-04-19), CLAUDE.md, official documentation
**Pattern extraction date:** 2026-04-20
