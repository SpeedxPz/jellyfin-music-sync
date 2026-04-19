# Project Research Summary

**Project:** Jellyfin Music Sync
**Domain:** Electron desktop app — music playlist sync to USB/local storage
**Researched:** 2026-04-19
**Confidence:** HIGH

## Executive Summary

Jellyfin Music Sync is a focused Electron desktop application that downloads Jellyfin playlists to a local or USB destination in a portable format (Artist/Album/Track folder structure + M3U8 playlists). The domain is well-understood: this is a background file sync tool with a thin UI, not a media player. The recommended approach is to build backend-first — all I/O lives in the Node.js main process, and the React renderer is a dumb progress display layer communicating via typed IPC. The stack (Electron 41 + electron-vite + @jellyfin/sdk + Zustand) is well-validated with no significant gaps.

The core complexity is in the sync engine, not the UI: manifest-based incremental diffing, FAT32-safe filename sanitization, cross-playlist deduplication, and atomic file writes. These are all solvable with established patterns. The highest-risk areas are filesystem correctness (partial downloads, manifest corruption, FAT32 compatibility) and Jellyfin API subtleties (pagination, token persistence, download endpoint selection). Both have clear prevention strategies and must be addressed in the foundation phase before any UI work.

## Recommended Stack

- **Electron 41** (Node 24 bundled) — desktop runtime, Windows + Linux
- **electron-vite 5** — unified build for main + preload + renderer
- **TypeScript 5.4** — all three Electron contexts
- **@jellyfin/sdk 0.13.0** — official typed Jellyfin REST client (not `jellyfin-apiclient` — deprecated)
- **p-limit 6** — concurrency control for download queue (default 3 simultaneous)
- **sanitize-filename 1.6.4** — FAT32-safe filename sanitization
- **React 19 + Zustand 5** — renderer UI + state
- **Tailwind CSS 4** — utility styling
- **electron-builder 26.8** — NSIS (Windows), AppImage + deb (Linux)
- **Vitest 3** — unit testing

**Do not use:** `nodeIntegration: true`, `axios`, `electron-dl`, `jellyfin-apiclient`, `jest`

## Table Stakes Features

- Jellyfin server login with token persisted via `safeStorage`
- Destination folder picker with available space display
- Playlist list with track count + size estimate; multi-select
- Download tracks as Artist/Album/Track, original format only
- FAT32-safe path sanitization per segment
- M3U8 generation with relative POSIX paths
- Manifest-based incremental sync: skip existing, delete orphans, deduplicate across playlists
- Per-file + overall progress with cancel; end-of-sync summary; per-track error log

## Architecture Overview

Strict two-process Electron split: **main process owns all I/O**, renderer owns only display.

**Key components:**
1. `JellyfinClient` — all REST calls; auth, playlist fetch (paginated), download URLs
2. `SyncEngine` — diff manifest vs server state, orchestrate downloads + deletions, write M3U8
3. `DownloadQueue` — concurrency-limited jobs, `.part` → rename pattern, retry, progress push
4. `FileSystemManager` — path sanitization, dirs, atomic manifest, M3U8 generation
5. `AppSettings` — electron-store; server URL, token, last destination
6. `preload.ts` — contextBridge typed IPC surface
7. Renderer views — `AuthView`, `PlaylistPicker`, `SyncProgressView` (Zustand + IPC events)

`_jellyfin-sync.json` manifest lives at destination root, keyed by Jellyfin `ItemId`. Travels with the USB drive.

## Critical Pitfalls

1. **FAT32 illegal characters** — `sanitizePathSegment()` must strip `\ / : * ? " < > |`, Windows reserved names (`CON`, `NUL`, etc.), trailing dots/spaces. Apply to artist, album, and filename independently. Test with `AC/DC`, `CON`, `...And Justice For All`.
2. **Manifest corruption on crash** — always write atomically: write to `.tmp`, then `fs.renameSync`. Wrap parse in `try/catch` on load.
3. **Partial downloads left on disk** — download to `*.part` path; rename only on success with verified size; scan and delete `*.part` on startup.
4. **Jellyfin API pagination truncation** — default cap is 100 items. Always paginate with `limit=500` + `startIndex` loop; compare against `TotalRecordCount`.
5. **Deleting songs still in other playlists** — check item ID against all synced playlists before deletion; only delete if absent everywhere.

## Build Order Recommendation

| Phase | Focus | Key Deliverables |
|-------|-------|-----------------|
| 1 | Foundation | Electron scaffold, IPC contracts, `sanitizePathSegment` + tests, atomic manifest, security config |
| 2 | Jellyfin API | `JellyfinClient`, auth, paginated playlist + item fetch, download URL; validate vs real server |
| 3 | Sync Engine | `DownloadQueue` (.part pattern, retry), `SyncEngine` (diff, dedup, deletion), M3U8 generation |
| 4 | UI | `AuthView`, `PlaylistPicker`, `SyncProgressView` wired to IPC push events |
| 5 | Polish + Packaging | Error handling, edge cases, electron-builder NSIS + AppImage |

## Open Questions

- `safeStorage` availability on headless Linux (no libsecret/kwallet) — need fallback strategy
- Minimum Jellyfin server version to support (`@jellyfin/sdk` 0.13.0 targets 10.11.x)
- USB safe-eject automation scope: warn user vs. automate (`udisksctl` / `DeviceIoControl`)
- M3U8 real-device compatibility on car head units and DAPs — requires physical device testing

---
*Research completed: 2026-04-19 | Ready for roadmap: yes*
