# Feature Landscape: Jellyfin Music Sync Desktop App

**Domain:** Music playlist sync to local/USB storage (Jellyfin source)
**Researched:** 2026-04-19
**Confidence:** HIGH (core features), MEDIUM (differentiators), LOW (nice-to-haves)

---

## How to Read This File

Each feature entry has:
- **Category:** Table Stakes / Differentiator / Anti-Feature (v1)
- **Complexity:** Low / Medium / High
- **Notes:** Implementation detail, source, or warning

---

## Auth

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Connect via server URL + username + password | Table Stakes | Low | Jellyfin `/Users/AuthenticateByName` endpoint. Returns access token. |
| Persist access token between sessions | Table Stakes | Low | Use Electron `safeStorage` API (OS-native DPAPI/Keychain/libsecret). Do NOT store raw token in plain config file. |
| Clear saved credentials / log out | Table Stakes | Low | Must revoke token on Jellyfin server AND clear local storage. |
| Show helpful errors for wrong URL, wrong credentials, unreachable server | Table Stakes | Low | Distinguish: network error (server unreachable) vs 401 (bad credentials) vs 404 (wrong URL). Users hit all three. |
| Quick Connect (Jellyfin QR-code login) | Differentiator | Medium | Jellyfin 10.7+ feature. Nice for users who hate typing passwords on desktop. Not critical for v1. |
| Multiple saved server profiles | Anti-Feature (v1) | Medium | PROJECT.md explicitly out-of-scope. One server per session keeps auth simple. |
| SSO / OAuth via external provider | Anti-Feature (v1) | High | Jellyfin supports LDAP/SSO plugins; out-of-scope for v1. |

**Feature dependency:** Token persist → all subsequent API calls. Must exist before any other feature works.

---

## Library Browsing

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| List all playlists for the authenticated user | Table Stakes | Low | `GET /Users/{userId}/Items?IncludeItemTypes=Playlist`. Paginate — large libraries have 100+ playlists. |
| Show playlist name, track count, and total size estimate | Table Stakes | Low-Med | Track count comes free from API. Size estimate requires summing `Size` field per item — one extra API call per playlist but users need it for USB capacity planning. |
| Multi-select playlists for batch sync | Table Stakes | Low | Checkbox list or Ctrl+click. Core workflow: pick several, hit Sync. |
| Search / filter playlist list | Differentiator | Low | Valuable for users with 50+ playlists. Client-side filtering of already-fetched list is trivial. |
| Show album art thumbnail per playlist | Differentiator | Low-Med | Uses Jellyfin `/Items/{id}/Images/Primary`. Adds visual scan-ability. Not required for function. |
| Browse library by Artist / Album (not just playlists) | Anti-Feature (v1) | High | Dramatically expands scope. PROJECT.md says playlist-only view. Defer to v2 if validated. |
| Smart playlists / auto-playlists from filters | Anti-Feature (v1) | High | Jellyfin supports this server-side but surfacing it is complex. Defer. |

**Feature dependency:** List playlists → Multi-select → Sync. Size estimate can come after list but before sync starts.

---

## Sync Core

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Download all tracks from selected playlists | Table Stakes | Medium | `GET /Items/{id}/Download`. Stream to file. |
| Incremental sync: skip already-present files | Table Stakes | Medium | Compare by Jellyfin `ItemId` in manifest, not filename. Filenames change; IDs don't. |
| Delete tracks removed from playlist since last sync | Table Stakes | Medium | Read manifest, diff against current playlist, delete orphans. Prevents USB drive filling with stale tracks. |
| Deduplicate shared tracks across playlists | Table Stakes | Medium | If Song X is in Playlist A and B, download once. Both M3U files reference the same file. Track by `ItemId` → relative path mapping in manifest. |
| Generate per-playlist M3U8 file with relative paths | Table Stakes | Low-Med | Relative paths essential — USB must work on any machine or in-car head unit. Paths must use forward slashes regardless of OS. |
| Artist/Album/Song folder structure | Table Stakes | Low | `{Artist}/{Album}/{Track# - Title}.{ext}`. Familiar to every music player, every DAP, every car stereo. |
| FAT32-safe filename sanitization | Table Stakes | Medium | Strip: `\ / : * ? " < > |` (Windows reserved). Replace with safe chars or strip. Max 255 UTF-8 bytes per component. Watch for non-ASCII (accents, CJK) — FAT32 uses UTF-16 but byte limits still apply. Test with real special chars. |
| Sync state manifest inside destination folder | Table Stakes | Low | Hidden JSON file (`_jellyfin-sync.json`). Stores: server URL, user ID, playlist-to-item mapping, last sync timestamp. Travels with the USB. |
| Concurrent downloads (parallelism) | Differentiator | Medium | 3-5 parallel downloads cuts sync time dramatically for large playlists. Requires rate-limiting to not hammer Jellyfin server. Make concurrency configurable (default: 3). |
| Bandwidth/rate throttling | Differentiator | Medium | Useful on shared home networks. Not critical for v1 but commonly requested in sync tools. |
| Original format only (no transcoding) | Table Stakes | Low | PROJECT.md constraint. Avoid FFmpeg dependency. Users pick this tool specifically to preserve quality. |
| Resume interrupted sync on restart | Differentiator | Medium | If app closed mid-sync, restart should skip completed files and continue. Manifest + per-file completion flag enables this. Avoids re-downloading large FLAC files. |
| Verify file integrity after download (checksum) | Differentiator | High | Compare downloaded file size or hash against Jellyfin metadata. Catches truncated downloads from network drops. High complexity — skip for v1 unless corruption reports emerge. |

**Feature dependencies:**
```
Auth token → Download tracks
Download tracks → Folder structure + Filename sanitization (must happen together)
Manifest → Incremental sync → Delete orphans (all three tied to manifest)
Manifest → Deduplication (needs stable ID→path map)
M3U8 generation → requires all files downloaded first (or at least paths known)
Concurrent downloads → requires manifest to track partial state correctly
```

---

## File Management

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Destination folder picker (native dialog) | Table Stakes | Low | Electron `dialog.showOpenDialog` with `openDirectory`. Must allow USB drives and mounted DAPs. |
| Show available space on destination drive | Table Stakes | Low | `fs.statfs` (Node 18+) or `node-disk-info` package. Critical for USB — user needs to know before starting a 20 GB sync. |
| Warn when estimated download size exceeds free space | Table Stakes | Low-Med | Requires size estimate from library browsing. Block sync start with clear error — do not silently fail partway through. |
| Show current destination path in UI | Table Stakes | Low | Always visible. Users forget which USB they last picked. |
| Remember last-used destination folder | Table Stakes | Low | Persist in app config (not manifest — this is app-level preference). |
| Auto-detect USB drive insertion | Differentiator | Medium | Watch for new drive mounts via `usb-detection` or polling `df`. Offer to switch destination automatically. Nice UX but not required. |
| Multiple destination profiles (save USB A, USB B, etc.) | Differentiator | Medium | Power users with multiple devices. Not v1. |
| Open destination folder in file explorer | Differentiator | Low | `shell.openPath(destPath)`. One-line implementation, tangible UX win — user can verify files. Include in v1. |

**Feature dependency:** Destination folder → space check → sync start.

---

## Progress and Status

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Per-file download progress (current file name + %) | Table Stakes | Low | Stream download with `Content-Length` response header → compute %. Show current filename. |
| Overall sync progress (N of M tracks, overall %) | Table Stakes | Low | Track completed count / total count. Show time elapsed. |
| Summary at sync completion (downloaded, skipped, deleted, errors) | Table Stakes | Low | Users need to know the sync did what they expected. Especially important for incremental runs where "0 downloaded, 3 deleted" needs explanation. |
| Cancellable sync mid-run | Table Stakes | Low-Med | Abort button. Stop new downloads, let in-progress file complete, update manifest. Do NOT leave half-written files. |
| Error log: track-level failures without aborting whole sync | Table Stakes | Medium | If one track 404s (deleted from server?), log it and continue. Show at end: "3 tracks failed — see details." Never silently swallow errors. |
| Real-time download speed indicator | Differentiator | Low | Bytes/sec from stream. Easy to implement alongside progress. Users on slow home servers appreciate it. |
| Estimated time remaining | Differentiator | Low-Med | Rolling average of bytes/sec → ETA. Imprecise but useful. |
| System tray / minimize to tray during sync | Differentiator | Medium | Users want to start sync and get out of the way. Electron tray is well-supported. Not critical for v1. |
| Desktop notification on sync complete | Differentiator | Low | `Notification` API in Electron. One line. Include in v1 — user walks away, needs to know when done. |
| Sync history log (last 5 syncs, what changed) | Anti-Feature (v1) | Medium | Scope creep. If errors need to be reviewed, the end-of-sync summary is sufficient for v1. |

**Feature dependency:** Per-file progress and overall progress are independent but both must exist. Cancel requires the overall progress loop to be cancellable. Error log feeds into summary.

---

## Playlist Management

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Read-only view of Jellyfin playlists | Table Stakes | Low | PROJECT.md explicitly read-only. No editing. |
| Show track list for a selected playlist (preview before sync) | Differentiator | Medium | `GET /Playlists/{id}/Items`. Useful for confirming "yes, this playlist has what I think it has" before syncing 10 GB. Medium complexity because it requires a detail view/panel. |
| Edit playlists (add/remove tracks) | Anti-Feature (v1) | High | Out of scope. Jellyfin web UI exists for this. Adding write operations doubles API surface and error surface. |
| Create playlists on Jellyfin from local M3U | Anti-Feature (v1) | High | Reverse-direction sync — entirely different product. |

---

## Settings

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Persisted server URL (auto-fill on launch) | Table Stakes | Low | App config, not credential store. Just the URL. |
| Configurable concurrent download count (1-10) | Differentiator | Low | Default 3. Slider or number input. Advanced users on fast local networks want 8-10. |
| "Dry run" mode: show what would be synced without downloading | Differentiator | Medium | Computes diff (files to add, files to delete) and shows summary without executing. Useful for verifying before a large sync. Not v1 but very requested. |
| App update check / auto-update (Electron) | Differentiator | Medium | `electron-updater`. Not a day-one feature but important for long-term. |
| Dark mode / theme toggle | Anti-Feature (v1) | Low | Respect OS dark mode via `prefers-color-scheme` CSS. Do NOT build a custom theme picker — it's scope creep. OS preference is enough. |
| Proxy configuration | Anti-Feature (v1) | Medium | Edge case. Electron inherits system proxy settings. Do not build custom proxy UI for v1. |
| Debug/verbose logging toggle | Differentiator | Low | Write to log file in app data dir. Essential for diagnosing user-reported sync failures. Include in v1. |

---

## Anti-Features: Full List (Do Not Build in v1)

| Anti-Feature | Reason | Defer To |
|--------------|--------|----------|
| Audio transcoding / format conversion | FFmpeg dependency, quality debates, complexity | Never (out of scope by design) |
| macOS support | PROJECT.md constraint — Windows + Linux only | v2 if validated |
| Multiple simultaneous server connections | Auth complexity, rare use case | v2 if validated |
| Cloud / remote destinations | Different product entirely | Never for this tool |
| Playlist editing (write to Jellyfin) | Doubles API surface, different user job | v2 if validated |
| Library browsing by Artist/Album | Expands to full music player feature set | v2 if validated |
| Sync history with full audit log | Nice, not critical. End-of-sync summary sufficient | v2 |
| Custom theme picker | OS dark mode respects user preference already | Never — use OS pref |
| Smart playlists / filter-based auto-sync | Jellyfin already does this server-side | v2 if validated |
| Playlist creation from local M3U (reverse sync) | Reverse direction — different product | Never for this tool |
| File integrity checksum verification | High complexity, low frequency of failure | v2 if corruption reports emerge |

---

## MVP Feature Set (Prioritized Delivery Order)

### Must Ship (v1 core, blocks all else)

1. Auth — connect, persist token, log out, good error messages
2. Destination folder picker + space check + warning
3. List playlists with track count and size estimate
4. Multi-select playlists
5. Download with Artist/Album/Track structure
6. FAT32 filename sanitization
7. M3U8 generation with relative paths
8. Manifest-based incremental sync (skip existing, delete orphans)
9. Deduplication across playlists
10. Per-file and overall progress with cancel
11. End-of-sync summary (downloaded, skipped, deleted, errors)
12. Error log: per-track failures without aborting run

### Ship in v1 (small effort, high value)

- Open destination in file explorer (`shell.openPath`)
- Desktop notification on sync complete
- Remember last-used destination folder
- Debug log file for diagnostics

### Defer to v1.1 / v2 (validate first)

- Concurrent download count setting (default 3, user-configurable)
- Resume interrupted sync
- Dry-run mode
- Playlist track-list preview
- Auto-detect USB insertion
- Real-time speed + ETA

---

## Feature Dependencies Graph

```
Auth (token)
  └─> List playlists
        └─> Multi-select
              └─> Size estimate + Space check
                    └─> [Sync Start]
                          ├─> Download tracks
                          │     ├─> Folder structure
                          │     ├─> Filename sanitization (FAT32)
                          │     └─> Per-file progress
                          ├─> Manifest read → Incremental diff
                          │     ├─> Skip existing
                          │     └─> Delete orphans
                          ├─> Deduplication (needs manifest ID→path map)
                          ├─> M3U8 generation (needs all paths resolved)
                          └─> Overall progress → Cancel → End-of-sync summary
                                                              └─> Error log
```

---

## Sources

- Finamp DOWNLOADS_PLAN.md: https://github.com/UnicornsOnLSD/finamp/blob/main/DOWNLOADS_PLAN.md
- Finamp issues (download instability, iOS path bugs): https://github.com/UnicornsOnLSD/finamp/issues
- Jellyfin feature requests (offline sync, playlist sync): https://features.jellyfin.org/posts/589/sync-playlists-for-offline-listening
- Jellyfin forum offline music use case: https://forum.jellyfin.org/t-offline-usecase-for-music
- Jellyfin GitHub issue — music sync/download Android: https://github.com/jellyfin/jellyfin/issues/1672
- Symfonium feature overview: https://symfonium.app/
- sync-music PyPI (FAT32 + M3U incremental sync reference): https://pypi.org/project/sync-music/0.2.0/
- M3U relative paths discussion: https://community.mp3tag.de/t/how-to-make-paths-in-m3u-playlists-relative/16031
- Special chars in M3U (Sansa Clip, VLC): https://ma.juii.net/blog/files-with-non-ascii-names-in-sansa-clip-playlists
- Electron safeStorage API: https://www.electronjs.org/docs/latest/api/safe-storage
- Jellyfin API auth overview: https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f
- Jellyfin Kodi slow music sync issue: https://github.com/jellyfin/jellyfin/issues/15362
- Symfonium auto playlist sync request: https://support.symfonium.app/t/automatic-playlist-sync-support-for-read-write-playlists/1807
