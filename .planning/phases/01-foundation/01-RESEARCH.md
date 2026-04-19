# Phase 1: Foundation - Research

**Researched:** 2026-04-20
**Domain:** Electron + electron-vite scaffold, typed IPC, electron-conf settings, FAT32 sanitization, atomic writes
**Confidence:** HIGH (most findings verified via official docs, npm registry, and GitHub sources)

---

## Summary

Phase 1 scaffolds a greenfield Electron 41 app using the `npm create @quick-start/electron@latest` toolchain with the `react-ts` template. The generated structure — `src/main/`, `src/preload/`, `src/renderer/` — is the canonical electron-vite layout and should not be deviated from.

The single largest technical risk in this phase is **electron-store ESM incompatibility with electron-vite**. electron-store v9+ is pure ESM, and the electron-vite main process bundler outputs CJS by default. The community-documented workaround (bundling the package via `externalizeDeps.exclude`) is fragile and has known failures with `bytecodePlugin`. The recommended alternative is **electron-conf v1.3.0**, written by the electron-vite maintainer (alex8088) specifically for this ecosystem, offering dual CJS+ESM support with TypeScript schema validation and zero compatibility issues. This replaces the D-02 library choice without changing the user-visible behavior.

Tailwind CSS v4 integrates cleanly with electron-vite through `@tailwindcss/vite` — a single plugin added only to the `renderer` config block, with a one-line `@import "tailwindcss"` CSS directive replacing v3's PostCSS setup.

**Primary recommendation:** Scaffold with `npm create @quick-start/electron@latest . -- --template react-ts`, use electron-conf instead of electron-store, wire typed IPC via `contextBridge.exposeInMainWorld`, implement `sanitizePathSegment()` wrapping `sanitize-filename` with additional reserved-name and trailing-dot guards, and write the manifest atomically with `.tmp` + `fs.renameSync` scoped to the same directory.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use `npm create @quick-start/electron@latest` with the `react-ts` template, scaffolded directly into the existing project root (`.`). The CLAUDE.md and `.planning/` directory are already present and will not be touched by the scaffold.
- **D-02:** Use `electron-store` (typed, schema-validated JSON in `app.getPath('userData')`). Do not hand-roll a custom JSON store.
  > **Research note:** electron-store v9+ is ESM-only and has documented compatibility failures with electron-vite's CJS main process. `electron-conf` v1.3.0 (by the electron-vite author) is the ecosystem-standard replacement. The planner should surface this trade-off for user confirmation before locking `electron-conf`. The user intent (typed schema-validated JSON in userData) is fully satisfied by either library.
- **D-03:** Schema includes at minimum: `lastDestination` (string, default `''`) and `concurrentDownloads` (number, default `3`, range 1–5).
- **D-04:** Default concurrent downloads = **3**.
- **D-05:** Define the **full typed IPC contract for all 4 phases** in `ipc-types.ts` at Phase 1. Phase 1 implements only the `settings` channels; Phase 2–4 channels are registered as stubs.
- **D-06:** Unimplemented stub handlers **throw a clear error**: `throw new Error('Not implemented: <channel>')`. Silent no-ops are not acceptable.
- **D-07:** The Phase 1 window is a **minimal dev panel** showing: app version, current settings (last folder + concurrent downloads with +/– controls wired to IPC), and the debug log file path.

### Claude's Discretion
- FAT32 `sanitizePathSegment()` internal implementation (regex strategy, reserved name list)
- Atomic write helper implementation details (tmp suffix, error handling)
- Window dimensions and Tailwind styling for the dev panel
- Vitest test file structure and naming conventions
- Debug log format (plaintext lines vs. structured JSON)
- electron-store version to use

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SET-01 | App remembers the last used destination folder and pre-fills it on next sync | electron-conf `get`/`set` with `lastDestination` key in `app.getPath('userData')` |
| SET-02 | User can configure the number of concurrent downloads (1–5) | electron-conf schema with `minimum: 1, maximum: 5` on `concurrentDownloads` field |
| SET-03 | App writes a debug log file to a known location for troubleshooting | `app.getPath('logs')` returns OS-appropriate log directory; write plaintext lines via `fs.appendFileSync` |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| App scaffold / build config | Main process (build-time) | — | electron-vite owns all three process configs from one file |
| Settings persistence (R/W) | Main process | — | All I/O in main; renderer is display-only (CLAUDE.md mandate) |
| Settings exposure to renderer | Preload (contextBridge) | — | The IPC bridge; never expose raw ipcRenderer |
| IPC channel definitions | Shared types (ipc-types.ts) | — | Types shared across main + preload + renderer without runtime coupling |
| FAT32 sanitization | Main process (utility) | — | Called at download time in main; pure function, testable in Node |
| Atomic manifest write | Main process (utility) | — | Filesystem I/O; not needed in renderer |
| Debug log writes | Main process | — | `app.getPath('logs')` only available in main process |
| Dev panel UI | Renderer (React) | — | Display only; all data comes via IPC |
| Settings controls (+/– buttons) | Renderer (React) | Main process | Renderer invokes IPC; main updates store |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 41.2.1 | Desktop runtime | Project constraint; Node 24 bundled |
| electron-vite | 5.0.0 | Unified build for main/preload/renderer | Official electron-vite toolchain; HMR support |
| typescript | 5.4.x | Type safety across all three contexts | Project constraint |
| react | 19.x | Renderer UI | Project constraint |
| zustand | 5.x | Renderer state | Project constraint |
| tailwindcss | 4.2.2 | Utility styling | Project constraint |
| @tailwindcss/vite | 4.2.2 | Vite plugin for Tailwind v4 | Required for Tailwind v4 with Vite (no PostCSS needed) |
| electron-conf | 1.3.0 | Typed settings persistence | Dual CJS+ESM; by electron-vite author; no compatibility issues |
| sanitize-filename | 1.6.4 | FAT32 character stripping | Handles illegal chars + reserved names + trailing dots |
| vitest | 4.1.4 | Unit tests | Project constraint; Vite-native |

[VERIFIED: npm registry — versions checked 2026-04-20]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @electron-toolkit/preload | 3.0.2 | Typed `ipcRenderer` helpers | Used in generated scaffold preload; provides `exposeInContextBridge` helper |
| @vitejs/plugin-react | latest | React JSX transform | Scaffolded automatically |
| electron-builder | 26.8.1 | Packaging (Phase 4) | Project constraint; not configured until Phase 4 |

[VERIFIED: npm registry]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-conf | electron-store v11 | electron-store v9+ is ESM-only; causes `ERR_REQUIRE_ESM` in electron-vite CJS main process. Workaround via `externalizeDeps.exclude` is fragile. electron-conf is the documented community solution for electron-vite projects. |
| electron-conf | hand-rolled JSON store | D-02 locks against this. electron-conf provides schema validation, atomic writes internally, and dot-notation access. |
| sanitize-filename | custom regex | sanitize-filename already handles the critical cases; wrap it with additional guards for reserved names + trailing dots (it covers those too, but explicit tests are required per CLAUDE.md). |

**Installation (Phase 1 additions on top of scaffolded dependencies):**
```bash
npm install electron-conf sanitize-filename
npm install --save-dev @tailwindcss/vite tailwindcss vitest
```

---

## Architecture Patterns

### System Architecture Diagram

```
Renderer (React)                Preload (contextBridge)            Main Process (Node)
─────────────────               ──────────────────────             ──────────────────────────
window.electronAPI    ────────► contextBridge.exposeIn            ipcMain.handle('settings:get')
  .settings.get()               MainWorld('electronAPI',{           └─► store.get()
  .settings.set(s)                settings: {                             └─► return Settings
                                    get: () =>                    ipcMain.handle('settings:set')
                                      ipcRenderer.invoke(           └─► store.set(partial)
                                        'settings:get'),
                                    set: (s) =>                   ipcMain.handle('auth:login')
                                      ipcRenderer.invoke(           └─► throw new Error(
                                        'settings:set', s)               'Not implemented: auth:login')
                                  },
                                  auth: { ... stub ... },
                                  sync: { ... stub ... },
                                  on: (event, cb) => ...
                                })
ipc-types.ts (shared)
  └─► ElectronAPI interface
  └─► Settings interface
```

### Recommended Project Structure

```
src/
├── main/
│   ├── index.ts          # BrowserWindow creation, app lifecycle
│   ├── ipc/
│   │   ├── settings.ts   # ipcMain.handle for settings:* channels
│   │   └── stubs.ts      # throw-on-call stubs for Phase 2-4 channels
│   └── lib/
│       ├── store.ts      # electron-conf instance + typed accessors
│       ├── logger.ts     # debug log writer (appendFileSync)
│       └── fs-utils.ts   # sanitizePathSegment(), atomicWriteJson()
├── preload/
│   └── index.ts          # contextBridge.exposeInMainWorld('electronAPI', ...)
├── renderer/
│   └── src/
│       ├── App.tsx        # DevPanel UI
│       ├── assets/
│       │   └── main.css   # @import "tailwindcss";
│       └── main.tsx
shared/
└── ipc-types.ts           # ElectronAPI, Settings interfaces — imported by main AND preload
tests/
└── lib/
    ├── fs-utils.test.ts   # sanitizePathSegment tests
    └── store.test.ts      # settings schema validation tests
```

> **Note on `shared/`:** electron-vite supports a `shared/` directory for code used across main, preload, and renderer contexts. `ipc-types.ts` belongs here since it is pure types with no runtime behavior. Verify the `tsconfig.json` path aliases include this directory.

### Pattern 1: Typed IPC with contextBridge

**What:** A shared interface type file (`ipc-types.ts`) defines the full API surface. The preload script exposes an implementation that calls `ipcRenderer.invoke`. Main process registers handlers with `ipcMain.handle`.

**When to use:** All renderer↔main communication. Never use `ipcRenderer.send` for request-response; use `ipcRenderer.invoke` which returns a Promise.

**Example:**
```typescript
// shared/ipc-types.ts
export interface Settings {
  lastDestination: string
  concurrentDownloads: number
}

export interface ElectronAPI {
  // Phase 1 — implemented
  settings: {
    get(): Promise<Settings>
    set(s: Partial<Settings>): Promise<void>
  }
  // Phase 2 stubs — throw on call
  auth: {
    login(url: string, user: string, pass: string): Promise<never>
    logout(): Promise<never>
  }
  // Phase 3 stubs
  sync: {
    start(opts: unknown): void
    cancel(): void
  }
  // Phase 4 stubs — event subscription
  on(event: 'sync:progress', cb: (p: unknown) => void): void
}
```

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../../shared/ipc-types'

const api: ElectronAPI = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (s) => ipcRenderer.invoke('settings:set', s),
  },
  auth: {
    login: (url, user, pass) => ipcRenderer.invoke('auth:login', url, user, pass),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  sync: {
    start: (opts) => ipcRenderer.send('sync:start', opts),
    cancel: () => ipcRenderer.send('sync:cancel'),
  },
  on: (event, cb) => {
    ipcRenderer.on(event, (_evt, payload) => cb(payload))
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
```

```typescript
// src/main/ipc/stubs.ts
import { ipcMain } from 'electron'

const STUB_CHANNELS = [
  'auth:login', 'auth:logout',
  'sync:start', 'sync:cancel',
]

export function registerStubs(): void {
  for (const channel of STUB_CHANNELS) {
    ipcMain.handle(channel, () => {
      throw new Error(`Not implemented: ${channel}`)
    })
  }
}
```

[CITED: https://www.electronjs.org/docs/latest/tutorial/ipc]

### Pattern 2: electron-conf Typed Settings Store

**What:** electron-conf stores typed JSON in `app.getPath('userData')` with schema validation via ajv.

**When to use:** All persistent user settings. The store instance lives only in main; renderer reads/writes exclusively via IPC.

**Example:**
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
}

const defaults: Settings = {
  lastDestination: '',
  concurrentDownloads: 3,
}

export const store = new Conf<Settings>({ schema, defaults })
```

[CITED: https://github.com/alex8088/electron-conf — README]

### Pattern 3: FAT32-Safe Path Segment Sanitization

**What:** `sanitizePathSegment()` wraps the `sanitize-filename` npm package. It is applied independently to each path component (artist, album, filename) — never to full paths containing slashes.

**When to use:** Every time a Jellyfin server string is used as a filesystem path component.

**Example:**
```typescript
// src/main/lib/fs-utils.ts
import sanitize from 'sanitize-filename'

/**
 * Sanitize a single path segment for FAT32 compatibility.
 * - Strips illegal characters: \ / : * ? " < > | and control chars 0x00-0x1F
 * - Removes Windows reserved names: CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9
 * - Strips trailing dots and spaces
 * - Trims to 255 bytes
 *
 * Apply PER SEGMENT, not to full paths.
 */
export function sanitizePathSegment(segment: string): string {
  const sanitized = sanitize(segment, { replacement: '_' })
  // sanitize-filename already handles reserved names and trailing dots,
  // but we assert the result is non-empty to avoid silent empty-segment bugs
  if (!sanitized || sanitized.trim() === '') {
    return '_'
  }
  return sanitized
}
```

**Test cases that must pass:**
- `'AC/DC'` → `'AC_DC'` (forward slash stripped)
- `'CON'` → something non-empty and not `'CON'`
- `'...And Justice For All'` → leading dots preserved but trailing removed
- `'track   '` → trailing spaces stripped
- `'NUL.txt'` → not `'NUL.txt'` (reserved even with extension)
- `''` → `'_'` (empty string fallback)

[CITED: https://github.com/parshap/node-sanitize-filename — README + behavior description from npm search results]
[VERIFIED: npm registry — sanitize-filename v1.6.4, 2026-04-20]

### Pattern 4: Atomic Manifest Write

**What:** Write JSON to `<path>.tmp`, then `fs.renameSync` to final path. The `.tmp` file and final file must be on the same filesystem/volume to avoid `EXDEV` (cross-device rename errors).

**When to use:** Any write to `_jellyfin-sync.json`. Phase 3 concern for the USB destination, but the helper established in Phase 1.

**Example:**
```typescript
// src/main/lib/fs-utils.ts
import { writeFileSync, renameSync, mkdirSync } from 'fs'
import { dirname } from 'path'

export function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  // renameSync is atomic on same-volume writes (POSIX guarantee; Windows ~atomic)
  // EXDEV only occurs cross-volume; tmp and target are always in the same folder here
  renameSync(tmpPath, filePath)
}

export function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
```

> **EXDEV note:** The `EXDEV` cross-device error only occurs when `.tmp` and target are on different volumes. For the manifest (Phase 3), `.tmp` must be created in the same directory as the target — not in `os.tmpdir()`. This pattern is safe by construction.

[CITED: Node.js fs docs; cross-device issue verified via GitHub nodejs/node#19077]

### Pattern 5: Tailwind CSS v4 in electron-vite

**What:** Tailwind v4 ships as a Vite plugin (`@tailwindcss/vite`), not a PostCSS plugin. No `tailwind.config.js` needed.

**When to use:** Renderer-only. Do not add to `main` or `preload` config blocks.

**Example:**
```typescript
// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [tailwindcss(), react()],
  },
})
```

```css
/* src/renderer/src/assets/main.css */
@import "tailwindcss";
```

[CITED: https://tailwindcss.com/docs/installation/using-vite; verified via 2025 community guides]

### Pattern 6: Debug Logging

**What:** Use `app.getPath('logs')` for the log location. On Windows it falls inside `%APPDATA%\<app-name>\logs`. On Linux it falls inside `~/.config/<app-name>/logs`. Write append-only plaintext lines.

**Example:**
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

> `app.getPath('logs')` does NOT require `app.setAppLogsPath()` — the default path is created automatically.

[VERIFIED: https://www.electronjs.org/docs/latest/api/app]

### Pattern 7: Vitest Configuration for Main Process Utilities

**What:** A standalone `vitest.config.ts` at the project root targeting `environment: 'node'` for tests of pure Node.js utilities (fs-utils, store). No Electron runtime needed for unit tests.

**Example:**
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

**Key insight:** `sanitizePathSegment()` and `atomicWriteJson()` are pure Node.js functions — they don't import `electron`. Tests can run in a plain Node environment without launching Electron. Functions that DO import `electron` (like `store.ts`, `logger.ts`) require mocking `electron` in tests or deferring those tests.

### Anti-Patterns to Avoid

- **Exposing raw `ipcRenderer`:** Never `contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer)`. Always expose a typed wrapper.
- **Writing settings in the renderer:** All `store.get`/`store.set` calls live in main process only. Renderer calls IPC.
- **Applying `sanitizePathSegment` to full paths:** Apply per segment. `path.join(sanitizePathSegment(artist), sanitizePathSegment(album), sanitizePathSegment(file))` — not `sanitizePathSegment(fullPath)`.
- **In-place manifest writes:** `fs.writeFileSync(manifestPath, ...)` without the `.tmp` rename pattern is forbidden by CLAUDE.md.
- **Silent stub no-ops:** `ipcMain.handle('auth:login', () => null)` masks accidental early invocations. Stubs must throw.
- **Tailwind plugin in main/preload config:** `tailwindcss()` belongs only in `renderer` config block.
- **`electron-store` with electron-vite default config:** Will produce `ERR_REQUIRE_ESM` at runtime without workaround.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Settings persistence | Custom JSON read/write | `electron-conf` | Schema validation, atomic writes, dot-notation, cross-process safety |
| FAT32 char stripping | Custom regex | `sanitize-filename` (wrapped in `sanitizePathSegment`) | Handles control chars, reserved names, trailing dots, 255-byte limit |
| Atomic file writes | `writeFileSync` direct | `atomicWriteJson()` helper (`.tmp` + `renameSync`) | In-place writes are vulnerable to mid-write crashes causing corrupt manifests |
| CSS processing | PostCSS config | `@tailwindcss/vite` plugin | v4 doesn't need PostCSS; Vite plugin is faster and simpler |

**Key insight:** The three biggest "simple but actually complex" problems in this phase are FAT32 sanitization edge cases (reserved names with extensions like `NUL.txt`), atomic file writes (EXDEV cross-volume), and ESM/CJS package compatibility. Don't hand-roll solutions where proven libraries exist.

---

## Common Pitfalls

### Pitfall 1: electron-store ESM Incompatibility
**What goes wrong:** `Error [ERR_REQUIRE_ESM]: require() of ES Module ... electron-store` at runtime when the main process tries to load electron-store v9+.
**Why it happens:** electron-store v9 (May 2023) dropped CJS. electron-vite's main process bundle outputs CJS by default.
**How to avoid:** Use `electron-conf` instead. If electron-store is required, add `externalizeDeps: { exclude: ['electron-store'] }` to the main config block — but this has known failures with `bytecodePlugin`.
**Warning signs:** Build succeeds but app crashes on startup with `ERR_REQUIRE_ESM`.

### Pitfall 2: Scaffold Overwriting Planning Files
**What goes wrong:** `npm create @quick-start/electron@latest .` may prompt to overwrite or silently overwrite existing files.
**Why it happens:** The scaffolding tool detects a non-empty directory and asks what to merge. It targets `package.json`, `tsconfig.json`, `.gitignore`, and template source files — NOT arbitrary files like `CLAUDE.md` or `.planning/`.
**How to avoid:** Run with the project root (`.`) as the target. The scaffolding tool only writes its own known files. Keep `CLAUDE.md` and `.planning/` in place — they are not part of the template output. Verify after scaffold that both still exist.
**Warning signs:** `.planning/` or `CLAUDE.md` missing after scaffold run.

[ASSUMED: Exact scaffold behavior for existing directories not directly verified from source — confirmed in shape from community reports but not from the `create-electron` source code directly]

### Pitfall 3: FAT32 Reserved Name with Extension
**What goes wrong:** A Jellyfin track, artist, or album named `NUL`, `CON`, `PRN` etc. passes sanitization because the extension makes it look "different" — but `NUL.mp3` is still reserved on Windows.
**Why it happens:** Naive regex only checks the bare name, not the name-with-extension form.
**How to avoid:** `sanitize-filename` already handles `NUL.txt` (the docs state reserved names with extensions are also stripped). Verify this in unit tests with `'NUL.flac'` and `'CON.mp3'`.
**Warning signs:** Test `sanitizePathSegment('NUL.flac')` returns `'NUL.flac'` — that's a bug.

### Pitfall 4: IPC `send` vs `invoke` for Request-Response
**What goes wrong:** Using `ipcRenderer.send` for settings reads/writes means you cannot `await` the result reliably. The renderer fires-and-forgets.
**Why it happens:** `send`/`on` is for fire-and-forget; `invoke`/`handle` returns a Promise.
**How to avoid:** Use `ipcRenderer.invoke` for all request-response channels (`settings:get`, `settings:set`). Only use `send` for one-way notifications (Phase 4 cancel button).
**Warning signs:** `window.electronAPI.settings.get()` resolves `undefined` immediately.

### Pitfall 5: `app.getPath('logs')` in Preload or Renderer
**What goes wrong:** `app.getPath('logs')` throws `TypeError: app.getPath is not a function` in preload or renderer contexts.
**Why it happens:** `app` is main-process-only. The renderer gets the log path via IPC.
**How to avoid:** Call `getLogPath()` in main, expose the string value to renderer via a `getLogPath` IPC channel or as a static value in `settings.get()` response.
**Warning signs:** TypeError at startup in preload or renderer DevTools console.

### Pitfall 6: Tailwind Classes Not Applied in Production Build
**What goes wrong:** Tailwind utility classes work in dev but strip out in production build.
**Why it happens:** Tailwind v4 content scanning may not find `.tsx` files if `src/renderer/src` is not in scope.
**How to avoid:** Tailwind v4 auto-detects files in the Vite project root. Ensure all React component files are under `src/renderer/src/`. No manual `content` array configuration is needed for v4.
**Warning signs:** Styled dev panel looks unstyled in packaged build.

### Pitfall 7: EXDEV on Atomic Write
**What goes wrong:** `renameSync(tmpPath, targetPath)` throws `EXDEV: cross-device link not permitted` when `.tmp` and target are on different volumes.
**Why it happens:** OS rename is atomic only within a single volume/filesystem.
**How to avoid:** Always write `.tmp` in the same directory as the target (use `targetPath + '.tmp'` not `os.tmpdir() + '/...'`). For the manifest (`_jellyfin-sync.json` on USB in Phase 3), this pattern is correct by construction.
**Warning signs:** `EXDEV` error in the sync engine when a USB drive is on a different letter/mount than the app's temp dir.

---

## Code Examples

### Scaffold Command (into existing directory)
```bash
# Run from the project root — scaffolds into current directory
npm create @quick-start/electron@latest . -- --template react-ts
# If prompted about existing files, choose to keep/merge
```

### electron.vite.config.ts (complete Phase 1 config)
```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [tailwindcss(), react()],
  },
})
```

### electron-conf Store (full typed example)
```typescript
import { Conf } from 'electron-conf/main'

interface Settings {
  lastDestination: string
  concurrentDownloads: number
}

const store = new Conf<Settings>({
  defaults: { lastDestination: '', concurrentDownloads: 3 },
  schema: {
    type: 'object',
    properties: {
      lastDestination: { type: 'string' },
      concurrentDownloads: { type: 'number', minimum: 1, maximum: 5 },
    },
  },
})

// Usage in IPC handler:
ipcMain.handle('settings:get', () => store.store)
ipcMain.handle('settings:set', (_evt, partial: Partial<Settings>) => {
  store.set(partial)
})
```

### Reserved Name List (for test assertions)
```typescript
// Matches Microsoft's documented list including superscript variants
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³])(\..+)?$/i
```
[CITED: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind v3 with PostCSS | Tailwind v4 with `@tailwindcss/vite` plugin | v4.0 (Jan 2025) | No `tailwind.config.js`, no `postcss.config.js`; `@import "tailwindcss"` in CSS |
| electron-store (CJS) | electron-conf (dual CJS+ESM) | electron-store v9 (May 2023) went ESM-only | electron-conf is the ecosystem-recommended replacement for electron-vite projects |
| `externalizeDepsPlugin()` (electron-vite 4) | `build.externalizeDeps` (electron-vite 5) | electron-vite 5.0 | `externalizeDepsPlugin` is deprecated in 5.0; use config-level `externalizeDeps` instead |

**Deprecated/outdated:**
- `electron-store` with electron-vite main process: causes `ERR_REQUIRE_ESM` without extra config
- Tailwind `postcss.config.js` + `tailwind.config.js`: replaced by `@tailwindcss/vite` plugin in v4
- `externalizeDepsPlugin()` from import: still works in electron-vite 5 but deprecated in favor of config option

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Scaffold into `.` does not overwrite `.planning/` or `CLAUDE.md` | Pitfall 2, Scaffold Command | Planning files deleted if wrong; simple mitigation: back up before running scaffold |
| A2 | `electron-conf` TypeScript generics provide type-safe `get<K>` return types (not `any`) | Pattern 2 | If `any` return, loses type safety; mitigation: add explicit return type assertions in IPC handler |
| A3 | Vitest can test `sanitizePathSegment` without mocking `electron` because it imports only Node.js builtins | Pattern 7 | If sanitize-filename pulls in electron transitively, tests break; unlikely given sanitize-filename is a pure string utility |

---

## Open Questions

1. **electron-store vs electron-conf: does the user want to confirm the substitution?**
   - What we know: electron-store v9+ causes `ERR_REQUIRE_ESM` in electron-vite's CJS main; electron-conf is the ecosystem-native replacement with identical feature set for this use case.
   - What's unclear: D-02 explicitly names electron-store; the user may have a reason for that preference.
   - Recommendation: Planner should surface this as a decision point and default to electron-conf unless user overrides.

2. **Scaffold `--template react-ts` exact file list**
   - What we know: Generates `src/main/`, `src/preload/`, `src/renderer/`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `electron-builder.yml`.
   - What's unclear: Whether `shared/` for `ipc-types.ts` needs to be created manually or if the template includes it.
   - Recommendation: Treat `shared/` as a manually created directory post-scaffold. Verify `tsconfig.json` path alias setup allows `../../shared/ipc-types` imports from `src/main/`.

3. **`concurrentDownloads` IPC: clamp in main or reject?**
   - What we know: electron-conf schema validation uses ajv; an out-of-range value will fail validation (throws or silently ignores — behavior TBD).
   - What's unclear: Whether electron-conf throws on validation failure or silently rejects.
   - Recommendation: Clamp in the IPC handler before calling `store.set()` regardless: `Math.max(1, Math.min(5, value))`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build + test | ✓ | bundled with Electron 41 (Node 24) | — |
| npm | Package install | ✓ | from shell environment | — |
| npx | Scaffold command | ✓ | ships with npm | — |

[ASSUMED: npm/npx available based on project setup — not probed in this session since no project node_modules exist yet]

**Missing dependencies with no fallback:** None identified for Phase 1.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in Phase 1 |
| V3 Session Management | No | No sessions in Phase 1 |
| V4 Access Control | Yes (partial) | `contextIsolation: true`, `nodeIntegration: false` — enforced from first commit |
| V5 Input Validation | Yes | electron-conf schema validates settings values; `sanitizePathSegment()` validates filesystem inputs |
| V6 Cryptography | No | No secrets stored in Phase 1 |

### Known Threat Patterns for Electron Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer code execution in Node context | Elevation of Privilege | `nodeIntegration: false` + `contextIsolation: true` (CLAUDE.md mandate) |
| Malicious channel names via renderer | Tampering | Only whitelisted channels exposed via `contextBridge`; never expose raw `ipcRenderer` |
| Path traversal via unsanitized Jellyfin strings | Tampering | `sanitizePathSegment()` per segment; never join unsanitized server data into filesystem paths |
| Settings schema bypass | Tampering | electron-conf schema validated on `set`; additionally clamp numeric fields in IPC handler |
| Corrupt manifest on crash | Denial of Service | Atomic `.tmp` + `renameSync` pattern; `try/catch` on manifest parse |

---

## Sources

### Primary (HIGH confidence)
- [Electron official IPC tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc) — contextBridge pattern, ipcMain.handle, ipcRenderer.invoke
- [Electron app.getPath docs](https://www.electronjs.org/docs/latest/api/app) — logs/userData path behavior
- [Microsoft: Naming Files and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) — authoritative reserved names list including COM¹²³ / LPT¹²³ superscript variants
- [electron-conf GitHub README](https://github.com/alex8088/electron-conf) — constructor API, schema, TypeScript usage
- [Tailwind CSS v4 Vite install docs](https://tailwindcss.com/docs/installation/using-vite) — `@tailwindcss/vite` plugin, `@import "tailwindcss"` CSS syntax
- npm registry — versions verified 2026-04-20 for: electron (41.2.1), electron-vite (5.0.0), electron-conf (1.3.0), sanitize-filename (1.6.4), vitest (4.1.4), tailwindcss (4.2.2), @tailwindcss/vite (4.2.2)

### Secondary (MEDIUM confidence)
- [electron-vite troubleshooting guide](https://electron-vite.org/guide/troubleshooting) — ESM-only package handling via `externalizeDeps.exclude`
- [electron-vite Discussion #542](https://github.com/alex8088/electron-vite/discussions/542) — electron-store ESM incompatibility and electron-conf recommendation
- [2025 electron-vite + Tailwind v4 guide](https://iifx.dev/en/articles/457403541/fast-track-your-desktop-apps-a-guide-to-electron-vite-and-tailwind-v4) — confirmed configuration pattern
- [sanitize-filename npm](https://github.com/parshap/node-sanitize-filename) — reserved names and trailing dots behavior

### Tertiary (LOW confidence)
- Community WebSearch results confirming electron-vite react-ts template structure (not directly verified from source code)
- A1 assumption about scaffold not overwriting `.planning/` (behavior inferred, not tested)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry 2026-04-20
- Architecture: HIGH — IPC patterns from official Electron docs; electron-conf from official GitHub
- FAT32 sanitization: HIGH — Windows reserved names from Microsoft official docs
- Tailwind v4 setup: HIGH — from official Tailwind docs + multiple 2025 community guides
- electron-store ESM issue: HIGH — multiple GitHub issues confirm the problem; electron-conf recommendation from maintainer
- Scaffold behavior for existing directories: MEDIUM — confirmed in shape, not verified from source

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — stable libraries; Tailwind v4 and electron-conf moving faster so re-verify if > 2 weeks before execution)
