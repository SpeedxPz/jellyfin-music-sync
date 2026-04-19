# Jellyfin Music Sync — Project Guide

## What This Is

A desktop application (Electron + TypeScript, Windows + Linux) that syncs music playlists from a Jellyfin server to a local folder, USB drive, or portable media player. Users select playlists, choose a destination, and the app downloads tracks in Artist/Album/Track structure with M3U8 playlist files. Syncs are incremental and the state travels with the destination folder.

## Core Value

A user can plug in a USB drive, select their Jellyfin playlists, hit Sync, and walk away with fully playable offline music — no manual file management required.

## Tech Stack

- **Electron 41** (Node 24 bundled) — Windows + Linux desktop runtime
- **electron-vite 5** — unified build for main + preload + renderer
- **TypeScript 5.4** — all three Electron contexts
- **@jellyfin/sdk 0.13.0** — official typed Jellyfin REST client
- **React 19 + Zustand 5** — renderer UI and state
- **Tailwind CSS 4** — utility styling
- **electron-builder 26.8** — NSIS (Windows) + AppImage/deb (Linux)
- **p-limit 6** — concurrency control for download queue
- **sanitize-filename** — FAT32-safe path segments
- **Vitest 3** — unit testing

## Architecture Rules

- **All I/O in the main process.** HTTP requests, filesystem ops, download queue — everything lives in Node.js main process. The renderer is display-only.
- **contextIsolation: true, nodeIntegration: false** — enforced from the first commit. Never disable these.
- **Typed IPC via contextBridge.** `preload.ts` exposes `window.electronAPI.*`; types shared via `ipc-types.ts`. Never expose raw `ipcRenderer`.
- **Atomic manifest writes.** The `_jellyfin-sync.json` manifest always writes via `.tmp` → `fs.renameSync`. Never write in place.
- **FAT32 sanitization per segment.** Apply `sanitizePathSegment()` independently to artist, album, and filename. Test with `AC/DC`, `CON`, `...And Justice For All`.

## Critical Pitfalls

1. **FAT32 illegal characters** — strip `\ / : * ? " < > |`, Windows reserved names, trailing dots/spaces
2. **Manifest corruption** — always write atomically; parse in `try/catch`
3. **Partial downloads** — download to `*.part`; rename only on success; delete orphaned `*.part` on startup
4. **Jellyfin pagination** — default cap is 100 items; always paginate with `startIndex` + `limit=500`
5. **Cross-playlist deletion** — check item ID against all synced playlists before deleting

## GSD Workflow

This project uses GSD for phased planning and execution.

**Current milestone:** v1
**Roadmap:** `.planning/ROADMAP.md`
**State:** `.planning/STATE.md`

### Phase execution
```
/gsd-discuss-phase N    # gather context, clarify approach
/gsd-plan-phase N       # create execution plan
/gsd-execute-phase N    # run the plan
/gsd-verify-work N      # verify deliverables
```

### Phase order
1. Foundation — scaffold, IPC, FAT32 utils, settings
2. Jellyfin Connection — auth, library browsing
3. Sync Engine — downloads, incremental sync, M3U8
4. UI & Feedback — progress UI, post-sync summary, packaging
