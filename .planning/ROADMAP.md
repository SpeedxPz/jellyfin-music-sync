# Roadmap: Jellyfin Music Sync

## Overview

Starting from a blank Electron project, four phases build the app from the inside out: first the invisible foundation (IPC contracts, filesystem utilities, settings), then the Jellyfin connection layer (auth + library browsing), then the sync engine that does the actual work (downloads, deduplication, M3U8 generation), and finally the wired UI with live progress feedback and post-sync reporting. Each phase produces something testable before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Electron scaffold, typed IPC surface, filesystem utilities, and app settings store
- [x] **Phase 2: Jellyfin Connection** - Auth flow and library browsing wired end-to-end against a real server
- [ ] **Phase 3: Sync Engine** - Download queue, incremental sync, deduplication, and M3U8 generation
- [ ] **Phase 4: UI & Feedback** - Wired React UI with live progress, cancel, post-sync summary, and packaged builds

## Phase Details

### Phase 1: Foundation
**Goal**: The Electron app launches with a secure architecture, typed IPC contracts, FAT32-safe filesystem utilities, and a persistent settings store — all tested before any feature work begins
**Depends on**: Nothing (first phase)
**Requirements**: SET-01, SET-02, SET-03
**Success Criteria** (what must be TRUE):
  1. App launches on Windows and Linux with contextIsolation enabled and nodeIntegration disabled
  2. `sanitizePathSegment()` correctly handles FAT32 illegal characters, Windows reserved names, and trailing dots/spaces (verified by unit tests)
  3. Atomic manifest read/write survives a simulated crash (write-to-tmp, rename) without corruption
  4. App remembers the last destination folder and concurrent download setting across restarts
  5. Debug log file is written to a known location and captures startup events
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md — Electron scaffold, Tailwind v4, electron-conf install, shared/ipc-types.ts
- [x] 01-02-PLAN.md — Preload contextBridge wiring (full ElectronAPI surface)
- [x] 01-03-PLAN.md — Main process: store, logger, fs-utils, IPC handlers, stubs
- [x] 01-04-PLAN.md — Dev panel UI (React, wired to settings IPC, human verify)
- [x] 01-05-PLAN.md — Unit tests: sanitizePathSegment, atomicWriteJson, safeReadJson

### Phase 2: Jellyfin Connection
**Goal**: Users can authenticate against a Jellyfin server, browse their playlists with track counts, and their session persists across app restarts
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, LIB-01, LIB-03, LIB-04
**Success Criteria** (what must be TRUE):
  1. User can enter a server URL and credentials; app validates reachability before attempting login
  2. Auth token is stored via `safeStorage` and the user is still logged in after closing and reopening the app
  3. User can log out, clearing all stored credentials and revoking the server session
  4. User can see all their Jellyfin playlists with track counts, and filter the list by name
  5. User can select multiple playlists from the list before initiating a sync
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Install deps, fix ESM build config, extend types/store, create jellyfin.ts SDK wrapper
- [x] 02-02-PLAN.md — Main process IPC handlers: auth.ts + playlists.ts, remove Phase 2 stubs, wire index.ts
- [x] 02-03-PLAN.md — Renderer: Zustand auth store, LoginScreen, App.tsx screen router
- [x] 02-04-PLAN.md — Renderer: PlaylistBrowserScreen with filter, multi-select, logout, Linux warning banner

### Phase 3: Sync Engine
**Goal**: Selected playlists are fully downloaded to the destination in Artist/Album/Track structure with M3U8 files, subsequent runs are incremental, duplicate tracks are stored once, and orphaned tracks are removed
**Depends on**: Phase 2
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06, SYNC-07, M3U8-01, M3U8-02, M3U8-03
**Success Criteria** (what must be TRUE):
  1. User can pick a destination folder; tracks download in original format organized as Artist/Album/Track with FAT32-safe names
  2. A `.m3u8` file is generated per playlist with relative paths and `#EXTINF` metadata; the file plays on a separate device when the drive is plugged in
  3. A second sync run downloads zero files when nothing has changed; tracks added to a Jellyfin playlist appear on the next run; removed tracks are deleted from the destination
  4. A track present in two playlists exists as one file on disk and is referenced by both M3U8 files
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md — Install p-limit@3, extend SyncSummary, implement manifest.ts + m3u8.ts + downloader.ts
- [ ] 03-02-PLAN.md — Wave 0 test scaffolds: manifest.test.ts, m3u8.test.ts, downloader.test.ts
- [ ] 03-03-PLAN.md — Implement sync-engine.ts (full orchestration pipeline)
- [ ] 03-04-PLAN.md — Wire IPC: patch stubs.ts, create sync.ts handler, update index.ts + PlaylistBrowserScreen

### Phase 4: UI & Feedback
**Goal**: Users see live per-file and overall progress during sync, can cancel cleanly, receive a desktop notification on completion, and can review a full sync summary and error log
**Depends on**: Phase 3
**Requirements**: PROG-01, PROG-02, POST-01, POST-02, POST-03, POST-04
**Success Criteria** (what must be TRUE):
  1. During sync, per-file download progress and an overall completion percentage are visible in real time
  2. Cancelling an in-progress sync stops downloads and cleans up partial files on disk
  3. After sync completes, the app shows counts of added, deleted, skipped, and failed tracks alongside a log of any failures with reasons
  4. A desktop notification fires when sync finishes; user can open the destination folder in the OS file explorer directly from the app
  5. App packages as a working NSIS installer (Windows) and AppImage (Linux)
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete | 2026-04-20 |
| 2. Jellyfin Connection | 4/4 | Complete | 2026-04-21 |
| 3. Sync Engine | 1/4 | In progress | - |
| 4. UI & Feedback | 0/TBD | Not started | - |
