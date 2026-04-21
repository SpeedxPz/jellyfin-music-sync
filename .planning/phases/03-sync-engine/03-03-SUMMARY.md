---
phase: 03-sync-engine
plan: 03
subsystem: sync
tags: [electron, typescript, p-limit, jellyfin-sdk, axios, m3u8, manifest, fat32]

requires:
  - phase: 03-01
    provides: manifest.ts, downloader.ts, m3u8.ts — all imports for sync-engine.ts
  - phase: 03-02
    provides: test scaffolds (49 tests) verified for manifest, m3u8, downloader
provides:
  - "runSync() — pure sync orchestrator with no ipcMain dependency"
  - "SyncEngineOpts interface exported from sync-engine.ts"
  - "12-step pipeline: orphan scan → manifest → track fetch → plan → downloads → M3U8 → manifest write → summary"
affects:
  - 03-04 (sync IPC handler will import runSync from sync-engine.ts)
  - phase-4 (progress UI consumes SyncProgress events from webContents.send)

tech-stack:
  added: []
  patterns:
    - "runSync() is a pure function — no ipcMain; testable independently of Electron"
    - "p-limit(concurrentDownloads) wraps each downloadOne() call for bounded concurrency"
    - "Promise.allSettled() over the p-limit tasks so one failure does not cancel others"
    - "AbortError/CanceledError re-thrown for propagation; other errors skipped (D-ERR-SKIP)"
    - "localPath normalized to forward slashes via .split(sep).join('/') before manifest write"
    - "webContents.isDestroyed() guard on every webContents.send() call"
    - "isReferencedByOtherPlaylist() checked before every unlinkSync of a track file"

key-files:
  created:
    - src/main/lib/sync-engine.ts
  modified: []

key-decisions:
  - "runSync() is decoupled from ipcMain so it is directly unit-testable and the IPC handler in 03-04 stays thin"
  - "authHeader derived from api.accessToken (MediaBrowser Token= format) with fallback to authorizationHeader getter for forward compatibility"
  - "Playlist name stored in manifest.playlists from prior run; getPlaylistItems does not return the playlist name, so the existing manifest name or playlistId is used as fallback"
  - "toDelete list deduped with Array.includes before pushing to prevent double-deletion when item appears in multiple selected playlists"

patterns-established:
  - "Orphan scan: deleteOrphanedPartFiles() recurses into subdirectories, ignores errors (destination may not exist yet)"
  - "Pagination: while(true) + break on empty page + limit=500 mirrors D-API-PAGINATION from playlists.ts"
  - "Download: p-limit wraps downloadOne() which re-throws cancellation errors and records non-cancellation errors in SyncSummary.failures"
  - "M3U8: itemsMap built from manifest.items + in-memory trackMetaForM3u8 (runTimeTicks/name from Jellyfin metadata)"

requirements-completed:
  - SYNC-01
  - SYNC-02
  - SYNC-03
  - SYNC-04
  - SYNC-05
  - SYNC-06
  - SYNC-07
  - M3U8-01
  - M3U8-02
  - M3U8-03

duration: 2min
completed: 2026-04-21
---

# Phase 3 Plan 03: Sync Engine Orchestrator Summary

**runSync() 12-step pipeline — orphan scan, paginated track fetch, p-limit concurrent downloads, cross-playlist deletion safety, per-playlist M3U8 + atomic manifest write — all decoupled from ipcMain**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T10:21:46Z
- **Completed:** 2026-04-21T10:23:46Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Implemented sync-engine.ts (427 lines) with all 12 pipeline steps exactly as specified in the plan
- TypeScript compiles without errors (`npm run typecheck:node` exits 0)
- Full test suite green — 49/49 tests across fs-utils, manifest, m3u8, downloader (no regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement sync-engine.ts** - `d99da88` (feat)
2. **Task 2: Run full test suite** - no commit needed (test-only verification, 0 files changed)

## Files Created/Modified

- `src/main/lib/sync-engine.ts` — Pure sync orchestrator: SyncEngineOpts interface + runSync() implementing all 12 pipeline steps

## Decisions Made

- `authHeader` constructed as `MediaBrowser Token="${api.accessToken}"` with fallback to `api.authorizationHeader` via cast — the SDK's `authorizationHeader` getter is not exposed as a public type but is reliably present at runtime
- Playlist name in manifest falls back to `playlistId` string when no prior manifest entry exists, since `getPlaylistItems` does not return the playlist display name; the IPC handler in 03-04 can update this via the playlist list
- `mediaSourceId` cast from `string | null | undefined` to `string | undefined` via `?? undefined` (Rule 1 fix — TypeScript type error)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error on mediaSourceId**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** `item.MediaSources?.[0]?.Id` returns `string | null | undefined` but `buildDownloadUrl` expects `string | undefined`; `null` is not assignable
- **Fix:** Added `?? undefined` to convert `null` to `undefined`: `item.MediaSources?.[0]?.Id ?? undefined`
- **Files modified:** src/main/lib/sync-engine.ts
- **Verification:** `npm run typecheck:node` exits 0
- **Committed in:** d99da88 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 type error bug)
**Impact on plan:** Trivial one-line fix. No scope creep.

## Issues Encountered

None beyond the TypeScript type error above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `runSync()` is ready to be wired up by the IPC handler in 03-04
- 03-04 needs to: replace `sync:start` and `sync:cancel` stubs, show folder picker dialog, create AbortController, call `runSync()`, and emit `sync:complete` when done
- Playlist name in manifest will be correctly populated once 03-04 fetches the playlist list (name from `getPlaylists()`) before calling `runSync()`

---
*Phase: 03-sync-engine*
*Completed: 2026-04-21*
