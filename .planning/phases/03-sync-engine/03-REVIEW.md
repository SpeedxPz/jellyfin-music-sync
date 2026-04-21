---
phase: 03-sync-engine
reviewed: 2026-04-21T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/main/lib/manifest.ts
  - src/main/lib/m3u8.ts
  - src/main/lib/downloader.ts
  - src/main/lib/sync-engine.ts
  - src/main/ipc/sync.ts
  - src/main/ipc/stubs.ts
  - src/main/index.ts
  - src/renderer/src/screens/PlaylistBrowserScreen.tsx
  - shared/ipc-types.ts
  - tests/lib/manifest.test.ts
  - tests/lib/m3u8.test.ts
  - tests/lib/downloader.test.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-21
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

All core architectural requirements from CLAUDE.md are satisfied: contextIsolation and nodeIntegration are correctly enforced, manifest writes are atomic (.tmp → rename via atomicWriteJson), .part files are cleaned up in all error paths including the catch block and the orphan scan on startup, cross-playlist deletion correctly calls `isReferencedByOtherPlaylist` before unlinking, localPath is stored as forward-slash relative paths, `webContents.isDestroyed()` is guarded before every `send()`, p-limit is used to bound concurrency to [1, 5], and there is no IPC double-handler risk (stubs.ts explicitly documents that sync channels moved to sync.ts and PHASE3_CHANNELS is empty).

One critical bug exists in how the Jellyfin auth header is constructed in the download queue. Three warnings cover: post-cancellation pipeline continuation (sync completes manifest+M3U8 writes after abort), the AbortError re-throw being silently swallowed by Promise.allSettled, and playlist names permanently defaulting to raw Jellyfin UUIDs on first sync. Three info items cover test coverage gaps, non-atomic M3U8 writes, and inaccurate concurrent progress counters.

---

## Critical Issues

### CR-01: Auth header construction bypasses SDK — missing required Jellyfin fields

**File:** `src/main/lib/sync-engine.ts:273-275`

**Issue:** The code constructs the Authorization header manually:

```ts
const authHeader = api.accessToken
  ? `MediaBrowser Token="${api.accessToken}"`
  : (api as unknown as { authorizationHeader: string }).authorizationHeader
```

The manually-built string `MediaBrowser Token="<token>"` omits the required Jellyfin MediaBrowser fields: `Client`, `Device`, `DeviceId`, and `Version`. Jellyfin rejects requests with incomplete authorization headers. The SDK's own `authorizationHeader` property already includes all required fields in the correct format — and it is always present on an authenticated `Api` instance, making the `api.accessToken` branch dead code that produces a malformed header.

The `as unknown as { authorizationHeader: string }` double-cast exists because the TS type declaration for the SDK's `Api` class may not expose `authorizationHeader` directly, but the property is part of the public API.

**Fix:** Use the SDK's `authorizationHeader` directly in all cases:

```ts
// The SDK's authorizationHeader includes all required fields:
// MediaBrowser Client="...", Device="...", DeviceId="...", Version="...", Token="..."
const authHeader = (api as unknown as { authorizationHeader: string }).authorizationHeader
```

Or, if the SDK version in use exposes it cleanly:

```ts
import type { Api } from '@jellyfin/sdk'
const authHeader = (api as Api & { authorizationHeader: string }).authorizationHeader
```

Remove the `api.accessToken` branch entirely. Any authenticated `Api` instance will always have `authorizationHeader` populated.

---

## Warnings

### WR-01: Cancelled sync still writes manifest and M3U8 after abort

**File:** `src/main/lib/sync-engine.ts:377-423`

**Issue:** `Promise.allSettled(downloadTasks)` catches every settled result — including re-thrown `AbortError`s from within `downloadOne`. After `allSettled` resolves, execution continues unconditionally into steps 9-11: updating `manifest.playlists`, writing M3U8 files, and writing the manifest atomically. A user who cancels mid-sync will have their manifest and M3U8 silently updated to reflect whatever partial state was downloaded.

This can create a divergence: the manifest records tracks that were partially committed during the cancelled run, while the user may expect cancellation to leave the destination unchanged.

**Fix:** Check `signal.aborted` after `Promise.allSettled` returns and skip the write steps:

```ts
await Promise.allSettled(downloadTasks)

// If sync was cancelled, skip writing manifest and M3U8 to avoid partial state.
// Orphaned .part files are already cleaned up by downloadTrack's catch block.
if (signal.aborted) {
  return { ...summary, failures: summary.failures }
}

// ── Step 9: Update manifest.playlists ...
```

### WR-02: Playlist name permanently defaults to raw UUID on first sync

**File:** `src/main/lib/sync-engine.ts:181-182` and `386`

**Issue:** On first sync of a playlist, `manifest.playlists[playlistId]` does not exist yet. The code at line 181-182 falls back to the playlist ID (a Jellyfin UUID):

```ts
const existingName = manifest.playlists[playlistId]?.name
playlistNameMap.set(playlistId, existingName ?? playlistId)  // ← UUID as name
```

Step 9 (line 386) reads the same fallback:

```ts
const existingName = manifest.playlists[playlistId]?.name ?? playlistId
```

The result is that the M3U8 file is written as `{uuid}.m3u8` and the manifest stores the UUID as the display name. On second sync the manifest already has `name = uuid`, so it never self-corrects.

The `SyncOptions` payload from the renderer contains `playlistIds` but not names. The renderer has the names (it populated the playlist list from `getPlaylists()`), but they are not forwarded.

**Fix:** Add a `playlistNames` map to `SyncOptions` and pass it from the renderer:

```ts
// shared/ipc-types.ts
export interface SyncOptions {
  playlistIds: string[]
  playlistNames: Record<string, string>   // id → display name
  destination: string
  concurrentDownloads: number
}
```

In `PlaylistBrowserScreen.tsx`, build the map from the loaded playlist list and include it in the `start()` call. In `sync-engine.ts`, use `opts.playlistNames[playlistId] ?? playlistId` as the name source.

### WR-03: `trimEnd()` applied only to track name, not to artist or album segments

**File:** `src/main/lib/downloader.ts:42`

**Issue:** CLAUDE.md critical pitfall #1 lists trailing dots/spaces as FAT32-illegal. The comment on line 41 explains that `trimEnd()` is applied to `name` before sanitization so that a trailing space doesn't become a trailing underscore in the filename. However, `artist` (line 39) and `album` (line 40) receive no such pre-treatment:

```ts
const safeArtist = sanitizePathSegment(artist || 'Unknown Artist')
const safeAlbum  = sanitizePathSegment(album  || 'Unknown Album')
const safeFile   = sanitizePathSegment(`${name.trimEnd()}.${container}`)
```

If Jellyfin returns `"The Beatles "` (trailing space) as `AlbumArtist`, `sanitizePathSegment` will replace the trailing space with `_`, producing `The_Beatles_/` as the directory name. This diverges from the intended approach (natural name preservation) and can break incremental sync on subsequent runs if the Jellyfin API trims the name.

**Fix:** Apply `trimEnd()` consistently before sanitizing each segment:

```ts
const safeArtist = sanitizePathSegment((artist || 'Unknown Artist').trimEnd())
const safeAlbum  = sanitizePathSegment((album  || 'Unknown Album').trimEnd())
const safeFile   = sanitizePathSegment(`${name.trimEnd()}.${container}`)
```

---

## Info

### IN-01: No test for AbortSignal cancellation in downloadTrack

**File:** `tests/lib/downloader.test.ts`

**Issue:** `downloadTrack` accepts an `AbortSignal` and passes it to axios. There is no test verifying that passing an already-aborted signal (or aborting mid-stream) causes the function to throw and still clean up the `.part` file. The existing error path test (line 112) covers stream errors, not cancellation. This is the most latency-sensitive code path in the sync engine.

**Fix:** Add a test case:

```ts
it('deletes .part file when signal is aborted before download', async () => {
  const controller = new AbortController()
  controller.abort()

  axiosMockImpl = () => Promise.reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }))

  const destPath = join(tmpDir, 'Track.flac')
  await expect(
    downloadTrack('https://example.com', 'Token="x"', destPath, controller.signal, () => {})
  ).rejects.toThrow()

  expect(existsSync(`${destPath}.part`)).toBe(false)
})
```

### IN-02: M3U8 file written non-atomically

**File:** `src/main/lib/sync-engine.ts:418`

**Issue:** The M3U8 playlist file is written with `writeFileSync` directly, without the `.tmp → rename` pattern used for the manifest:

```ts
writeFileSync(m3u8Path, m3u8Content, 'utf-8')
```

A crash or power loss during this write leaves a truncated M3U8 file. The manifest is then written atomically afterward. On the next run, the manifest is intact (triggers correct incremental sync), but the M3U8 is corrupt and requires the user to manually delete it or wait for the next successful sync to overwrite it.

This does not cause data loss (tracks are still present on disk), but it violates the project's stated atomic-write principle from CLAUDE.md for any file the destination folder exposes to the user.

**Fix:** Use `atomicWriteJson` or an equivalent atomic write for text files. If `fs-utils` does not have an `atomicWriteText` helper, add one:

```ts
// In fs-utils.ts
export function atomicWriteText(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, content, 'utf-8')
  renameSync(tmpPath, filePath)
}

// In sync-engine.ts step 10
atomicWriteText(m3u8Path, m3u8Content)
```

### IN-03: Concurrent download progress counter produces non-monotonic current values

**File:** `src/main/lib/sync-engine.ts:302-319`

**Issue:** `completedTracks` is a shared integer mutated by all concurrent `downloadOne` calls. With `concurrentDownloads > 1`, multiple tasks are in-flight simultaneously. Each task reads `completedTracks + 1` for its `current` field at the time progress is emitted, but `completedTracks` only increments when a task finishes. This means multiple in-flight tasks will emit `current: 1`, then `current: 2`, etc. — the renderer would see the same `current` value from multiple tracks simultaneously, and the overall progress indicator would stall then jump.

```ts
// Two concurrent downloads start with completedTracks = 0:
// Track A emits: current = 0 + 1 = 1
// Track B emits: current = 0 + 1 = 1  ← duplicate
// Track A finishes: completedTracks = 1
// Track B finishes: completedTracks = 2
// Track A emits complete: current = 1  ← out of order vs B's 1
```

This does not cause a crash or data loss — it is a UI accuracy issue only.

**Fix:** Assign each download a fixed slot index at dispatch time:

```ts
const downloadTasks = toDownload.map((item, index) =>
  limit(() => downloadOne(item, index + 1))
)
```

Pass `slotNumber` into `downloadOne` and use it as the immutable `current` value for all progress events emitted by that task, rather than reading the shared mutable `completedTracks + 1`.

---

_Reviewed: 2026-04-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
