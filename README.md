# Jellyfin Music Sync

A desktop app for syncing music playlists from a [Jellyfin](https://jellyfin.org) server to a local folder, USB drive, or portable media player.

Select your playlists, pick a destination, hit Sync — walk away with fully playable offline music organized in Artist/Album/Track folders with `.m3u8` playlist files. No manual file management required.

**Platforms:** Windows · Linux

---

## Features

- **Login & persist session** — authenticates against any Jellyfin server; token persists across restarts
- **Browse & multi-select playlists** — view all playlists with track counts, filter by name, select multiple
- **Incremental sync** — only downloads tracks that changed; subsequent runs are fast
- **Cross-playlist deduplication** — a track shared across playlists is stored once on disk
- **Artist/Album/Track structure** — files organized as `Destination/Artist/Album/Track.ext`, FAT32-safe names
- **M3U8 playlist files** — one `.m3u8` per playlist with relative paths and `#EXTINF` metadata; plays on any device
- **Live progress** — per-file MB display and overall percentage updated in real time
- **Configurable concurrency** — 1–5 parallel downloads, persisted across sessions
- **Clean cancel** — stops downloads and removes partial files
- **Sync summary** — counts of added / removed / unchanged / failed with expandable error log
- **Desktop notification** — fires when sync completes
- **Open destination** — opens the sync folder in your OS file explorer from the summary screen
- **Packaged installers** — NSIS installer for Windows, AppImage + deb for Linux

---

## Download

Grab the latest release from the [Releases](../../releases) page:

| Platform | File |
|----------|------|
| Windows | `jellyfin-music-sync-*-setup.exe` |
| Linux (AppImage) | `jellyfin-music-sync-*.AppImage` |
| Linux (deb) | `jellyfin-music-sync_*_amd64.deb` |

---

## Usage

1. Launch the app and enter your Jellyfin server URL, username, and password
2. Select one or more playlists from the browser
3. Choose a destination folder (local drive, USB drive, or media player)
4. Optionally adjust the concurrent downloads setting (default: 3)
5. Click **Sync Selected** and monitor live progress
6. When complete, a desktop notification fires and the summary screen shows what changed

On subsequent runs, only new or changed tracks are downloaded. Tracks removed from Jellyfin playlists are deleted from the destination.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 39 (Node 24 bundled) |
| Build | electron-vite 5 |
| Language | TypeScript 5.4 |
| UI | React 19 + Tailwind CSS 4 |
| State | Zustand 5 |
| Jellyfin client | @jellyfin/sdk 0.13.0 |
| Settings | electron-conf |
| Download queue | p-limit 3 |
| Packaging | electron-builder 26 |

---

## Building from Source

**Prerequisites:** Node.js 20+, npm

```bash
git clone https://github.com/SpeedxPz/jellyfin-music-sync.git
cd jellyfin-music-sync
npm install
```

**Development**
```bash
npm run dev
```

**Build installers**
```bash
npm run build:win    # Windows NSIS installer → dist/
npm run build:linux  # AppImage + deb → dist/
```

**Run tests**
```bash
npm test
```

---

## Architecture

- **All I/O in the main process** — HTTP requests, filesystem ops, and the download queue run in Node.js. The renderer is display-only.
- **Typed IPC** — `contextIsolation: true`, `nodeIntegration: false` enforced. All communication via `contextBridge` with shared types in `shared/ipc-types.ts`.
- **Atomic manifest writes** — the `_jellyfin-sync.json` sync state file is always written via `.tmp` → rename, preventing corruption on crash.
- **FAT32-safe paths** — artist, album, and filename segments are sanitized independently, handling illegal characters, Windows reserved names, and trailing dots/spaces.

---

## License

MIT
