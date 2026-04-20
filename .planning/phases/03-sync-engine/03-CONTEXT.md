# Phase 3: Sync Engine - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

The sync engine: given a set of playlist IDs and a destination folder, download all tracks in Artist/Album/Track structure, generate M3U8 playlist files, track state in a manifest, and on subsequent runs only download what's missing and delete what's been removed. Phase 3 is entirely main-process — no new renderer screens. Phase 4 wires the progress display, cancel UI, and post-sync summary on top.

</domain>

<decisions>
## Implementation Decisions

### Destination Folder UX

- **D-DEST-PICKER:** Clicking "Sync Selected" on the playlist browser opens a native folder picker dialog (`dialog.showOpenDialog` with `properties: ['openDirectory']`). No persistent destination field on the playlist browser — the dialog is the trigger.
- **D-DEST-PREFILL:** The last-used destination (`Settings.lastDestination`) is passed as `defaultPath` to the dialog so the user can accept it in one click. If no prior destination exists, dialog opens at the system default.
- **D-DEST-SAVE:** After the user picks a destination and sync starts, save the chosen path back to `Settings.lastDestination` via `settings.set`.

### Download Error Handling

- **D-ERR-SKIP:** When a track fails to download, skip it and continue with the remaining tracks. Record the failure (track name + error reason) for the `SyncSummary`. All other tracks in the sync run still download.
- **D-ERR-CLEANUP:** On download failure, immediately delete the `.part` file. No orphaned partial files left on disk from failed tracks.
- **D-ERR-ORPHANS:** On startup, scan the destination root for any `*.part` files from a previous interrupted run and delete them before starting a new sync.

### Deletion Scope (Cross-Playlist Safety)

- **D-DEL-SCOPE:** Before deleting a local track file on sync, check its Jellyfin item ID against ALL playlists ever synced to this destination (as recorded in the manifest) — not just the playlists selected in the current run. A track shared across playlists is never deleted while any playlist that references it is still in the manifest.
- **D-DEL-ABANDONED:** Files belonging to a previously-synced playlist that is not selected in the current run are left untouched. Abandoned playlist files stay on disk indefinitely unless the user manually deletes them. Sync never surprise-deletes music just because a playlist wasn't selected today.

### Progress Events

- **D-PROG-GRANULARITY:** `sync:onProgress` emits on every download chunk (~64 KB) for real-time byte-level progress, AND on each file complete for track count updates. The `SyncProgress` interface already captures `bytesDownloaded`/`bytesTotal` and `current`/`total` — both fields are populated.
- **D-PROG-PUSH:** Progress events are pushed from the main process to the renderer via `webContents.send('sync:onProgress', payload)`. The renderer subscribes via the `on()` pattern already typed in `ipc-types.ts`. No polling.

### Manifest Schema

- **D-MANIFEST-LOCATION:** `_jellyfin-sync.json` at the destination root (per CLAUDE.md). One unified manifest for the entire destination — not per-playlist.
- **D-MANIFEST-ATOMIC:** Always write via `atomicWriteJson` from `fs-utils.ts`. Never write in place. Parse in `try/catch` — treat corrupt/missing manifest as an empty manifest (full re-sync).
- **D-MANIFEST-SCHEMA:** Track the following per item: Jellyfin item ID, local file path (relative to destination), file size, last-synced timestamp. Track the following per playlist: playlist ID, playlist name, list of item IDs. This enables both cross-playlist deletion checks and incremental sync.

### Claude's Discretion

- Exact HTTP chunk size for progress events (64 KB suggested, agent can tune)
- Jellyfin API endpoint for downloading tracks (`/Items/{id}/Download` or `/Audio/{id}/universal`)
- Whether to use `node-fetch` / `http` or Axios for streaming downloads (prefer Node.js built-in `https` or Electron `net.request` to avoid extra dependencies)
- Internal queue/concurrency structure (p-limit wrapper pattern consistent with CLAUDE.md)
- M3U8 `#EXTINF` duration source (from Jellyfin `RunTimeTicks` field, convert to seconds)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — SYNC-01 through SYNC-07, M3U8-01, M3U8-02, M3U8-03

### Architecture + IPC Contract
- `shared/ipc-types.ts` — `SyncOptions`, `SyncProgress`, `SyncSummary`; `sync:start`, `sync:cancel`, `sync:onProgress`, `sync:onComplete` channel shapes; `on()` event subscription pattern
- `src/main/ipc/stubs.ts` — `sync:start` stub to replace; `sync:cancel` stub to replace
- `CLAUDE.md` — Architecture rules: all I/O in main, FAT32 sanitization per segment, `_jellyfin-sync.json` manifest atomic write, `*.part` pattern, cross-playlist deletion safety, p-limit concurrency

### Reusable Utilities
- `src/main/lib/fs-utils.ts` — `sanitizePathSegment`, `atomicWriteJson`, `safeReadJson` — use directly, do not rewrite
- `src/main/lib/jellyfin.ts` — `getApi()`, `getItemsApi()` — session API access from main process

### Prior Phase Decisions
- `.planning/phases/02-jellyfin-connection/02-CONTEXT.md` — Auth/session decisions; `getApi()` is the live session accessor

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/lib/fs-utils.ts` — `sanitizePathSegment` (FAT32 per-segment), `atomicWriteJson` (manifest writes), `safeReadJson` (manifest reads with fallback)
- `src/main/lib/jellyfin.ts` — `getApi()` returns the live authenticated session; `getItemsApi()` for fetching track metadata
- `src/main/ipc/auth.ts` — Pattern for registering IPC handlers in a `register*Handlers()` function — follow same pattern for `registerSyncHandlers()`

### Established Patterns
- IPC handlers live in `src/main/ipc/`; each file exports a `register*Handlers()` function called from `index.ts`
- All I/O is main-process only; renderer receives typed results via IPC
- `electron-conf` store for persistent settings; use `settings.get('concurrentDownloads')` for download parallelism

### Integration Points
- `src/main/ipc/stubs.ts` — Remove `sync:start` from `PHASE3_CHANNELS`; replace `sync:cancel` no-op with real handler
- `src/main/index.ts` — Add `registerSyncHandlers()` call alongside existing `registerAuthHandlers()` / `registerPlaylistHandlers()`
- `src/renderer/src/screens/PlaylistBrowserScreen.tsx` — Phase 3 adds folder picker dialog trigger via `sync:start`; Phase 4 wires the progress display

### Missing Dependency
- `p-limit` — listed in CLAUDE.md but NOT yet in `package.json`. Planner must install it.

</code_context>

<specifics>
## Specific Ideas

- Native folder picker: `dialog.showOpenDialog({ properties: ['openDirectory'], defaultPath: lastDestination })` invoked from main process via a new IPC channel (e.g., `sync:pickDestination`) or inline in `sync:start` handler before downloading begins.
- The manifest should enable answering two questions cheaply: "Is this track already on disk and up to date?" and "Is this track referenced by any playlist in this manifest?"

</specifics>

<deferred>
## Deferred Ideas

- Retry logic for transient failures (decided: skip for now; could be added in a future version)
- "Abandon playlist" UI to explicitly remove a playlist from the manifest and delete its files
- Per-playlist sync (sync only one playlist at a time rather than all selected at once)

</deferred>

---

*Phase: 03-sync-engine*
*Context gathered: 2026-04-21*
