---
phase: 03-sync-engine
verified: 2026-04-21T14:10:00Z
status: gaps_found
score: 13/15 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Progress events are pushed to renderer via webContents.send on each chunk and file completion (D-PROG-GRANULARITY, D-PROG-PUSH)"
    status: partial
    reason: "sync-engine.ts sends on 'sync:onProgress' but the IPC contract in ipc-types.ts defines the event as 'sync:progress'. The preload's on() method passes the event name directly to ipcRenderer.on(), so Phase 4's window.electronAPI.on('sync:progress', cb) would listen on the wrong channel and never receive progress events."
    artifacts:
      - path: "src/main/lib/sync-engine.ts"
        issue: "Line 116: webContents.send('sync:onProgress', payload) — should be 'sync:progress' to match ipc-types.ts contract"
    missing:
      - "Change 'sync:onProgress' to 'sync:progress' in emitProgress() in sync-engine.ts"
  - truth: "M3U8 files are written per-playlist with relative forward-slash paths (M3U8-01, M3U8-02)"
    status: partial
    reason: "M3U8 files ARE generated with correct relative paths and #EXTINF metadata. However, on first sync the M3U8 filename is the raw playlist UUID because the renderer never passes playlistNames in SyncOptions. The SyncEngineOpts.playlistNames field exists and the fallback chain in sync-engine.ts is correct, but PlaylistBrowserScreen.tsx calls sync.start() without building the playlistId→name map from its playlists state. After first sync the UUID is stored in the manifest and persists on subsequent runs."
    artifacts:
      - path: "src/renderer/src/screens/PlaylistBrowserScreen.tsx"
        issue: "handleSyncSelected() does not build playlistNames map from the playlists state array before calling sync.start()"
    missing:
      - "Build playlistNames: Record<string, string> from playlists.filter(p => selected.has(p.id)).reduce(...) and pass it in the SyncOptions argument to sync.start()"
---

# Phase 3: Sync Engine Verification Report

**Phase Goal:** Selected playlists are fully downloaded to the destination in Artist/Album/Track structure with M3U8 files, subsequent runs are incremental, duplicate tracks are stored once, and orphaned tracks are removed
**Verified:** 2026-04-21T14:10:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | p-limit@3 is a direct dependency (CJS-compatible, no ERR_REQUIRE_ESM) | VERIFIED | package.json: `"p-limit": "^3.1.0"`; `node -e "require('p-limit')"` exits 0 |
| 2 | SyncSummary has failed and failures fields so download errors are tracked | VERIFIED | ipc-types.ts lines 53-54: `failed: number` and `failures: Array<{ name: string; reason: string }>` |
| 3 | ManifestItem, ManifestPlaylist, SyncManifest, EMPTY_MANIFEST are exported from manifest.ts | VERIFIED | manifest.ts exports all 8 required symbols including readManifest, writeManifest, needsDownload, isReferencedByOtherPlaylist |
| 4 | generateM3u8() is exported from m3u8.ts with correct #EXTINF + forward-slash relative paths | VERIFIED | m3u8.ts line 27: `Math.round(item.runTimeTicks / 10_000_000)`; line 30: `.split(sep).join('/')` |
| 5 | downloadTrack() is exported from downloader.ts with AbortSignal + .part lifecycle | VERIFIED | downloader.ts: PassThrough for chunks, renameSync on success, unlinkSync in catch, statSync for fileSize |
| 6 | runSync() orchestrates the full sync pipeline: orphan scan through summary | VERIFIED | sync-engine.ts: 12-step pipeline fully implemented (lines 161-438) |
| 7 | Orphaned .part files from prior interrupted runs are deleted before sync starts | VERIFIED | sync-engine.ts: deleteOrphanedPartFiles() recursively scans and deletes .part files (lines 44-62) |
| 8 | Tracks already on disk with matching size are skipped (SYNC-05) | VERIFIED | sync-engine.ts lines 214-220: needsDownload() called; unchanged++ when false |
| 9 | Tracks removed from Jellyfin playlists are deleted only when not referenced by other playlists | VERIFIED | sync-engine.ts lines 232-246: isReferencedByOtherPlaylist() checked before toDelete.push(); unlinkSync only in step 7 |
| 10 | A track shared across two playlists is downloaded once (SYNC-07) | VERIFIED | sync-engine.ts lines 193-200: allTracksMeta deduplicates by itemId; toDownload derived from allTracksMeta |
| 11 | Progress events are pushed to renderer via webContents.send on each chunk and file completion | FAILED | sync-engine.ts line 116: sends on 'sync:onProgress'; ipc-types.ts line 90 defines contract as 'sync:progress'; preload passes event name directly to ipcRenderer.on() — Phase 4 subscriptions would receive no events |
| 12 | Cancellation via AbortSignal stops downloads and writes partial summary | VERIFIED | sync-engine.ts lines 354-388: AbortError/CanceledError re-thrown; signal.aborted check before manifest write |
| 13 | Failed tracks are skipped and recorded in summary.failures (D-ERR-SKIP) | VERIFIED | sync-engine.ts lines 365-378: summary.failed++, summary.failures.push({name, reason}) |
| 14 | Clicking Sync Selected opens a native folder picker dialog | VERIFIED | sync.ts lines 22-26: dialog.showOpenDialog with openDirectory property |
| 15 | M3U8 files are written per-playlist with relative forward-slash paths (M3U8-01, M3U8-02) | FAILED | M3U8 files ARE generated with correct content and paths, but playlist names default to UUID on first sync because PlaylistBrowserScreen.tsx does not pass playlistNames in SyncOptions |

**Score:** 13/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/main/lib/manifest.ts` | SyncManifest types + read/write/query helpers | VERIFIED | All 8 exports present; atomicWriteJson + safeReadJson imports confirmed |
| `src/main/lib/m3u8.ts` | M3U8 file generation | VERIFIED | generateM3u8 exported; 10_000_000 divisor; .split(sep).join('/') normalization |
| `src/main/lib/downloader.ts` | Single-track streaming download with .part lifecycle | VERIFIED | downloadTrack, buildDownloadUrl, buildLocalPath exported; PassThrough, renameSync static import, statSync |
| `shared/ipc-types.ts` | Extended SyncSummary with failed + failures fields | VERIFIED | failed: number, failures: Array<{name: string; reason: string}> |
| `src/main/lib/sync-engine.ts` | runSync() orchestrator — pure sync logic | VERIFIED | runSync and SyncEngineOpts exported; all 12 pipeline steps implemented |
| `src/main/ipc/sync.ts` | registerSyncHandlers() — thin IPC wrapper | VERIFIED | Exports registerSyncHandlers; dialog picker, runSync call, sync:cancel handler |
| `src/main/ipc/stubs.ts` | PHASE3_CHANNELS is empty array | VERIFIED | Line 6: `const PHASE3_CHANNELS: string[] = []`; no sync:cancel no-op block |
| `src/main/index.ts` | registerSyncHandlers() called | VERIFIED | Line 7 import; line 51 call between registerPlaylistHandlers and registerStubs |
| `src/renderer/src/screens/PlaylistBrowserScreen.tsx` | Sync Selected button calls sync.start() | VERIFIED | Line 60: `window.electronAPI.sync.start()`; syncing state; button disabled during sync |
| `tests/lib/manifest.test.ts` | Unit tests for manifest helpers | VERIFIED | 17 tests passing: needsDownload, isReferencedByOtherPlaylist, readManifest, writeManifest |
| `tests/lib/m3u8.test.ts` | Unit tests for M3U8 generation | VERIFIED | 8 tests passing: #EXTINF duration, forward-slash paths, omit-on-missing |
| `tests/lib/downloader.test.ts` | Unit tests for download URL and path construction | VERIFIED | 11 tests passing: buildDownloadUrl static=true, buildLocalPath FAT32 sanitization |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| manifest.ts | fs-utils.ts | atomicWriteJson + safeReadJson | WIRED | Line 4: `import { atomicWriteJson, safeReadJson } from './fs-utils'` |
| downloader.ts | fs-utils.ts | sanitizePathSegment | WIRED | Line 7: `import { sanitizePathSegment } from './fs-utils'`; used 3x in buildLocalPath |
| sync-engine.ts | manifest.ts | readManifest, writeManifest, needsDownload, isReferencedByOtherPlaylist | WIRED | Lines 13-18: all four functions imported and called in pipeline |
| sync-engine.ts | downloader.ts | downloadTrack, buildDownloadUrl, buildLocalPath | WIRED | Line 20: all three imported and called in downloadOne() |
| sync-engine.ts | m3u8.ts | generateM3u8 | WIRED | Line 21 import; line 426 call in step 10 |
| sync-engine.ts | jellyfin.ts | getApi + getPlaylistsApi | WIRED | Line 12 and line 9; both called in pipeline |
| sync.ts | sync-engine.ts | runSync() | WIRED | Line 3 import; line 42 call inside ipcMain.handle |
| index.ts | sync.ts | registerSyncHandlers() | WIRED | Line 7 import; line 51 call |
| PlaylistBrowserScreen.tsx | ipc-types.ts | window.electronAPI.sync.start() | WIRED | Line 60; TypeScript compiles clean |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| sync-engine.ts | playlistTracksMap | getPlaylistsApi(api).getPlaylistItems() paginated | Yes — paginated Jellyfin API with limit=500 | FLOWING |
| sync-engine.ts | manifest | readManifest(destination) via safeReadJson | Yes — reads from disk with EMPTY_MANIFEST fallback | FLOWING |
| sync-engine.ts | summary | Accumulated during download pipeline | Yes — counts added/removed/unchanged/failed | FLOWING |
| PlaylistBrowserScreen.tsx | playlists state | window.electronAPI.sync.getPlaylists() in useEffect | Yes — wired in Phase 2 | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| p-limit CJS require | `node -e "require('p-limit')"` | exits 0 | PASS |
| TypeScript compile (node context) | `npx tsc -p tsconfig.node.json --noEmit` | 0 errors | PASS |
| 49 unit tests passing | `npx vitest run` | 49 passed (4 files) | PASS |
| manifest.ts exports needsDownload | grep pattern | present on line 66 | PASS |
| sync-engine.ts exports runSync | code review | exported on line 146 | PASS |
| stubs.ts PHASE3_CHANNELS empty | code review | `= []` on line 6 | PASS |
| Progress channel name matches contract | cross-file check | MISMATCH: 'sync:onProgress' vs 'sync:progress' | FAIL |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| SYNC-01 | User can choose a destination folder | SATISFIED | sync.ts: dialog.showOpenDialog with openDirectory; store.set(lastDestination) |
| SYNC-02 | Downloads in original format, no transcoding | SATISFIED | downloader.ts buildDownloadUrl: `?static=true`; m3u8 test covers this |
| SYNC-03 | Files organized as Artist/Album/Track | SATISFIED | downloader.ts buildLocalPath: `join(destRoot, safeArtist, safeAlbum, safeFile)` |
| SYNC-04 | FAT32 sanitization per path segment | SATISFIED | buildLocalPath applies sanitizePathSegment to artist, album, and filename independently; 11 downloader tests including AC/DC, CON |
| SYNC-05 | Incremental sync skips existing tracks | SATISFIED | sync-engine.ts: needsDownload() checks manifest + existsSync + size match; 17 manifest tests |
| SYNC-06 | Removed tracks deleted from destination | SATISFIED | sync-engine.ts step 6-7: toDelete built from prior manifest itemIds not in current Jellyfin response |
| SYNC-07 | Track in multiple playlists downloaded once | SATISFIED | sync-engine.ts: allTracksMeta deduplicates across playlists; isReferencedByOtherPlaylist guards deletion |
| M3U8-01 | One .m3u8 per synced playlist | PARTIAL | File IS generated per playlist; content is correct; but filename is UUID on first sync (renderer doesn't pass playlistNames) |
| M3U8-02 | M3U8 paths are relative | SATISFIED | m3u8.ts: `relative(destRoot, absPath).split(sep).join('/')` — forward-slash relative paths |
| M3U8-03 | M3U8 includes #EXTINF with duration | SATISFIED | m3u8.ts: `#EXTINF:${durationSec},${item.name}` with `Math.round(ticks / 10_000_000)` |

### Anti-Patterns Found

| File | Location | Pattern | Severity | Impact |
|------|----------|---------|----------|--------|
| src/main/lib/sync-engine.ts | Line 116 | `webContents.send('sync:onProgress', ...)` — channel name does not match ipc-types contract `'sync:progress'` | Blocker | Phase 4's progress UI will receive zero events if it uses the typed `on('sync:progress', cb)` API |
| src/renderer/src/screens/PlaylistBrowserScreen.tsx | Lines 60-65 | `sync.start()` called without `playlistNames` — playlists state has display names but they are not passed | Warning | M3U8 files named by UUID on first sync; names persist as UUID in manifest on subsequent syncs |

### Human Verification Required

None — all items verifiable from static analysis and automated tests.

## Gaps Summary

Two gaps block full goal achievement:

**Gap 1 (Blocker): Progress event channel name mismatch**

The sync engine pushes progress via `webContents.send('sync:onProgress', ...)` (line 116 of sync-engine.ts), but the typed IPC contract in `shared/ipc-types.ts` line 90 defines the event as `'sync:progress'`. The preload's `on()` method at line 31 of `src/preload/index.ts` passes the event string directly to `ipcRenderer.on()` — so when Phase 4 wires up `window.electronAPI.on('sync:progress', cb)`, the callback will never be invoked. The fix is a one-character change: rename the string literal from `'sync:onProgress'` to `'sync:progress'` in `emitProgress()`.

**Gap 2 (Warning): M3U8 files named by UUID on first sync**

`PlaylistBrowserScreen.tsx` calls `sync.start({ playlistIds: Array.from(selected), destination: '', concurrentDownloads: 3 })` without including a `playlistNames` map. The renderer's `playlists` state already contains `{ id, name, trackCount }` for every loaded playlist, making it straightforward to build `playlistNames`. In sync-engine.ts the fallback chain is `playlistNames[id] ?? manifest.playlists[id]?.name ?? playlistId`, but since the renderer never passes names and no prior manifest entry exists on first sync, the UUID is what gets stored — and what gets used as the M3U8 filename on all subsequent runs too. The M3U8 file content (paths, EXTINF data) is fully correct; only the filename is wrong.

---

_Verified: 2026-04-21T14:10:00Z_
_Verifier: Claude (gsd-verifier)_
