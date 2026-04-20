# Phase 3: Sync Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 03-sync-engine
**Areas discussed:** Destination folder UX, Download error handling, Deletion scope (cross-playlist safety), Progress event granularity

---

## Destination Folder UX

| Option | Description | Selected |
|--------|-------------|----------|
| Dialog on Sync click | Native folder picker opens when user clicks Sync Selected. Last-used destination pre-selected. | ✓ |
| Picker button on playlist browser | Persistent destination button/input always visible on playlist browser. | |
| Settings-only | Destination set in settings panel; Phase 3 just receives whatever is passed. | |

**User's choice:** Dialog on Sync click
**Notes:** Last destination pre-filled as `defaultPath`. Save chosen path back to `Settings.lastDestination` after sync starts.

---

## Download Error Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Skip and continue | Log failure, record in summary, continue with remaining tracks. | ✓ |
| Retry then skip | Retry up to 2 times before skipping. | |
| Abort sync | First failure stops everything. | |

**Cleanup:** Clean up `.part` file immediately on failure. ✓

**User's choice:** Skip and continue; immediate `.part` cleanup
**Notes:** Failures recorded for Phase 4 summary display.

---

## Deletion Scope (Cross-Playlist Safety)

| Option | Description | Selected |
|--------|-------------|----------|
| All playlists ever synced to this destination | Check item ID against ALL manifest playlists before deleting. | ✓ |
| Only currently-selected playlists | Only checks playlists in this run's selection. | |

**Abandoned playlists:** Keep files forever unless user manually removes. ✓

**User's choice:** All synced playlists (manifest-wide check); abandoned files kept indefinitely
**Notes:** Aligns with CLAUDE.md critical pitfall: "Check item ID against all synced playlists before deleting."

---

## Progress Event Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Per-file complete + per-byte chunks | Emit on every ~64KB chunk AND on file complete. Both bytesDownloaded and current/total populated. | ✓ |
| Per-file complete only | Emit once per track when finished. | |
| Per-file start + complete | Emit on start and finish only. | |

**IPC pattern:** Push via `webContents.send` (not polling). ✓

**User's choice:** Per-file + per-byte, push pattern
**Notes:** `SyncProgress` interface already supports both dimensions. Phase 4 can show per-file bar and overall bar.

---

## Claude's Discretion

- Exact HTTP chunk size for progress (~64 KB)
- Jellyfin download endpoint selection
- HTTP client choice for streaming downloads
- Internal queue/concurrency structure
- M3U8 `#EXTINF` duration conversion from `RunTimeTicks`

## Deferred Ideas

- Retry logic for transient failures
- "Abandon playlist" UI to explicitly remove from manifest
- Per-playlist selective sync
