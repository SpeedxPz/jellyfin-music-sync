# Phase 3: Sync Engine - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/main/ipc/sync.ts` | IPC handler | request-response + event-driven | `src/main/ipc/auth.ts` | exact (same role + register*Handlers pattern) |
| `src/main/lib/sync-engine.ts` | service | batch + event-driven | `src/main/ipc/playlists.ts` | role-match (paginated Jellyfin fetch core) |
| `src/main/lib/downloader.ts` | utility | file-I/O + streaming | `src/main/lib/fs-utils.ts` | role-match (file I/O utility) |
| `src/main/lib/manifest.ts` | utility | CRUD + file-I/O | `src/main/lib/fs-utils.ts` | exact (atomicWriteJson / safeReadJson callers) |
| `src/main/lib/m3u8.ts` | utility | transform | `src/main/lib/fs-utils.ts` | partial (pure transform, same lib layer) |
| `src/main/ipc/stubs.ts` | config (patch) | — | `src/main/ipc/stubs.ts` | self (surgical removal of Phase 3 stubs) |
| `src/main/index.ts` | config (patch) | — | `src/main/index.ts` | self (add registerSyncHandlers() call) |
| `shared/ipc-types.ts` | type contract (patch) | — | `shared/ipc-types.ts` | self (extend SyncSummary) |
| `src/renderer/src/screens/PlaylistBrowserScreen.tsx` | component (patch) | request-response | `src/renderer/src/screens/LoginScreen.tsx` | role-match (IPC invoke from button handler) |
| `tests/lib/manifest.test.ts` | test | CRUD | `tests/lib/fs-utils.test.ts` | exact (same test structure + tmpdir pattern) |
| `tests/lib/m3u8.test.ts` | test | transform | `tests/lib/fs-utils.test.ts` | exact (same test structure) |
| `tests/lib/downloader.test.ts` | test | file-I/O | `tests/lib/fs-utils.test.ts` | exact (same test structure + tmpdir pattern) |

---

## Pattern Assignments

### `src/main/ipc/sync.ts` (IPC handler, request-response + event-driven)

**Analog:** `src/main/ipc/auth.ts`

**Imports pattern** (auth.ts lines 1–14):
```typescript
import { ipcMain, dialog } from 'electron'
import { store } from '../lib/store'
import { log } from '../lib/logger'
import { getApi } from '../lib/jellyfin'
import type { SyncOptions, SyncProgress, SyncSummary } from '../../../shared/ipc-types'
// sync-engine, manifest, downloader, m3u8 imported from ../lib/
```

**Handler registration pattern** (auth.ts lines 20–22):
```typescript
export function registerSyncHandlers(): void {
  ipcMain.handle('sync:start', async (evt, opts: SyncOptions): Promise<void> => {
    // ...
  })

  // fire-and-forget cancel — ipcMain.on, not handle
  ipcMain.on('sync:cancel', () => {
    _abortController?.abort()
  })
}
```

**Auth/session guard pattern** (auth.ts lines 166–168, playlists.ts lines 18–21):
```typescript
const api = getApi()
if (!api) throw new Error('Not authenticated. Please log in first.')
const userId = store.get('userId')
if (!userId) throw new Error('User ID not found. Please log in again.')
```

**Store read/write pattern** (auth.ts lines 81–88):
```typescript
// Read: store.get('lastDestination')
// Write: store.set({ lastDestination: destination })
```

**Error pattern** (auth.ts lines 35–43, 61–65):
```typescript
try {
  // operation
} catch (err) {
  if (isAxiosError(err) && !err.response) {
    throw new Error('Human-readable message.')
  }
  throw err  // re-throw unexpected errors
}
```

**webContents push pattern** (from ipc-types.ts `on()` contract + RESEARCH.md pattern):
```typescript
// Push progress to renderer from inside the handler
function emitProgress(webContents: WebContents, payload: SyncProgress): void {
  if (!webContents.isDestroyed()) {
    webContents.send('sync:onProgress', payload)
  }
}
// Access via: evt.sender  (the WebContents of the invoking window)
```

**AbortController pattern** (RESEARCH.md Pattern 10):
```typescript
let _abortController: AbortController | null = null

// In sync:start handler body:
_abortController = new AbortController()
await runSync(opts, _abortController.signal, evt.sender)
_abortController = null

// In ipcMain.on('sync:cancel'):
_abortController?.abort()
```

**Folder picker pattern** (RESEARCH.md Code Examples — Folder Picker):
```typescript
const lastDestination = store.get('lastDestination')
const result = await dialog.showOpenDialog({
  properties: ['openDirectory'],
  defaultPath: lastDestination || undefined,
  title: 'Select sync destination',
})
if (result.canceled || result.filePaths.length === 0) return
const destination = result.filePaths[0]
store.set({ lastDestination: destination })
```

---

### `src/main/lib/sync-engine.ts` (service, batch + event-driven)

**Analog:** `src/main/ipc/playlists.ts` (paginated Jellyfin fetch) + RESEARCH.md Architecture Diagram

**Imports pattern** (playlists.ts lines 1–8):
```typescript
import { getApi, getItemsApi } from '../lib/jellyfin'
// Add for sync-engine:
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api'
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import type { WebContents } from 'electron'
import pLimit from 'p-limit'
import { join, relative, sep } from 'path'
import { existsSync, statSync, unlinkSync, mkdirSync, readdirSync } from 'fs'
import { sanitizePathSegment, atomicWriteJson } from './fs-utils'
import { readManifest, writeManifest } from './manifest'
import { downloadTrack } from './downloader'
import { generateM3u8 } from './m3u8'
import { log } from './logger'
import type { SyncOptions, SyncProgress, SyncSummary } from '../../../shared/ipc-types'
import type { SyncManifest } from './manifest'
```

**Paginated fetch pattern** (playlists.ts lines 24–59):
```typescript
const PAGE_SIZE = 500
const results: BaseItemDto[] = []
let startIndex = 0

while (true) {
  const resp = await getPlaylistsApi(api).getPlaylistItems({
    playlistId,
    userId,
    startIndex,
    limit: PAGE_SIZE,
    fields: [ItemFields.MediaSources],
  })
  const items = resp.data.Items ?? []
  results.push(...items.filter((i) => i.Id))
  // D-API-PAGINATION: terminate on empty page, NOT items.length < PAGE_SIZE
  if (items.length === 0) break
  startIndex += PAGE_SIZE
}
```

**p-limit concurrency pattern** (RESEARCH.md Pattern 3):
```typescript
import pLimit from 'p-limit'
const limit = pLimit(concurrentDownloads) // from opts.concurrentDownloads

const downloadTasks = tracksToDownload.map((track) =>
  limit(() => downloadTrack(track, api, destRoot, signal, onProgress))
)
const results = await Promise.allSettled(downloadTasks)
```

**Incremental check pattern** (RESEARCH.md Pattern 5):
```typescript
function needsDownload(manifest: SyncManifest, itemId: string, destRoot: string): boolean {
  const entry = manifest.items[itemId]
  if (!entry) return true
  const absPath = join(destRoot, entry.localPath)
  if (!existsSync(absPath)) return true
  const stat = statSync(absPath)
  return stat.size !== entry.fileSize  // size mismatch → re-download
}
```

**Cross-playlist deletion safety pattern** (RESEARCH.md Pattern 6):
```typescript
function isReferencedByOtherPlaylist(
  manifest: SyncManifest,
  itemId: string,
  currentPlaylistIds: string[]
): boolean {
  return Object.values(manifest.playlists)
    .filter((pl) => !currentPlaylistIds.includes(pl.id))
    .some((pl) => pl.itemIds.includes(itemId))
}
```

**Path construction pattern** (RESEARCH.md SYNC-03, SYNC-04):
```typescript
// Per-segment sanitization — NEVER on the full path
const artist = sanitizePathSegment(item.AlbumArtist ?? 'Unknown Artist')
const album = sanitizePathSegment(item.Album ?? 'Unknown Album')
const filename = sanitizePathSegment(`${item.Name ?? item.Id}.${item.Container ?? 'audio'}`)
const absPath = join(destRoot, artist, album, filename)
mkdirSync(join(destRoot, artist, album), { recursive: true })
```

**localPath forward-slash normalization** (RESEARCH.md Pitfall 4):
```typescript
// Store relative path with forward slashes — path.join uses backslashes on Windows
const relPath = relative(destRoot, absPath).split(sep).join('/')
manifest.items[itemId].localPath = relPath
```

**Orphan .part scan pattern** (RESEARCH.md D-ERR-ORPHANS):
```typescript
// Called at start of sync, before any downloads
function cleanOrphanedPartFiles(destRoot: string): void {
  try {
    const entries = readdirSync(destRoot, { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.endsWith('.part')) {
        const abs = join(entry.parentPath ?? entry.path, entry.name)
        try { unlinkSync(abs) } catch { /* ignore */ }
      }
    }
  } catch { /* dest may not exist yet */ }
}
```

---

### `src/main/lib/downloader.ts` (utility, file-I/O + streaming)

**Analog:** `src/main/lib/fs-utils.ts` (utility layer, file I/O) + RESEARCH.md Patterns 1 & 2

**Imports pattern**:
```typescript
import axios from 'axios'
import { createWriteStream, unlinkSync, statSync } from 'fs'
import { pipeline } from 'stream/promises'
import type { Api } from '@jellyfin/sdk'
```

**Download URL construction** (RESEARCH.md Pattern 2):
```typescript
function buildDownloadUrl(api: Api, itemId: string): string {
  const url = new URL(`${api.basePath}/Audio/${encodeURIComponent(itemId)}/stream`)
  url.searchParams.set('static', 'true')
  // Optional: pass mediaSourceId to select specific version (RESEARCH.md Open Question 2)
  return url.toString()
}
// Auth header: api.authorizationHeader
```

**Streaming download core pattern** (RESEARCH.md Pattern 1 + Open Question 1 resolution):
```typescript
// Use a PassThrough (Transform) stream to avoid double-consumer of the readable
// (RESEARCH.md Open Question 1 — tee approach is unambiguous)
import { Transform } from 'stream'

async function downloadTrack(
  url: string,
  authHeader: string,
  partPath: string,
  signal: AbortSignal,
  onChunk: (bytesReceived: number, total: number) => void
): Promise<number> {  // returns final file size in bytes
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    headers: { Authorization: authHeader },
    signal,
  })

  const total = parseInt(response.headers['content-length'] ?? '0', 10)
  let bytesReceived = 0

  const countingStream = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytesReceived += chunk.length
      onChunk(bytesReceived, total)
      cb(null, chunk)
    },
  })

  const writeStream = createWriteStream(partPath)
  await pipeline(response.data, countingStream, writeStream)
  // pipeline resolves only after stream fully written and closed

  // Use statSync for authoritative file size (Pitfall 5 — Content-Length may be absent)
  return statSync(partPath).size
}
```

**Error + .part cleanup pattern** (RESEARCH.md D-ERR-CLEANUP, Pitfall 6):
```typescript
// Caller wraps downloadTrack:
try {
  const fileSize = await downloadTrack(url, authHeader, partPath, signal, onChunk)
  renameSync(partPath, finalPath)
  // update manifest.items[id] with fileSize, localPath, syncedAt
} catch (err) {
  try { unlinkSync(partPath) } catch { /* ignore — may not exist */ }
  // record failure for SyncSummary
  failures.push({ name: trackName, reason: (err as Error).message })
}
```

---

### `src/main/lib/manifest.ts` (utility, CRUD + file-I/O)

**Analog:** `src/main/lib/fs-utils.ts` — uses `atomicWriteJson` and `safeReadJson` directly

**Imports pattern**:
```typescript
import { join } from 'path'
import { atomicWriteJson, safeReadJson } from './fs-utils'
```

**Schema types** (RESEARCH.md Pattern 4):
```typescript
export interface ManifestItem {
  id: string           // Jellyfin item ID
  localPath: string    // relative to destination root, forward slashes
  fileSize: number     // bytes — for incremental check (use statSync, not Content-Length)
  syncedAt: string     // ISO 8601 timestamp
}

export interface ManifestPlaylist {
  id: string           // Jellyfin playlist ID
  name: string         // Jellyfin playlist name
  itemIds: string[]    // ordered list of item IDs
}

export interface SyncManifest {
  version: 1
  items: Record<string, ManifestItem>
  playlists: Record<string, ManifestPlaylist>
}

export const EMPTY_MANIFEST: SyncManifest = { version: 1, items: {}, playlists: {} }
```

**Read/write wrapper pattern** (mirrors fs-utils.ts safeReadJson / atomicWriteJson usage):
```typescript
export const MANIFEST_FILENAME = '_jellyfin-sync.json'

export function readManifest(destRoot: string): SyncManifest {
  return safeReadJson(join(destRoot, MANIFEST_FILENAME), EMPTY_MANIFEST)
}

export function writeManifest(destRoot: string, manifest: SyncManifest): void {
  atomicWriteJson(join(destRoot, MANIFEST_FILENAME), manifest)
}
```

---

### `src/main/lib/m3u8.ts` (utility, transform)

**Analog:** `src/main/lib/fs-utils.ts` (pure utility function shape) + RESEARCH.md Pattern 7

**Imports pattern**:
```typescript
import { join, relative, sep } from 'path'
import { writeFileSync } from 'fs'
import { sanitizePathSegment } from './fs-utils'
import type { SyncManifest, ManifestPlaylist } from './manifest'
```

**Generation pattern** (RESEARCH.md Pattern 7 — M3U8-02, M3U8-03):
```typescript
// M3U8-03: duration from RunTimeTicks (100-ns ticks ÷ 10_000_000 = seconds)
// M3U8-02: paths use forward slashes — path.relative then split(sep).join('/')
function generateM3u8Content(
  playlist: ManifestPlaylist,
  items: Record<string, ManifestItem & { name: string; runTimeTicks: number }>,
  destRoot: string
): string {
  const lines = ['#EXTM3U']
  for (const itemId of playlist.itemIds) {
    const item = items[itemId]
    if (!item) continue  // failed download — omit from M3U8
    const durationSec = Math.round(item.runTimeTicks / 10_000_000)
    const relPath = relative(destRoot, join(destRoot, item.localPath))
      .split(sep).join('/')  // forward slashes for portability (Windows + Linux)
    lines.push(`#EXTINF:${durationSec},${item.name}`)
    lines.push(relPath)
  }
  return lines.join('\n') + '\n'
}

// M3U8-01: written to destination root as {sanitizedPlaylistName}.m3u8
export function writeM3u8(
  playlist: ManifestPlaylist,
  items: Record<string, ManifestItem & { name: string; runTimeTicks: number }>,
  destRoot: string
): void {
  const filename = sanitizePathSegment(playlist.name) + '.m3u8'
  const content = generateM3u8Content(playlist, items, destRoot)
  writeFileSync(join(destRoot, filename), content, 'utf-8')
}
```

---

### `src/main/ipc/stubs.ts` (patch — remove Phase 3 stubs)

**Analog:** `src/main/ipc/stubs.ts` — self (surgical removal)

**Current state** (stubs.ts lines 7–23):
```typescript
const PHASE3_CHANNELS = [
  'sync:start',
]
// ...
ipcMain.on('sync:cancel', () => { /* stub no-op */ })
```

**Target state after patch** (RESEARCH.md Pattern 9):
```typescript
// PHASE3_CHANNELS becomes empty — sync:start handled by registerSyncHandlers()
const PHASE3_CHANNELS: string[] = []
// sync:cancel ipcMain.on block removed entirely
// registerStubs() loop body becomes a no-op (empty array)
```

---

### `src/main/index.ts` (patch — register sync handlers)

**Analog:** `src/main/index.ts` — self (add one import + one call)

**Current registration pattern** (index.ts lines 5–8, 48–51):
```typescript
import { registerSettingsHandlers } from './ipc/settings'
import { registerAuthHandlers } from './ipc/auth'
import { registerPlaylistHandlers } from './ipc/playlists'
import { registerStubs } from './ipc/stubs'
// ...
registerSettingsHandlers()
registerAuthHandlers()
registerPlaylistHandlers()
registerStubs()
```

**Target — add after registerPlaylistHandlers():**
```typescript
import { registerSyncHandlers } from './ipc/sync'
// ...
registerSyncHandlers()   // Phase 3: sync:start, sync:cancel
```

---

### `shared/ipc-types.ts` (patch — extend SyncSummary)

**Analog:** `shared/ipc-types.ts` — self (add fields to existing interface)

**Current SyncSummary** (ipc-types.ts lines 46–50):
```typescript
export interface SyncSummary {
  added: number
  removed: number
  unchanged: number
}
```

**Target — extended with failure tracking** (RESEARCH.md Pattern 8):
```typescript
export interface SyncSummary {
  added: number
  removed: number
  unchanged: number
  failed: number                                    // tracks that failed to download
  failures: Array<{ name: string; reason: string }> // for post-sync error log (D-ERR-SKIP)
}
```

---

### `src/renderer/src/screens/PlaylistBrowserScreen.tsx` (patch — wire Sync button)

**Analog:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx` — self (replace no-op onClick)

**Current no-op** (PlaylistBrowserScreen.tsx lines 167–169):
```typescript
onClick={() => {
  // Phase 3 wires the actual sync action — no-op in Phase 2
}}
```

**IPC invoke pattern** (from LoginScreen usage + preload.ts lines 23–25):
```typescript
// preload exposes: window.electronAPI.sync.start(opts)
// opts shape: { playlistIds: string[], destination: string, concurrentDownloads: number }
// destination is resolved by main process (dialog.showOpenDialog inline in sync:start)
// so renderer only passes playlistIds + concurrentDownloads

const handleSync = async () => {
  const concurrentDownloads = await window.electronAPI.settings.get()
    .then((s) => s.concurrentDownloads)
  try {
    await window.electronAPI.sync.start({
      playlistIds: [...selected],
      destination: '',          // resolved by main via dialog — placeholder value
      concurrentDownloads,
    })
  } catch (err) {
    // Phase 4 handles error display; Phase 3 only wires the call
    console.error(err)
  }
}
// onClick={() => { void handleSync() }}
```

**Note:** `SyncOptions.destination` is resolved in main process via dialog. The renderer passes an empty string or omits it — the final shape depends on whether the planner keeps `destination` in `SyncOptions` or moves it to main-only resolution. The pattern above shows the safest approach: pass a placeholder, let main override with dialog result.

---

### `tests/lib/manifest.test.ts` (test)

**Analog:** `tests/lib/fs-utils.test.ts` — exact (same tmpdir fixture, same describe/it/expect shape)

**Test file structure** (fs-utils.test.ts lines 1–7, 43–51):
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readManifest, writeManifest, EMPTY_MANIFEST } from '../../src/main/lib/manifest'

describe('readManifest / writeManifest', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'jms-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  // Tests cover: round-trip, corrupt fallback to EMPTY_MANIFEST,
  // needsDownload (SYNC-05), isReferencedByOtherPlaylist (SYNC-06, SYNC-07)
})
```

---

### `tests/lib/m3u8.test.ts` (test)

**Analog:** `tests/lib/fs-utils.test.ts` — exact structure

**Key test cases to cover** (M3U8-02, M3U8-03):
```typescript
// M3U8-03: duration from RunTimeTicks
it('writes correct EXTINF duration from RunTimeTicks', () => {
  // RunTimeTicks: 2_000_000_000 → 200 seconds
})

// M3U8-02: forward slashes on Windows
it('uses forward slashes in generated paths', () => {
  // path.relative result on Windows may use backslash — verify converted
})
```

---

### `tests/lib/downloader.test.ts` (test)

**Analog:** `tests/lib/fs-utils.test.ts` — exact structure

**Key test cases to cover** (D-ERR-CLEANUP, SYNC-04):
```typescript
// D-ERR-CLEANUP: .part file deleted on error
it('deletes .part file when download fails', () => { ... })

// SYNC-04: per-segment FAT32 sanitization in path construction
it('applies sanitizePathSegment independently to artist, album, filename', () => { ... })
```

---

## Shared Patterns

### IPC Handler Registration
**Source:** `src/main/ipc/auth.ts` lines 20–22; `src/main/index.ts` lines 5–8, 47–51
**Apply to:** `src/main/ipc/sync.ts` (registerSyncHandlers), `src/main/index.ts` (import + call)
```typescript
// Pattern: export function register*Handlers(): void { ipcMain.handle(...) }
// Called from index.ts in the app.whenReady() block in order
export function registerSyncHandlers(): void {
  ipcMain.handle('sync:start', async (evt, opts: SyncOptions): Promise<void> => { ... })
  ipcMain.on('sync:cancel', () => { ... })
}
```

### Session Guard
**Source:** `src/main/ipc/auth.ts` lines 166–168; `src/main/ipc/playlists.ts` lines 18–21
**Apply to:** `src/main/ipc/sync.ts` — first lines of sync:start handler
```typescript
const api = getApi()
if (!api) throw new Error('Not authenticated. Please log in first.')
const userId = store.get('userId')
if (!userId) throw new Error('User ID not found. Please log in again.')
```

### Store Read/Write
**Source:** `src/main/lib/store.ts`; `src/main/ipc/auth.ts` lines 81–88
**Apply to:** `src/main/ipc/sync.ts` (lastDestination, concurrentDownloads)
```typescript
// Read: store.get('lastDestination'), store.get('concurrentDownloads')
// Write: store.set({ lastDestination: destination })
```

### Atomic Manifest Write
**Source:** `src/main/lib/fs-utils.ts` lines 38–46
**Apply to:** `src/main/lib/manifest.ts` (writeManifest calls atomicWriteJson)
```typescript
export function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)  // atomic on same-volume
}
```

### FAT32 Path Segment Sanitization
**Source:** `src/main/lib/fs-utils.ts` lines 21–30
**Apply to:** `src/main/lib/sync-engine.ts` (path construction), `src/main/lib/m3u8.ts` (playlist filename)
```typescript
// APPLY PER SEGMENT — never to full paths containing slashes
sanitizePathSegment(artist)    // e.g., 'AC/DC' → 'AC_DC'
sanitizePathSegment(album)     // e.g., 'CON' → '_CON' or similar
sanitizePathSegment(filename)  // name + extension
```

### Pagination Loop
**Source:** `src/main/ipc/playlists.ts` lines 24–59
**Apply to:** `src/main/lib/sync-engine.ts` (fetchPlaylistTracks)
```typescript
// Terminate on empty page (not items.length < PAGE_SIZE — D-API-PAGINATION)
if (items.length === 0) break
startIndex += PAGE_SIZE
```

### Logging
**Source:** `src/main/ipc/auth.ts` lines 88–89, 182 (log calls)
**Apply to:** `src/main/ipc/sync.ts`, `src/main/lib/sync-engine.ts`
```typescript
import { log } from '../lib/logger'
log('INFO', 'Sync started: ...')
log('WARN', 'Track download failed: ...')
```

### Test Fixture (tmpdir)
**Source:** `tests/lib/fs-utils.test.ts` lines 44–51
**Apply to:** All three new test files
```typescript
let tmpDir: string
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'jms-test-')) })
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }) })
```

---

## No Analog Found

All new files have analogs. No entries in this section.

---

## Anti-Patterns to Enforce (from RESEARCH.md)

These must be verified during planning/execution:

| Anti-Pattern | Rule | Where Enforced |
|---|---|---|
| `sanitizePathSegment` on full path | Always per segment | `sync-engine.ts` path construction |
| `writeFileSync` directly on manifest | Always use `atomicWriteJson` | `manifest.ts` writeManifest |
| Registering handler for already-handled channel | Remove stub before registering real | `stubs.ts` patch before `sync.ts` registration |
| `p-limit@6+` (ESM-only) | Pin to `p-limit@3` | `package.json` install step |
| `path.join` for M3U8 entries on Windows | Convert `sep` → `/` | `m3u8.ts` generateM3u8Content |
| `Content-Length` as manifest fileSize | Use `statSync(path).size` after download | `downloader.ts` return value |
| Deleting tracks from non-selected playlists | D-DEL-SCOPE / D-DEL-ABANDONED | `sync-engine.ts` deletion logic |

---

## Metadata

**Analog search scope:** `src/main/ipc/`, `src/main/lib/`, `shared/`, `tests/lib/`, `src/renderer/src/screens/`, `src/preload/`
**Files scanned:** 12
**Pattern extraction date:** 2026-04-21
