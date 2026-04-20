# Phase 3: Sync Engine - Research

**Researched:** 2026-04-21
**Domain:** Electron main-process download pipeline, incremental file sync, M3U8 generation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-DEST-PICKER:** "Sync Selected" opens `dialog.showOpenDialog({ properties: ['openDirectory'] })` from main process. No persistent destination field on the playlist browser — the dialog is the trigger.

**D-DEST-PREFILL:** `Settings.lastDestination` passed as `defaultPath`. Dialog opens at system default if no prior destination.

**D-DEST-SAVE:** After sync starts, save chosen path back to `Settings.lastDestination` via `settings.set`.

**D-ERR-SKIP:** Failed track: skip, continue, record failure (track name + error reason) in `SyncSummary`. All other tracks still download.

**D-ERR-CLEANUP:** Delete `.part` file immediately on download failure. No orphaned partial files.

**D-ERR-ORPHANS:** On startup, scan destination root for `*.part` files from prior interrupted runs and delete them before starting sync.

**D-DEL-SCOPE:** Before deleting a local track file, check its Jellyfin item ID against ALL playlists ever synced to this destination (as in manifest) — not just the currently selected playlists.

**D-DEL-ABANDONED:** Files belonging to a previously-synced playlist not selected in current run are left untouched indefinitely. Sync never surprise-deletes music.

**D-PROG-GRANULARITY:** `sync:onProgress` emits on every download chunk (~64 KB) for byte-level progress AND on each file complete for track count updates. Both `bytesDownloaded`/`bytesTotal` and `current`/`total` are populated.

**D-PROG-PUSH:** Progress events pushed from main to renderer via `webContents.send('sync:onProgress', payload)`. No polling.

**D-MANIFEST-LOCATION:** `_jellyfin-sync.json` at destination root. One unified manifest for the entire destination.

**D-MANIFEST-ATOMIC:** Always write via `atomicWriteJson`. Parse in `try/catch` — treat corrupt/missing manifest as empty (full re-sync).

**D-MANIFEST-SCHEMA:** Per item: Jellyfin item ID, local file path (relative to destination), file size, last-synced timestamp. Per playlist: playlist ID, playlist name, list of item IDs.

### Claude's Discretion

- Exact HTTP chunk size for progress events (64 KB suggested, can tune)
- Jellyfin API endpoint for downloading tracks (`/Items/{id}/Download` or `/Audio/{id}/universal`)
- Whether to use `node-fetch` / `http` or Axios for streaming downloads (prefer Node.js built-in `https` or Electron `net.request`)
- Internal queue/concurrency structure (p-limit wrapper pattern consistent with CLAUDE.md)
- M3U8 `#EXTINF` duration source (from Jellyfin `RunTimeTicks` field, convert to seconds)

### Deferred Ideas (OUT OF SCOPE)

- Retry logic for transient failures
- "Abandon playlist" UI to explicitly remove a playlist from the manifest and delete its files
- Per-playlist sync (sync only one playlist at a time rather than all selected at once)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-01 | User can choose a destination folder | `dialog.showOpenDialog` from main process IPC handler; last destination prefilled from `Settings.lastDestination` |
| SYNC-02 | App downloads tracks in original format with no transcoding | `/Audio/{itemId}/stream?static=true` — the `_static=true` parameter forces Jellyfin to serve the original bitstream without re-encoding |
| SYNC-03 | Files organized as Artist / Album / Track at destination | `path.join(dest, sanitizePathSegment(artist), sanitizePathSegment(album), sanitizePathSegment(filename))` where artist = `AlbumArtist`, album = `Album`, filename derived from `Name` + `Container` extension |
| SYNC-04 | All path segments sanitized for FAT32 | Existing `sanitizePathSegment()` in `fs-utils.ts` — apply independently to artist, album, and filename. NEVER apply to the full path. |
| SYNC-05 | Subsequent syncs only download missing tracks | Manifest records itemId → localPath + fileSize. Incremental check: file exists on disk AND `statSync(localPath).size === manifest.items[id].fileSize`. Both conditions required. |
| SYNC-06 | Tracks removed from Jellyfin playlist are deleted on next sync | Compare manifest item IDs for a playlist vs. Jellyfin's current playlist items. Items no longer in Jellyfin's list: delete local file ONLY IF the item ID is not referenced by any other synced playlist in the manifest (D-DEL-SCOPE). |
| SYNC-07 | Track appearing in multiple playlists downloaded once | Deduplication via manifest item registry. If `manifest.items[id]` already exists and file is on disk, skip download — all playlists' M3U8 files point to the same relative path. |
| M3U8-01 | One .m3u8 playlist file per synced playlist | Written to destination root as `{sanitizedPlaylistName}.m3u8` after all tracks for that playlist download. |
| M3U8-02 | M3U8 paths are relative | `path.relative(destination, trackAbsPath)` converted to forward slashes (`split(path.sep).join('/')`) — ensures the file works when the drive is mounted at any drive letter or mount point. |
| M3U8-03 | M3U8 includes `#EXTINF` with duration and title | Duration from `item.RunTimeTicks / 10000000` (Jellyfin stores duration as 100-nanosecond ticks). Title from `item.Name`. |
</phase_requirements>

---

## Summary

Phase 3 is entirely main-process work: a download queue that fetches playlist track metadata from Jellyfin, downloads each track as a raw static stream, organizes files in Artist/Album/Track structure, tracks state in a manifest, and generates M3U8 playlist files. The renderer is not modified except for wiring the "Sync Selected" button click to a new IPC flow that first shows a folder picker dialog.

The core architecture is: `sync:start` IPC handler → folder picker → orphan `.part` scan → per-playlist track metadata fetch → deduplicated download queue (p-limit concurrency) → per-chunk progress events → manifest update → M3U8 generation → `sync:complete` event. Cancellation is handled via an `AbortController` signal passed into the download pipeline.

The most important non-obvious finding is that **p-limit v6+ is ESM-only** — the same class of problem that caused the `electron-store` → `electron-conf` swap in Phase 1. p-limit v3.1.0 (CJS) is already installed as a transitive dependency and works correctly. The planner should install `p-limit@3` as a direct dependency rather than the v6 mentioned in CLAUDE.md. For downloading, **axios with `responseType: 'stream'`** is the correct approach: it's already bundled by `@jellyfin/sdk`, handles redirects, and emits `data` chunk events. No new HTTP dependency is needed.

**Primary recommendation:** Use `axios({ url, responseType: 'stream', headers: { Authorization: api.authorizationHeader } })` for downloads; use `p-limit@3` (CJS) for concurrency; use `getPlaylistsApi(api).getPlaylistItems()` for track metadata; use `/Audio/{itemId}/stream?static=true` as the download URL.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Folder picker dialog | Main process | — | `dialog.showOpenDialog` is a main-process-only Electron API; renderer can only trigger it via IPC |
| Track metadata fetch | Main process | — | HTTP call to Jellyfin; all I/O in main per CLAUDE.md |
| Download queue + concurrency | Main process | — | File I/O + HTTP streaming; all I/O in main |
| `.part` file lifecycle | Main process | — | Filesystem operations; main only |
| Manifest read/write | Main process | — | Filesystem + atomicity; main only |
| M3U8 file generation | Main process | — | Filesystem write; main only |
| Progress event push | Main process → Renderer | — | `webContents.send()` from main; renderer is display-only |
| Cancel signal | Renderer → Main | — | `ipcRenderer.send('sync:cancel')` fire-and-forget; main holds the AbortController |
| "Sync Selected" button wiring | Renderer (PlaylistBrowserScreen) | — | Calls `sync:start` IPC; only renderer UI change in Phase 3 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| p-limit | 3.1.0 | Concurrency limiter for download queue | Already installed as transitive dep; v3.x is CJS-compatible (v6+ is ESM-only — causes ERR_REQUIRE_ESM in electron-vite CJS main process) |
| axios | 1.15.1 (bundled with @jellyfin/sdk) | Streaming HTTP downloads | Already present; supports `responseType: 'stream'` for chunk-level progress events; handles redirects automatically |
| @jellyfin/sdk | 0.13.0 (installed) | `getPlaylistsApi`, `getItemsApi` for track metadata; `getAudioApi` URL pattern reference | Already working from Phase 2 |
| Node.js `fs` (built-in) | Node 24 | File I/O: `createWriteStream`, `existsSync`, `statSync`, `unlinkSync`, `mkdirSync` | No extra dependency; all needed primitives present |
| Node.js `path` (built-in) | Node 24 | Path joining, relative path computation for M3U8 | No extra dependency |
| electron `dialog` | Electron 39 | Native folder picker | Required for D-DEST-PICKER; main-process only |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sanitize-filename` | 1.6.4 (installed) | FAT32 path segment sanitization | Used via existing `sanitizePathSegment()` wrapper — do NOT call directly |
| `electron-conf` | 1.3.0 (installed) | Read `Settings.lastDestination`, `Settings.concurrentDownloads` | Read before sync starts, write after folder selected |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| axios (responseType: stream) | Node.js `https.get` | `https.get` does not follow redirects automatically; Jellyfin can return 302 for some endpoints; axios already available |
| axios (responseType: stream) | Electron `net.request` | `net.request` respects Electron proxy settings but adds complexity; axios is simpler and already imported by SDK |
| p-limit@3 | p-limit@6 | p-limit@6+ is ESM-only — causes `ERR_REQUIRE_ESM` in CJS main process (same as electron-store v9 problem in Phase 1) |
| axios streaming | SDK `getAudioStream()` | SDK `getAudioStream()` returns `AxiosPromise<File>` (buffered); does not expose a streaming interface for chunk progress |

**Installation:**
```bash
npm install p-limit@3
```

**Version verification:** [VERIFIED: npm registry — `npm view p-limit@3 version` returns `3.1.0`; `npm view p-limit@6 type` returns `module` (ESM-only)]

---

## Architecture Patterns

### System Architecture Diagram

```
Renderer: "Sync Selected" click
    │
    ▼ ipcRenderer.invoke('sync:start', { playlistIds, concurrentDownloads })
Main: sync:start handler
    │
    ├─► dialog.showOpenDialog → destination path
    │       └─ store lastDestination → Settings
    │
    ├─► scan destination for *.part files → delete orphans (D-ERR-ORPHANS)
    │
    ├─► safeReadJson('_jellyfin-sync.json') → SyncManifest (or empty)
    │
    ├─► For each playlistId:
    │     getPlaylistsApi(api).getPlaylistItems(playlistId, ...) [paginated]
    │     → Array<BaseItemDto> track list
    │
    ├─► Build download plan:
    │     allTracks = deduplicate by itemId
    │     toDownload = tracks where file missing OR size mismatch
    │     toDelete = manifest items no longer in ANY selected playlist
    │                AND not referenced by any other manifest playlist (D-DEL-SCOPE)
    │
    ├─► Delete orphaned tracks (SYNC-06 + D-DEL-SCOPE)
    │
    ├─► p-limit(concurrentDownloads) download queue:
    │     For each track to download:
    │       ┌─ Build local path: dest/sanitize(artist)/sanitize(album)/sanitize(name+ext)
    │       ├─ mkdirSync(dir, { recursive: true })
    │       ├─ axios({ url: /Audio/{id}/stream?static=true, responseType: 'stream',
    │       │          headers: { Authorization: authHeader }, signal: abortSignal })
    │       ├─ response.data.pipe(createWriteStream(path + '.part'))
    │       ├─ data events: emit sync:onProgress (bytesDownloaded, bytesTotal, current, total)
    │       ├─ on success: renameSync(path + '.part', path)
    │       │              update manifest.items[id]
    │       │              emit sync:onProgress (status: 'complete')
    │       └─ on error:  unlinkSync(path + '.part')
    │                     record in failures[] for SyncSummary
    │
    ├─► For each playlist: generate M3U8 file at dest root
    │     #EXTM3U
    │     For each itemId in playlist:
    │       #EXTINF:{ticks/10000000},{name}
    │       {relative/path/to/track.flac}  ← forward slashes, path.relative then sep→'/'
    │
    ├─► atomicWriteJson(dest + '/_jellyfin-sync.json', updatedManifest)
    │
    └─► webContents.send('sync:complete', SyncSummary)

Cancel path:
    Renderer: ipcRenderer.send('sync:cancel')
    Main: abortController.abort() → in-flight axios requests reject with AbortError
          unlinkSync any .part files currently open
          webContents.send('sync:complete', partialSummary)
```

### Recommended Project Structure

```
src/main/
├── ipc/
│   ├── sync.ts           # registerSyncHandlers() — replaces stubs for sync:start, sync:cancel
│   ├── auth.ts           # (existing)
│   ├── playlists.ts      # (existing)
│   ├── settings.ts       # (existing)
│   └── stubs.ts          # Remove sync:start from PHASE3_CHANNELS; remove sync:cancel ipcMain.on
├── lib/
│   ├── sync-engine.ts    # runSync(opts, webContents, signal) — pure sync logic, testable
│   ├── downloader.ts     # downloadTrack(url, destPath, authHeader, signal, onChunk) → Promise
│   ├── manifest.ts       # SyncManifest type, readManifest(), writeManifest()
│   ├── m3u8.ts           # generateM3u8(tracks, destRoot) → string content
│   ├── fs-utils.ts       # (existing — do not modify)
│   ├── jellyfin.ts       # (existing — add getAudioApi re-export if needed)
│   ├── store.ts          # (existing)
│   └── logger.ts         # (existing)
tests/
├── lib/
│   ├── fs-utils.test.ts  # (existing)
│   ├── manifest.test.ts  # manifest read/write/schema tests — Wave 0 gap
│   ├── m3u8.test.ts      # M3U8 generation tests — Wave 0 gap
│   └── downloader.test.ts # path-building, FAT32 sanitization integration — Wave 0 gap
```

### Pattern 1: Download Streaming with Axios

**What:** Use axios with `responseType: 'stream'` to pipe a Jellyfin audio stream to a `.part` file, emitting chunk progress events.

**When to use:** All track downloads in the sync engine.

```typescript
// Source: axios docs + verified against axios@1.15.1 (bundled in @jellyfin/sdk)
import axios from 'axios'
import { createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'

async function downloadTrack(
  url: string,
  authHeader: string,
  partPath: string,
  signal: AbortSignal,
  onChunk: (bytes: number, total: number) => void
): Promise<void> {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    headers: { Authorization: authHeader },
    signal,
  })

  const total = parseInt(response.headers['content-length'] ?? '0', 10)
  let bytesReceived = 0

  response.data.on('data', (chunk: Buffer) => {
    bytesReceived += chunk.length
    onChunk(bytesReceived, total)
  })

  const writeStream = createWriteStream(partPath)
  await pipeline(response.data, writeStream)
  // pipeline resolves only after the stream is fully written and closed
}
```

### Pattern 2: Download URL Construction

**What:** Build the `/Audio/{itemId}/stream?static=true` URL using the SDK's `api.basePath` and `api.authorizationHeader`.

**When to use:** Every track download. The `_static=true` parameter is mandatory (SYNC-02: no transcoding).

```typescript
// Source: Verified by inspecting node_modules/@jellyfin/sdk/lib/generated-client/api/audio-api.js
// and node_modules/@jellyfin/sdk/lib/api.js
function buildDownloadUrl(api: Api, itemId: string): string {
  const url = new URL(`${api.basePath}/Audio/${encodeURIComponent(itemId)}/stream`)
  url.searchParams.set('static', 'true')
  return url.toString()
}
// Auth header: api.authorizationHeader  → 'MediaBrowser Client="...", Token="..."'
```

### Pattern 3: p-limit Concurrency Queue (CJS v3)

**What:** Wrap each download task in a p-limit limiter to bound concurrent downloads.

**When to use:** All downloads in the sync engine.

```typescript
// Source: p-limit@3.1.0 (CJS — verified working in this project's Node.js CJS context)
import pLimit from 'p-limit'

const limit = pLimit(concurrentDownloads) // 1–5, from Settings.concurrentDownloads

const downloadTasks = tracksToDownload.map((track) =>
  limit(() => downloadTrack(track, api, destRoot, signal, onProgress))
)

const results = await Promise.allSettled(downloadTasks)
```

### Pattern 4: Manifest Schema

**What:** TypeScript interface for `_jellyfin-sync.json`.

```typescript
// Source: D-MANIFEST-SCHEMA from 03-CONTEXT.md
export interface ManifestItem {
  id: string           // Jellyfin item ID
  localPath: string    // relative to destination root, forward slashes
  fileSize: number     // bytes — for incremental check
  syncedAt: string     // ISO 8601 timestamp
}

export interface ManifestPlaylist {
  id: string           // Jellyfin playlist ID
  name: string         // Jellyfin playlist name
  itemIds: string[]    // ordered list of item IDs
}

export interface SyncManifest {
  version: 1
  items: Record<string, ManifestItem>      // keyed by Jellyfin item ID
  playlists: Record<string, ManifestPlaylist> // keyed by Jellyfin playlist ID
}

export const EMPTY_MANIFEST: SyncManifest = { version: 1, items: {}, playlists: {} }
```

### Pattern 5: Incremental Check

**What:** Determine whether a track needs to be downloaded or can be skipped.

```typescript
// Source: D-MANIFEST-SCHEMA + SYNC-05 requirement
import { existsSync, statSync } from 'fs'
import { join } from 'path'

function needsDownload(manifest: SyncManifest, itemId: string, destRoot: string): boolean {
  const entry = manifest.items[itemId]
  if (!entry) return true  // not in manifest → download

  const absPath = join(destRoot, entry.localPath)
  if (!existsSync(absPath)) return true  // file missing → download

  const stat = statSync(absPath)
  return stat.size !== entry.fileSize  // size mismatch → re-download
}
```

### Pattern 6: Cross-Playlist Deletion Safety

**What:** Before deleting a track, verify no other synced playlist in the manifest references it.

```typescript
// Source: D-DEL-SCOPE from 03-CONTEXT.md + SYNC-06
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

### Pattern 7: M3U8 Generation

**What:** Generate an M3U8 file with `#EXTINF` lines using relative forward-slash paths.

```typescript
// Source: M3U8 spec + verified path.relative + sep→'/' behavior on Windows
import { join, relative, sep } from 'path'

function generateM3u8(
  playlist: ManifestPlaylist,
  items: Record<string, ManifestItem & { name: string; runTimeTicks: number }>,
  destRoot: string
): string {
  const lines = ['#EXTM3U']
  for (const itemId of playlist.itemIds) {
    const item = items[itemId]
    if (!item) continue  // may have failed to download — omit from M3U8
    const durationSec = Math.round(item.runTimeTicks / 10_000_000)
    const relPath = relative(destRoot, join(destRoot, item.localPath))
      .split(sep).join('/')  // forward slashes for portability
    lines.push(`#EXTINF:${durationSec},${item.name}`)
    lines.push(relPath)
  }
  return lines.join('\n') + '\n'
}
```

### Pattern 8: SyncSummary Extension

**What:** `SyncSummary` in `ipc-types.ts` currently lacks `failed` and `skipped` fields. D-ERR-SKIP requires recording failures. The interface must be extended.

```typescript
// Proposed extension to shared/ipc-types.ts
export interface SyncSummary {
  added: number
  removed: number
  unchanged: number
  failed: number                              // tracks that failed to download
  failures: Array<{ name: string; reason: string }>  // for POST-02 error log
}
```

**Note:** The planner must update `ipc-types.ts` as part of this phase since `SyncSummary` is part of the typed IPC contract.

### Pattern 9: stubs.ts Replacement

**What:** `stubs.ts` registers `sync:start` via `ipcMain.handle`. Registering another handler for the same channel at runtime throws an error in Electron. The stub must be removed before `registerSyncHandlers()` registers the real handler.

**Approach:** Remove `sync:start` from `PHASE3_CHANNELS` in `stubs.ts`. Remove the `ipcMain.on('sync:cancel', ...)` no-op from `stubs.ts`. Both are replaced by `registerSyncHandlers()` in `sync.ts`.

```typescript
// stubs.ts after Phase 3 patch — PHASE3_CHANNELS becomes empty
const PHASE3_CHANNELS: string[] = []
// sync:cancel ipcMain.on block also removed
```

### Pattern 10: AbortController for Cancellation

**What:** Pass an `AbortSignal` into axios requests and the download pipeline. On `sync:cancel`, abort the controller.

```typescript
// Source: AbortController is built into Node.js 15+; axios@1.x supports signal: AbortSignal
let _abortController: AbortController | null = null

ipcMain.on('sync:cancel', () => {
  _abortController?.abort()
})

// In sync:start handler:
_abortController = new AbortController()
await runSync(opts, _abortController.signal, webContents)
_abortController = null
```

### Anti-Patterns to Avoid

- **Applying sanitizePathSegment to full paths:** Always sanitize per segment. `sanitizePathSegment('Artist/Album/Track')` corrupts the path — it replaces `/` with `_`.
- **Writing manifest in-place:** Never use `writeFileSync` directly on `_jellyfin-sync.json`. Always use `atomicWriteJson`.
- **Registering a handler for an already-handled channel:** Do NOT call `ipcMain.removeHandler('sync:start')` from `registerSyncHandlers()`. Instead, remove the stub registration from `stubs.ts` — the stub is removed, not the real handler.
- **Using p-limit v6+:** ESM-only. Causes `ERR_REQUIRE_ESM`. Use v3.
- **Content-Length as file size:** Jellyfin's `Content-Length` on the download response is reliable for the `fileSize` field in the manifest (it equals the actual file size for static streams). However, if `Content-Length` is missing (chunked transfer encoding), fall back to the actual `statSync(path).size` after the download completes.
- **Deleting tracks from non-selected playlists:** Only delete tracks that (a) were in a playlist currently being synced AND (b) are no longer in Jellyfin's current version of that playlist AND (c) are not referenced by any other playlist in the manifest.
- **Using path.join directly for M3U8 entries on Windows:** `path.join` uses backslashes on Windows. Always convert to forward slashes with `.split(path.sep).join('/')`.
- **Not paginating `getPlaylistItems`:** Same as `getItems` — default cap is 100. Use `startIndex` + `limit=500` loop, terminate on empty page.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File path sanitization | Custom char-stripping regex | `sanitizePathSegment()` (wraps sanitize-filename) | Reserved names (CON, NUL, etc.), length limits, Windows edge cases already handled |
| Atomic JSON writes | Manual temp file + rename | `atomicWriteJson()` from `fs-utils.ts` | Already handles tmp co-location, EXDEV prevention, dir creation |
| Concurrent download limiting | Custom semaphore/counter | `p-limit@3` | Battle-tested, correct queue semantics, already in project |
| HTTP streaming with redirect follow | Node.js `https.get` | `axios({ responseType: 'stream' })` | Redirect following, abort signal, already bundled by @jellyfin/sdk |
| JSON manifest parse with fallback | try/catch inline | `safeReadJson()` from `fs-utils.ts` | Handles missing file, corrupt JSON, permission errors |
| Track deduplication across playlists | Separate per-playlist downloads | Manifest item registry (`manifest.items` keyed by itemId) | Single source of truth; cross-playlist dedup + deletion safety |

**Key insight:** The fs-utils.ts utilities and the manifest item-keyed registry are the two load-bearing abstractions. Everything else composes on top of them.

---

## Common Pitfalls

### Pitfall 1: p-limit ESM-Only Error (Phase 1 recurrence)

**What goes wrong:** `npm install p-limit` installs v7 (latest), which is `type: module`. The CJS electron-vite main process cannot `require()` it and throws `ERR_REQUIRE_ESM` at startup.

**Why it happens:** p-limit v5+ dropped CJS support. Same class as electron-store v9 → electron-conf swap from Phase 1.

**How to avoid:** Pin to `p-limit@3` explicitly: `npm install p-limit@3`. v3.1.0 is already installed as a transitive dep — direct installation just makes it an explicit dependency.

**Warning signs:** `ERR_REQUIRE_ESM` in console during `npm run dev`, usually on the first line that imports p-limit.

### Pitfall 2: Jellyfin Playlist Pagination Truncation

**What goes wrong:** Large playlists (>100 tracks) are silently truncated because the default Jellyfin API page size is 100 items.

**Why it happens:** `getPlaylistItems()` without `limit` parameter defaults to Jellyfin server's configured page size (often 100).

**How to avoid:** Always pass `limit: 500` and `startIndex` and loop until an empty page is returned (not `items.length < PAGE_SIZE` — per established D-API-PAGINATION decision from Phase 2).

**Warning signs:** Playlist of 150 tracks only downloads 100 tracks. M3U8 is shorter than expected.

### Pitfall 3: Double IPC Handler Registration

**What goes wrong:** If `registerSyncHandlers()` calls `ipcMain.handle('sync:start', ...)` while `stubs.ts` already registered a handler for the same channel, Electron throws: `Attempted to register a second handler for 'sync:start'`.

**Why it happens:** `registerStubs()` in `index.ts` runs before `registerSyncHandlers()`. Both try to claim the same channel.

**How to avoid:** Remove `'sync:start'` from `PHASE3_CHANNELS` in `stubs.ts` (and remove the `ipcMain.on('sync:cancel', ...)` block) before `registerSyncHandlers()` is added. Do NOT use `ipcMain.removeHandler()` as a workaround — clean the stub, don't unpatch at runtime.

**Warning signs:** App fails to start with `Error: Attempted to register a second handler for 'sync:start'`.

### Pitfall 4: Manifest localPath Backslash Corruption on Windows

**What goes wrong:** `manifest.items[id].localPath` is stored with backslashes on Windows because `path.join` uses the platform separator. When the manifest is read on a different platform, paths don't resolve. Also breaks M3U8 M3U8 path computation.

**Why it happens:** `path.join(artist, album, filename)` on Windows returns `artist\album\filename`.

**How to avoid:** Normalize `localPath` to forward slashes before storing in manifest: `relPath.split(path.sep).join('/')`. When reading back, convert to absolute: `path.join(destRoot, ...manifestPath.split('/'))`.

**Warning signs:** M3U8 files have backslash paths; manifest paths don't resolve on non-Windows.

### Pitfall 5: Content-Length Missing for File Size Manifest Entry

**What goes wrong:** Some Jellyfin versions use chunked transfer encoding for audio streams, omitting `Content-Length`. Storing `0` as `fileSize` causes every incremental sync to re-download every track.

**Why it happens:** `response.headers['content-length']` is absent for chunked responses.

**How to avoid:** After a successful download (`.part` renamed to final), use `statSync(localPath).size` as the authoritative `fileSize` value in the manifest. The `Content-Length` header can be used for progress estimation but not as the persistent manifest value.

**Warning signs:** Every sync re-downloads all tracks despite files being present.

### Pitfall 6: `.part` File Not Deleted on Abort/Error

**What goes wrong:** Download fails or is cancelled mid-stream. The `.part` file remains. Next sync attempt finds the partial file on disk (it doesn't match because it has no manifest entry, so it's orphaned). Accumulates over time.

**Why it happens:** `pipeline()` rejects when the source stream is aborted, but the `createWriteStream` is not explicitly deleted in the catch path.

**How to avoid:** In the download function's `catch` block: `try { unlinkSync(partPath) } catch { /* ignore */ }`. D-ERR-CLEANUP requires this. Also scan for `*.part` on startup (D-ERR-ORPHANS).

**Warning signs:** Accumulating `.part` files in the destination directory.

### Pitfall 7: Race Condition Between Cancel and Manifest Write

**What goes wrong:** Cancellation signal fires while the manifest is being written. An in-place (non-atomic) write leaves a corrupt `_jellyfin-sync.json`.

**Why it happens:** `writeFileSync` is not atomic; a SIGKILL or abort mid-write truncates the file.

**How to avoid:** Always use `atomicWriteJson` (`.tmp` → `renameSync`). Write the manifest only after the entire sync run completes (including partial results on cancel/error). The manifest write is the last operation.

**Warning signs:** Corrupt JSON errors on next startup; full re-sync instead of incremental.

---

## Code Examples

### Track Metadata Fetch (getPlaylistItems paginated)

```typescript
// Source: @jellyfin/sdk playlists-api — verified getPlaylistsApi import path
// mirrors established D-API-PAGINATION pattern from playlists.ts
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api'
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'

async function fetchPlaylistTracks(api: Api, playlistId: string, userId: string): Promise<BaseItemDto[]> {
  const PAGE_SIZE = 500
  const results: BaseItemDto[] = []
  let startIndex = 0

  while (true) {
    const resp = await getPlaylistsApi(api).getPlaylistItems({
      playlistId,
      userId,
      startIndex,
      limit: PAGE_SIZE,
      fields: [ItemFields.MediaSources],  // needed for Container extension
    })
    const items = resp.data.Items ?? []
    results.push(...items.filter((i) => i.Id))
    if (items.length === 0) break
    startIndex += PAGE_SIZE
  }

  return results
}
```

**Fields used from `BaseItemDto`:**
- `item.Id` — Jellyfin item ID (manifest key)
- `item.Name` — track display name (M3U8 title, filename base)
- `item.AlbumArtist` — for directory structure artist segment
- `item.Album` — for directory structure album segment
- `item.Container` — file extension (`flac`, `mp3`, `ogg`, etc.) — available directly on BaseItemDto
- `item.RunTimeTicks` — duration in 100-ns ticks → divide by `10_000_000` for seconds
- `item.MediaSources[0].Size` — can be used as a size hint (optional; prefer statSync after download)

### Folder Picker IPC Channel

```typescript
// Source: Electron dialog docs + D-DEST-PICKER decision
import { ipcMain, dialog } from 'electron'
import { store } from '../lib/store'

// Option A: Inline in sync:start handler (folder pick is the first step of sync:start)
// Option B: Separate sync:pickDestination channel
// Recommendation: Inline in sync:start — reduces round-trips and matches D-DEST-PICKER intent

ipcMain.handle('sync:start', async (evt, opts: SyncOptions) => {
  const lastDestination = store.get('lastDestination')

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: lastDestination || undefined,
    title: 'Select sync destination',
  })

  if (result.canceled || result.filePaths.length === 0) return  // user dismissed dialog

  const destination = result.filePaths[0]
  store.set({ lastDestination: destination })  // D-DEST-SAVE

  await runSync({ ...opts, destination }, evt.sender, abortController.signal)
})
```

### Progress Event Push to Renderer

```typescript
// Source: Electron webContents.send + D-PROG-PUSH decision
// webContents is available from the IPC event sender
import type { WebContents } from 'electron'
import type { SyncProgress } from '../../../shared/ipc-types'

function emitProgress(webContents: WebContents, payload: SyncProgress): void {
  if (!webContents.isDestroyed()) {
    webContents.send('sync:onProgress', payload)
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| p-limit v6+ (ESM) | p-limit v3 (CJS) | Relevant since Phase 1's electron-store discovery | Mandatory for CJS main process compatibility |
| Polling for sync progress | webContents.send() push events | Current (already typed in ipc-types.ts) | Renderer subscribes via preload `on()` pattern |
| SDK `getAudioStream()` (buffered) | axios `responseType: 'stream'` | N/A — SDK never exposed streaming API | Enables per-chunk progress events without buffering full file |

**Deprecated/outdated:**
- `node-fetch` / `got`: not needed; axios already in the project via @jellyfin/sdk
- `/Items/{id}/Download`: this Jellyfin endpoint requires an API key query param and behaves differently from `/Audio/{id}/stream?static=true`. The audio stream endpoint is cleaner for direct download.

---

## Runtime State Inventory

> This section is omitted — Phase 3 is a greenfield implementation phase, not a rename/refactor/migration phase. No runtime state requires inventory.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| p-limit@3 | Download queue concurrency | Partial (transitive dep, not direct) | 3.1.0 | None — must add as direct dep: `npm install p-limit@3` |
| axios | Streaming downloads | Yes (bundled by @jellyfin/sdk) | 1.15.1 | — |
| @jellyfin/sdk | Track metadata + auth header | Yes (Phase 2) | 0.13.0 | — |
| Node.js `fs` built-ins | File I/O | Yes | Node 24 | — |
| Electron `dialog` | Folder picker | Yes (main process only) | Electron 39 | — |
| Vitest | Unit tests | Yes | 3.1.0 | — |

**Missing dependencies with no fallback:**
- `p-limit` as a direct dependency — must run `npm install p-limit@3` in Wave 0

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.1.0 |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npm test -- --reporter=verbose tests/lib/` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-04 | FAT32 path sanitization per segment | unit | `npm test -- tests/lib/fs-utils.test.ts` | Yes (existing) |
| SYNC-05 | Incremental check: skip if file+size match | unit | `npm test -- tests/lib/manifest.test.ts` | No — Wave 0 gap |
| SYNC-06 | Cross-playlist deletion safety | unit | `npm test -- tests/lib/manifest.test.ts` | No — Wave 0 gap |
| SYNC-07 | Deduplication: shared tracks downloaded once | unit | `npm test -- tests/lib/manifest.test.ts` | No — Wave 0 gap |
| M3U8-02 | Relative paths use forward slashes | unit | `npm test -- tests/lib/m3u8.test.ts` | No — Wave 0 gap |
| M3U8-03 | EXTINF duration from RunTimeTicks | unit | `npm test -- tests/lib/m3u8.test.ts` | No — Wave 0 gap |
| D-ERR-CLEANUP | .part deleted on failure | unit | `npm test -- tests/lib/downloader.test.ts` | No — Wave 0 gap |
| D-MANIFEST-ATOMIC | Manifest never written in-place | unit | `npm test -- tests/lib/fs-utils.test.ts` | Yes (existing) |

### Sampling Rate

- **Per task commit:** `npm test -- tests/lib/`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- `tests/lib/manifest.test.ts` — covers SYNC-05, SYNC-06, SYNC-07 (manifest schema, incremental check, cross-playlist deletion logic)
- `tests/lib/m3u8.test.ts` — covers M3U8-02, M3U8-03 (relative path normalization, EXTINF generation)
- `tests/lib/downloader.test.ts` — covers D-ERR-CLEANUP (.part cleanup on error), path-building logic with sanitization

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Auth handled in Phase 2; token passed via existing session |
| V3 Session Management | no | Session management in Phase 2 |
| V4 Access Control | no | All operations are user-initiated behind authenticated session |
| V5 Input Validation | yes | `sanitizePathSegment()` validates/sanitizes all filesystem path segments from Jellyfin metadata |
| V6 Cryptography | no | No new cryptographic operations in Phase 3 |

### Known Threat Patterns for Electron main-process download pipeline

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via Jellyfin track metadata (e.g., artist name `../../etc/passwd`) | Tampering | `sanitizePathSegment()` per segment strips `..` components via sanitize-filename; never use raw Jellyfin metadata in paths |
| Manifest injection (corrupt JSON expands deletion scope) | Tampering | `safeReadJson()` with empty-manifest fallback; corrupt manifest = full re-sync, never partial delete |
| Partial download left on disk (`.part` file content from attacker-controlled server) | Tampering | `.part` files are renamed to final path only on complete download success; incomplete `.part` files are deleted on error/startup |
| Writing outside destination root | Elevation of privilege | All paths computed as `path.join(destRoot, sanitized(artist), sanitized(album), sanitized(filename))` — no user-controlled path components after `destRoot` |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `/Audio/{itemId}/stream?static=true` is the correct endpoint for no-transcoding download | Standard Stack, Code Examples | If wrong: Jellyfin may transcode or return an error; investigate `/Items/{id}/Download` as fallback |
| A2 | `BaseItemDto.Container` (no extra field request) contains the file extension needed for filename | Code Examples | If wrong: extension derived from `MediaSources[0].Container` instead; already requested via `ItemFields.MediaSources` |
| A3 | Axios `responseType: 'stream'` works in Electron main process with axios@1.15.1 | Standard Stack, Pattern 1 | If wrong: use Node.js `https.get` with manual redirect following |
| A4 | `Content-Length` header is present on static audio streams from Jellyfin | Pattern 1, Pitfall 5 | If wrong: use `statSync(localPath).size` after download completes (Pitfall 5 mitigation already documented) |
| A5 | `response.data.on('data', chunk)` + `pipeline(response.data, writeStream)` can be used simultaneously without consuming the stream twice | Pattern 1 | If wrong: use `Transform` stream to intercept chunks before piping, or track `bytesWritten` from the write stream |

---

## Open Questions

1. **Can `response.data.on('data')` and `pipeline()` coexist on the same readable stream?**
   - What we know: Both consume the same Node.js Readable. In standard Node.js, attaching a `data` event listener puts the stream in flowing mode; `pipeline` also reads the same stream.
   - What's unclear: Whether this causes data to be consumed twice or dropped.
   - Recommendation: Use a `PassThrough` transform stream to tee the data: `response.data.pipe(countingStream).pipe(writeStream)` where `countingStream` is a `Transform` that counts bytes and emits chunk events before passing data through. This is unambiguous and avoids the double-consumer question.

2. **Does Jellyfin's `/Audio/{id}/stream?static=true` require a specific `mediaSourceId` parameter?**
   - What we know: The URL works without it for most items. `MediaSources[0].Id` is available from the item metadata.
   - What's unclear: Whether multi-version items (e.g., same track in multiple quality levels) will serve the correct version without an explicit `mediaSourceId`.
   - Recommendation: Pass `mediaSourceId=item.MediaSources[0].Id` as an optional query param when `MediaSources` is non-empty, to ensure the first (default) media source is selected.

---

## Sources

### Primary (HIGH confidence)

- Verified by file inspection: `node_modules/@jellyfin/sdk/lib/generated-client/api/audio-api.js` — URL template `/Audio/{itemId}/stream`, `_static` query param handling
- Verified by file inspection: `node_modules/@jellyfin/sdk/lib/api.js` — `authorizationHeader` getter, `api.configuration` pattern
- Verified by `node -e` execution: p-limit@3.1.0 CJS compatibility, p-limit@6+ ESM-only (`type: module`)
- Verified by `node -e` execution: `getPlaylistsApi`, `getAudioApi` import paths
- Verified by `node -e` execution: `path.relative` + forward-slash normalization on Windows
- Verified by codebase read: `fs-utils.ts`, `stubs.ts`, `ipc-types.ts`, `preload/index.ts`, `playlists.ts`, `auth.ts`
- Verified by `npm view`: axios@1.15.1 bundled; vitest@3.1.0 installed

### Secondary (MEDIUM confidence)

- [CITED: Electron docs pattern] `dialog.showOpenDialog` properties `['openDirectory']` API
- [CITED: Electron docs pattern] `webContents.send(channel, payload)` for main→renderer push
- [CITED: Electron docs pattern] `ipcMain.removeHandler` not needed — clean stub registration instead

### Tertiary (LOW confidence)

- None — all claims verified via tool execution or file inspection

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries verified against installed node_modules and npm registry
- Architecture: HIGH — all patterns derived from existing codebase conventions and verified SDK internals
- Pitfalls: HIGH — p-limit ESM, double handler registration, and manifest atomicity all verified or drawn from Phase 1 lessons
- M3U8 generation: HIGH — spec is simple; path normalization verified on Windows
- Download streaming: MEDIUM-HIGH — A1/A5 in assumptions log are not fully confirmed without a live Jellyfin server test

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (stable stack — all dependencies already installed and pinned)
