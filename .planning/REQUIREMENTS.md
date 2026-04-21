# Requirements — Jellyfin Music Sync

**Milestone:** v1
**Status:** Scoped
**Last updated:** 2026-04-19

---

## v1 Requirements

### Authentication (AUTH)

- [x] **AUTH-01**: User can enter a Jellyfin server URL and log in with username and password
- [x] **AUTH-02**: App validates server URL is reachable before attempting login
- [x] **AUTH-03**: App persists the auth token between restarts using secure storage
- [x] **AUTH-04**: User can log out, clearing stored credentials and revoking the server session

### Library Browsing (LIB)

- [x] **LIB-01**: User can view all their Jellyfin playlists with track count displayed
- [ ] **LIB-02**: App shows estimated total download size per playlist before syncing
- [x] **LIB-03**: User can select multiple playlists to sync in a single run
- [x] **LIB-04**: User can filter the playlist list by name

### Sync Core (SYNC)

- [ ] **SYNC-01**: User can choose a destination folder (local drive, USB, mounted media player)
- [ ] **SYNC-02**: App downloads tracks in their original format with no transcoding
- [ ] **SYNC-03**: Downloaded files are organized as Artist / Album / Track in the destination folder
- [ ] **SYNC-04**: All path segments (artist, album, filename) are sanitized for FAT32 compatibility
- [ ] **SYNC-05**: Subsequent syncs only download tracks missing from the destination (incremental)
- [ ] **SYNC-06**: Tracks removed from a Jellyfin playlist are deleted from the destination on next sync
- [ ] **SYNC-07**: If a track appears in multiple playlists it is downloaded once and shared across M3U8 files

### Playlist Files (M3U8)

- [ ] **M3U8-01**: App generates one .m3u8 playlist file per synced playlist
- [ ] **M3U8-02**: M3U8 paths are relative so the file works when the drive is plugged into any device
- [ ] **M3U8-03**: M3U8 includes `#EXTINF` with duration and track title for each entry

### Progress & Control (PROG)

- [x] **PROG-01**: App shows per-file download progress and overall completion percentage during sync
- [x] **PROG-02**: User can cancel an in-progress sync; partial downloads are cleaned up

### Post-Sync (POST)

- [x] **POST-01**: App shows a sync summary (counts of added, deleted, skipped, and failed tracks)
- [x] **POST-02**: App shows an error log listing tracks that failed to download with the reason
- [x] **POST-03**: User can open the destination folder in the OS file explorer from the app
- [ ] **POST-04**: App sends a desktop notification when sync completes

### Settings (SET)

- [ ] **SET-01**: App remembers the last used destination folder and pre-fills it on next sync
- [ ] **SET-02**: User can configure the number of concurrent downloads (1–5)
- [ ] **SET-03**: App writes a debug log file to a known location for troubleshooting

---

## v2 Requirements (Deferred)

- Resume interrupted sync without re-downloading completed files
- Dry-run mode (preview what would change without downloading)
- USB hot-plug detection (auto-detect when a drive is connected)
- Speed and ETA display during sync
- Playlist preview (see track list before syncing)
- Per-playlist sync schedule / automation
- Safe-eject button for USB drives

---

## Out of Scope

- **Audio transcoding** — original files only; no FFmpeg dependency
- **macOS support** — Windows + Linux only for v1
- **Multiple Jellyfin server connections** — one server per session; simplifies auth
- **Playlist editing** — read-only view of Jellyfin playlists
- **Library browser (albums, artists)** — playlists are the entry point; no full library navigation
- **Cloud or remote destinations** — local and USB only; no SFTP, S3, etc.
- **Reverse sync (USB → Jellyfin)** — out of scope; Jellyfin is the source of truth

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SET-01 | Phase 1: Foundation | Pending |
| SET-02 | Phase 1: Foundation | Pending |
| SET-03 | Phase 1: Foundation | Pending |
| AUTH-01 | Phase 2: Jellyfin Connection | Complete |
| AUTH-02 | Phase 2: Jellyfin Connection | Complete |
| AUTH-03 | Phase 2: Jellyfin Connection | Complete |
| AUTH-04 | Phase 2: Jellyfin Connection | Complete |
| LIB-01 | Phase 2: Jellyfin Connection | Complete |
| LIB-02 | Phase 2: Jellyfin Connection | Deferred (v2) |
| LIB-03 | Phase 2: Jellyfin Connection | Complete |
| LIB-04 | Phase 2: Jellyfin Connection | Complete |
| SYNC-01 | Phase 3: Sync Engine | Pending |
| SYNC-02 | Phase 3: Sync Engine | Pending |
| SYNC-03 | Phase 3: Sync Engine | Pending |
| SYNC-04 | Phase 3: Sync Engine | Pending |
| SYNC-05 | Phase 3: Sync Engine | Pending |
| SYNC-06 | Phase 3: Sync Engine | Pending |
| SYNC-07 | Phase 3: Sync Engine | Pending |
| M3U8-01 | Phase 3: Sync Engine | Pending |
| M3U8-02 | Phase 3: Sync Engine | Pending |
| M3U8-03 | Phase 3: Sync Engine | Pending |
| PROG-01 | Phase 4: UI & Feedback | Complete |
| PROG-02 | Phase 4: UI & Feedback | Complete |
| POST-01 | Phase 4: UI & Feedback | Complete |
| POST-02 | Phase 4: UI & Feedback | Complete |
| POST-03 | Phase 4: UI & Feedback | Complete |
| POST-04 | Phase 4: UI & Feedback | Pending |
