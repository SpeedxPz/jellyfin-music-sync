---
phase: 03-sync-engine
fixed_at: 2026-04-21T00:00:00Z
review_path: .planning/phases/03-sync-engine/03-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-04-21
**Source review:** .planning/phases/03-sync-engine/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Auth header construction bypasses SDK — missing required Jellyfin fields

**Files modified:** `src/main/lib/sync-engine.ts`
**Commit:** b9f02b3
**Applied fix:** Removed the `api.accessToken ? ... : ...` ternary entirely. The single remaining line always uses `(api as unknown as { authorizationHeader: string }).authorizationHeader`, which the SDK populates with all required Jellyfin fields (`Client`, `Device`, `DeviceId`, `Version`, `Token`). Added a comment explaining why the SDK property is always preferred.

### WR-01: Cancelled sync still writes manifest and M3U8 after abort

**Files modified:** `src/main/lib/sync-engine.ts`
**Commit:** 811270d
**Applied fix:** Added an `if (signal.aborted) { return { ...summary } }` guard immediately after `await Promise.allSettled(downloadTasks)`. When cancelled, the function returns early with the partial summary before reaching steps 9-11 (manifest.playlists update, M3U8 write, manifest write). The comment explains that orphaned `.part` files are already cleaned up by `downloadOne`'s catch block.

### WR-02: Playlist name permanently defaults to raw UUID on first sync

**Files modified:** `shared/ipc-types.ts`, `src/main/lib/sync-engine.ts`, `src/main/ipc/sync.ts`
**Commit:** d10870c
**Applied fix:**
- Added `playlistNames?: Record<string, string>` to `SyncOptions` in `shared/ipc-types.ts` with a doc comment.
- Added the same optional field to `SyncEngineOpts` in `sync-engine.ts`.
- Updated the `opts` destructure to extract `playlistNames` (defaulting to `{}`).
- In step 3 (playlistNameMap population), changed the fallback chain to: caller-supplied `playlistNames[playlistId]` > existing `manifest.playlists[playlistId]?.name` > raw UUID. This prevents the UUID-as-name bug on first sync.
- In step 9 (manifest.playlists write), replaced the inline fallback with `playlistNameMap.get(playlistId) ?? playlistId` so the same resolved name is persisted.
- Updated `src/main/ipc/sync.ts` to forward `opts.playlistNames` into the `runSync` call.

### WR-03: `trimEnd()` applied only to track name, not to artist or album segments

**Files modified:** `src/main/lib/downloader.ts`
**Commit:** 438ecb5
**Applied fix:** Applied `.trimEnd()` to `artist` and `album` before passing to `sanitizePathSegment`, matching the existing pattern for `name`. The fallback strings `'Unknown Artist'` and `'Unknown Album'` are also covered since `trimEnd()` is applied after the `||` fallback expression. Consolidated the comment onto the first line to avoid duplication.

---

_Fixed: 2026-04-21_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
