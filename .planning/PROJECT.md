# Jellyfin Music Sync

## What This Is

A desktop application (Electron, Windows + Linux) that syncs music playlists from a Jellyfin server to a local folder, USB drive, or portable media player. Users log in with their Jellyfin account, pick one or more playlists, choose a destination folder, and the app downloads the music in Artist/Album structure alongside an M3U8 playlist file. Subsequent syncs are incremental — only missing files are downloaded, removed songs are deleted, and state is tracked inside the destination folder itself.

## Core Value

A user can plug in a USB drive, select their Jellyfin playlists, hit Sync, and walk away with fully playable offline music — no manual file management required.

## Requirements

### Validated

- [x] User can log in with Jellyfin server URL and credentials — Validated in Phase 2: Jellyfin Connection
- [x] App validates server reachability before login — Validated in Phase 2: Jellyfin Connection
- [x] Auth token persists across restarts via safeStorage — Validated in Phase 2: Jellyfin Connection
- [x] User can log out, clearing credentials and revoking session — Validated in Phase 2: Jellyfin Connection
- [x] User can browse playlists with track counts — Validated in Phase 2: Jellyfin Connection
- [x] User can filter playlists by name (client-side) — Validated in Phase 2: Jellyfin Connection
- [x] User can select multiple playlists before syncing — Validated in Phase 2: Jellyfin Connection

### Active

- [ ] User can log in with Jellyfin server URL and credentials
- [ ] User can browse and select one or more playlists from their Jellyfin library
- [ ] User can choose a destination folder (local drive, USB, or mounted media player)
- [ ] App downloads all songs in selected playlists in original format (no transcoding)
- [ ] Songs are organized as Artist / Album / Song in the destination folder
- [ ] App generates an M3U8 playlist file per synced playlist
- [ ] If the same song appears in multiple playlists, it is downloaded once and referenced by all M3U8 files
- [ ] App tracks sync state inside the destination folder (hidden manifest file)
- [ ] Subsequent syncs are incremental — only missing songs are downloaded
- [ ] Songs removed from a Jellyfin playlist are deleted from the local folder on next sync
- [ ] User can sync multiple playlists in a single run with progress feedback
- [ ] App supports a single Jellyfin server connection per session

### Out of Scope

- Multiple simultaneous Jellyfin server connections — one server at a time keeps auth simple
- Audio transcoding / format conversion — original files only, avoids quality loss and complexity
- macOS support — Windows + Linux only for v1
- Cloud sync or remote destinations — local/USB only
- Playlist editing — read-only view of Jellyfin playlists

## Context

- Target devices: local folders, USB flash drives, portable DAPs and car stereos that mount as USB storage
- The M3U8 file must use relative paths so the playlist works when the USB is plugged into any device
- Sync state is stored as a hidden JSON manifest inside the destination folder so it travels with the media (e.g., `_jellyfin-sync.json`)
- Jellyfin has a well-documented REST API; authentication is via `/Users/AuthenticateByName`
- Electron gives a single codebase for Windows + Linux with native file dialogs and USB detection

## Constraints

- **Tech Stack**: Electron + TypeScript — cross-platform desktop, chosen upfront
- **Compatibility**: Windows 10+ and mainstream Linux distros (Ubuntu, Fedora)
- **Network**: Jellyfin server must be reachable; app should handle offline gracefully
- **File system**: Must handle FAT32 filename restrictions for USB compatibility (long names, special chars)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Electron (JS/TS) | Cross-platform, strong ecosystem, user preference | — Pending |
| Artist/Album folder structure | Familiar layout, works with most media players | — Pending |
| Sync state inside destination folder | Portable — state travels with the USB drive | — Pending |
| Shared song files across playlists | Saves space on USB drives | — Pending |
| Delete removed songs on sync | Keeps local copy in true sync with Jellyfin playlist | — Pending |
| Original format only | No quality loss, no FFmpeg dependency | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-21 — Phase 2 complete; auth + playlist browsing validated*
