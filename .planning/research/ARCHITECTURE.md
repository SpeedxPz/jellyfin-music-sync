# Architecture Patterns: Jellyfin Music Sync

**Domain:** Electron desktop app — background file sync with API integration
**Researched:** 2026-04-19
**Confidence:** HIGH (official Electron docs + Jellyfin SDK docs + verified patterns)

---

## Component Map

```
┌─────────────────────────────────────────────────────────────────────┐
│  RENDERER PROCESS (BrowserWindow — React/HTML)                      │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  AuthView    │  │  PlaylistPicker  │  │  SyncProgressView   │  │
│  │  - server URL│  │  - list of       │  │  - per-playlist      │  │
│  │  - username  │  │    playlists     │  │    progress bars     │  │
│  │  - password  │  │  - checkboxes    │  │  - file counts       │  │
│  └──────┬───────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│         │                  │                        │              │
│         └──────────────────┴────────────────────────┘              │
│                            │ window.electronAPI.*                  │
└────────────────────────────┼────────────────────────────────────────┘
                             │ contextBridge (preload.ts)
                             ↕ IPC (ipcRenderer.invoke / ipcMain.handle)
                             │ ipcRenderer.on for push events
┌────────────────────────────┼────────────────────────────────────────┐
│  MAIN PROCESS (Node.js)    │                                        │
│                            ↓                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  IPC Handler Registry (ipc-handlers.ts)                     │   │
│  │  Bridges renderer requests → internal services              │   │
│  └───────┬──────────────┬──────────────────┬───────────────────┘   │
│          │              │                  │                        │
│          ↓              ↓                  ↓                        │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ JellyfinClient│  │ DownloadQueue│  │ SyncEngine            │   │
│  │               │  │              │  │                        │   │
│  │ - authenticate│  │ - concurrency│  │ - diff old vs new      │   │
│  │ - getPlaylists│  │   control    │  │   manifest             │   │
│  │ - getPlaylist │  │ - pause/     │  │ - enqueue downloads    │   │
│  │   Items       │  │   resume/    │  │ - delete removed songs │   │
│  │ - getItem     │  │   cancel     │  │ - write M3U8 files     │   │
│  │ - streamUrl() │  │ - retry on   │  │ - update manifest      │   │
│  └───────┬───────┘  │   network err│  └──────────┬────────────┘   │
│          │          └──────┬───────┘             │                 │
│          │                 │                     │                 │
│          ↓                 ↓                     ↓                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  FileSystemManager                                           │  │
│  │  - path sanitization (FAT32 safe)                            │  │
│  │  - Artist/Album/Song directory creation                      │  │
│  │  - atomic file writes                                        │  │
│  │  - manifest read/write (_jellyfin-sync.json)                 │  │
│  │  - M3U8 write (relative paths)                               │  │
│  └─────────────────────────────────────────────────────────────-┘  │
│                                                                     │
│  ┌──────────────────────┐   ┌──────────────────────────────────┐   │
│  │  AppSettings         │   │  FolderPicker / USB Watcher      │   │
│  │  (electron-store)    │   │  - dialog.showOpenDialog         │   │
│  │  - saved server URL  │   │  - optional usb-detection events │   │
│  │  - saved auth token  │   └──────────────────────────────────┘   │
│  │  - last destination  │                                          │
│  └──────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Lives In |
|-----------|---------------|----------|
| `AuthView` | Login form, server URL input, show errors | Renderer |
| `PlaylistPicker` | List + select playlists, trigger sync | Renderer |
| `SyncProgressView` | Real-time progress display per playlist | Renderer |
| `preload.ts` | contextBridge surface — wraps every IPC call | Preload |
| `ipc-handlers.ts` | Registers ipcMain.handle() for every channel | Main |
| `JellyfinClient` | All HTTP calls to Jellyfin REST API | Main |
| `DownloadQueue` | Concurrency-limited download job runner | Main |
| `SyncEngine` | Diff manifest, orchestrate one sync run | Main |
| `FileSystemManager` | Disk I/O, path sanitization, manifest, M3U8 | Main |
| `AppSettings` | User prefs persistence via electron-store | Main |
| `FolderPicker` | Native file dialogs, optional USB detection | Main |

**Rule:** All filesystem access, HTTP calls, and native APIs live exclusively in the main process. The renderer receives only serialized data through IPC.

---

## Data Flow

### Authentication Flow

```
Renderer                  IPC                    Main
   │                       │                       │
   │── invoke('auth:login', {url, user, pass}) ───>│
   │                       │      JellyfinClient   │
   │                       │   POST /Users/        │
   │                       │   AuthenticateByName  │
   │                       │         │             │
   │                       │   ← AccessToken +     │
   │                       │     UserId            │
   │                       │   AppSettings.save()  │
   │<── { userId, token, serverUrl } ──────────────│
   │                       │                       │
```

### Playlist Load Flow

```
Renderer                  IPC                    Main
   │                       │                       │
   │── invoke('playlists:list') ──────────────────>│
   │                       │      JellyfinClient   │
   │                       │   GET /Users/{id}/    │
   │                       │   Items?IncludeItem   │
   │                       │   Types=Playlist      │
   │                       │         │             │
   │<── PlaylistSummary[]  ─────────────────────── │
   │                       │                       │
```

### Sync Flow

```
Renderer                  IPC                    Main
   │                       │                       │
   │── invoke('sync:start', {playlistIds, dest}) ─>│
   │                       │     SyncEngine starts │
   │                       │     for each playlist:│
   │                       │       JellyfinClient  │
   │                       │       GET /Playlists/ │
   │                       │       {id}/Items      │
   │                       │         │             │
   │                       │     Read manifest     │
   │                       │     _jellyfin-sync.   │
   │                       │     json from dest    │
   │                       │         │             │
   │                       │     Diff: new items,  │
   │                       │     removed items     │
   │                       │         │             │
   │                       │     DownloadQueue     │
   │                       │     enqueue new items │
   │                       │         │             │
   │<── event('sync:progress', {...}) ─────────────│  (push)
   │<── event('sync:progress', {...}) ─────────────│  (push)
   │                       │         │             │
   │                       │     FileSystemManager │
   │                       │     delete removed    │
   │                       │     write M3U8 files  │
   │                       │     write manifest    │
   │                       │         │             │
   │<── invoke resolves { ok: true } ──────────────│
   │                       │                       │
```

### Progress Push Pattern

The renderer CANNOT poll for progress — the main process pushes events via `webContents.send()`. The renderer listens with `ipcRenderer.on('sync:progress', callback)` exposed through preload. This is the correct Electron pattern for streaming updates.

---

## IPC Channel Contracts

All channels are typed in a shared `ipc-types.ts` file imported by both preload and main.

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `auth:login` | invoke | `{ serverUrl, username, password }` | `{ userId, token, serverUrl }` or throws |
| `auth:logout` | invoke | — | void |
| `auth:status` | invoke | — | `{ authenticated: boolean, serverUrl?, userId? }` |
| `playlists:list` | invoke | — | `PlaylistSummary[]` |
| `playlists:items` | invoke | `{ playlistId }` | `AudioItemSummary[]` |
| `sync:start` | invoke | `{ playlistIds: string[], destination: string }` | `{ ok: boolean }` |
| `sync:cancel` | invoke | — | void |
| `folder:pick` | invoke | — | `string` (path) or null |
| `sync:progress` | main→renderer push | `SyncProgressEvent` | — |
| `sync:complete` | main→renderer push | `SyncCompleteEvent` | — |
| `sync:error` | main→renderer push | `{ message: string }` | — |

---

## Jellyfin API Endpoints

All requests include the `Authorization` header:
```
Authorization: MediaBrowser Token="<accessToken>", Client="JellyfinMusicSync", Version="1.0.0", DeviceId="<uuid>", Device="Desktop"
```

### Authentication

| Method | Endpoint | Purpose | Body |
|--------|----------|---------|------|
| POST | `/Users/AuthenticateByName` | Login | `{ Username, Pw }` |

Returns: `{ User: { Id }, AccessToken }`. Store both — `userId` is required for subsequent requests.

### Playlists

| Method | Endpoint | Purpose | Key Params |
|--------|----------|---------|------------|
| GET | `/Users/{userId}/Items` | List all playlists | `IncludeItemTypes=Playlist`, `Recursive=true` |
| GET | `/Playlists/{playlistId}/Items` | Get items in a playlist | `UserId={userId}`, `Fields=MediaSources,Path` |

The `Fields=MediaSources` parameter is required to get file container type and stream URLs.

### Audio Items

| Method | Endpoint | Purpose | Key Params |
|--------|----------|---------|------------|
| GET | `/Items/{itemId}` | Get item metadata | `UserId={userId}`, `Fields=MediaSources` |
| GET | `/Audio/{itemId}/universal` | Stream/download original audio | `UserId={userId}`, `Container=mp3,flac,aac,ogg`, `AudioCodec=copy`, `EnableRedirectResponse=false` |

**Download without transcoding:** Use `/Audio/{itemId}/universal` with `Container` matching the source container from `MediaSources[0].Container` and `MaxStreamingBitrate` omitted (or set very high). The `AudioCodec=copy` parameter signals no re-encode. Alternatively, if `MediaSources[0].Path` is accessible from the network (local server), construct the URL directly as `/Items/{itemId}/Download` — this is the cleanest option and returns the original file with its original extension.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/Items/{itemId}/Download` | Download original file (requires `Download` permission) |

**Preferred approach:** Use `/Items/{itemId}/Download` — it returns the original file bytes without any transcoding decisions. Falls back to `/Audio/{itemId}/universal` if download permission is not granted.

### Item Metadata Fields Needed

From each playlist item, extract:
- `Id` — Jellyfin item ID
- `Name` — track title
- `Album` — album name
- `AlbumArtist` or `Artists[0]` — artist name
- `MediaSources[0].Container` — file extension (mp3, flac, etc.)
- `MediaSources[0].Size` — for progress reporting

---

## Sync Manifest Schema

File: `_jellyfin-sync.json` at the root of the destination folder.

This file travels with the USB drive and is the sole source of truth for what was last synced.

```typescript
interface SyncManifest {
  /** Schema version for forward compatibility */
  version: 1;

  /** ISO8601 timestamp of last completed sync */
  lastSyncAt: string;

  /** Jellyfin server that produced this manifest */
  serverUrl: string;

  /**
   * Map of Jellyfin item ID → local relative path.
   * Used to detect files already downloaded (dedup across playlists)
   * and to find files to delete when removed from a playlist.
   */
  files: {
    [jellyfinItemId: string]: {
      /** Relative path from manifest location, e.g. "Artist/Album/Track.flac" */
      relativePath: string;
      /** Original file container, e.g. "flac" */
      container: string;
      /** Jellyfin album artist name (pre-sanitized) */
      artist: string;
      /** Jellyfin album name (pre-sanitized) */
      album: string;
      /** Track title */
      title: string;
    };
  };

  /**
   * Map of Jellyfin playlist ID → playlist sync state.
   */
  playlists: {
    [jellyfinPlaylistId: string]: {
      name: string;
      /** Relative path to M3U8 file from manifest location */
      m3u8Path: string;
      /** Ordered list of Jellyfin item IDs in this playlist */
      itemIds: string[];
      lastSyncAt: string;
    };
  };
}
```

**Design rationale:**
- `files` is keyed by Jellyfin item ID — enables O(1) dedup across playlists. If a track appears in two playlists, it is downloaded once and both M3U8 files reference the same local path.
- `playlists.itemIds` stores the ordered IDs so M3U8 can be regenerated without re-downloading.
- No absolute paths stored anywhere — all `relativePath` values are relative to the manifest location so the drive is portable.

### Diff Algorithm (SyncEngine)

```
1. Fetch current Jellyfin playlist items → currentItemIds (ordered)
2. Read manifest.playlists[playlistId].itemIds → previousItemIds
3. toAdd    = currentItemIds.filter(id => !(id in manifest.files))
4. toDelete = previousItemIds.filter(id => !currentItemIds.includes(id)
                                          && notUsedByOtherPlaylist(id))
5. Enqueue toAdd in DownloadQueue
6. After all downloads complete:
   a. Delete files for toDelete
   b. Write M3U8 for each playlist
   c. Update manifest atomically (write to .tmp then rename)
```

`notUsedByOtherPlaylist(id)` checks whether the item ID appears in the `itemIds` of any other playlist in the manifest. If yes, do not delete the file — only remove it from this playlist's M3U8.

---

## M3U8 Format Notes

### File Format

```
#EXTM3U
#EXTINF:243,Artist Name - Track Title
Artist Name/Album Name/Track Title.flac
#EXTINF:198,Artist Name - Another Track
Artist Name/Album Name/Another Track.mp3
```

Key rules:
- `#EXTM3U` on the first line — required header
- `#EXTINF:<duration_seconds>,<display_name>` — duration is an integer in seconds; get from Jellyfin `RunTimeTicks / 10_000_000`
- Path on the following line — **relative to the M3U8 file location**
- UTF-8 encoding — save with `.m3u8` extension
- No BOM — some car stereos reject BOM-prefixed M3U8 files; write without BOM

### M3U8 File Placement

Place M3U8 files at the destination root: `<dest>/Playlist Name.m3u8`

Audio files are at: `<dest>/Artist/Album/Track.flac`

Therefore the relative path in the M3U8 is: `Artist/Album/Track.flac` (no leading `./`)

### Path Sanitization (FAT32 Safe)

Characters that must be stripped or replaced from all path segments (artist name, album name, track title):

```typescript
const FAT32_ILLEGAL = /[\/\\?<>:*|"]/g;      // illegal in FAT32
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;    // control characters
const TRAILING_DOTS_SPACES = /[. ]+$/;        // FAT32 disallows trailing dots/spaces

function sanitizePathSegment(input: string): string {
  return input
    .replace(FAT32_ILLEGAL, '_')
    .replace(CONTROL_CHARS, '')
    .replace(TRAILING_DOTS_SPACES, '')
    .substring(0, 200);  // leave headroom for full path under 260 chars (Windows limit)
}
```

Apply `sanitizePathSegment` independently to each of: artist name, album name, track filename. Do not sanitize path separators between segments.

---

## Download Queue Design

The queue lives entirely in the main process. The renderer has no direct access to it — it only sees progress events.

```typescript
interface DownloadJob {
  itemId: string;
  url: string;           // Jellyfin download URL with auth token
  destPath: string;      // absolute path on disk
  sizeBytes: number;
  playlistId: string;    // for progress attribution
}

interface QueueOptions {
  concurrency: number;   // recommend 3 — balances throughput vs server load
  retries: number;       // recommend 3 with exponential backoff
}
```

**Implementation approach:** Use Node.js `https.get()` or `node-fetch` with streaming to a `fs.createWriteStream` targeting a `.tmp` file alongside the final destination. On completion, `fs.rename` to the real path (atomic on same filesystem). On error, delete the `.tmp` file. This prevents partial files from being left in a valid-looking location.

**Progress events:** Emit `sync:progress` via `webContents.send()` after each file completes and on each 10% chunk boundary for large files.

---

## Architecture: What Belongs Where

| Concern | Main Process | Renderer |
|---------|-------------|---------|
| HTTP calls to Jellyfin | YES | NO |
| File system reads/writes | YES | NO |
| Download queue | YES | NO |
| electron-store reads/writes | YES | NO |
| Auth token storage | YES | NO |
| USB detection | YES | NO |
| UI state (selected playlists) | — | YES |
| Progress display | — | YES |
| Form validation | — | YES |
| All Electron native APIs | YES | NO (via IPC) |

The renderer is a dumb display layer. It sends user actions via `invoke()` and receives data and events back. This is the correct Electron security posture and the standard pattern for apps using `contextIsolation: true` (the default since Electron 12).

---

## Build Order

The components have hard dependencies. Build in this order:

### Phase 1 — Foundation (no UI, no Jellyfin)
1. **Project scaffold** — Electron + TypeScript + Vite (or electron-vite), eslint, basic window
2. **IPC type contracts** — `ipc-types.ts` with all channel names and payload types (main + preload share this)
3. **preload.ts** — contextBridge stub exposing all channels (can be no-ops initially)
4. **AppSettings** — electron-store wrapper for server URL + auth token persistence
5. **FileSystemManager** — path sanitization, directory creation, manifest read/write, M3U8 write (fully unit-testable with no Electron dependency)

**Why first:** FileSystemManager and IPC types are dependencies of everything else. Getting the manifest schema right early prevents rework.

### Phase 2 — Jellyfin Integration (no UI)
6. **JellyfinClient** — authenticate, getPlaylists, getPlaylistItems, buildDownloadUrl
7. **Manual integration test** — small script that logs in, lists playlists, prints items (validates API access before building UI around it)

**Why second:** API shape drives all data models. Mistakes here ripple everywhere.

### Phase 3 — Download + Sync Engine
8. **DownloadQueue** — concurrency, retry, `.tmp` → rename pattern, progress callbacks
9. **SyncEngine** — diff algorithm, orchestrates JellyfinClient + DownloadQueue + FileSystemManager

**Why third:** Sync is the core value and requires both Phase 1 and Phase 2 to be complete.

### Phase 4 — UI
10. **AuthView** — login form, IPC call to `auth:login`, error display
11. **PlaylistPicker** — list playlists, multi-select, folder picker, Sync button
12. **SyncProgressView** — listen to `sync:progress` events, render progress bars

**Why last:** UI is the thinnest layer. All complexity is already in the main process. The UI can be built and iterated quickly once the backend works.

### Phase 5 — Polish
13. **Error handling** — network failures, auth expiry, disk full, FAT32 name collision
14. **Edge cases** — same song in multiple playlists, empty playlists, cancelled sync mid-run
15. **Packaging** — electron-builder for Windows NSIS installer and Linux AppImage

---

## Key Architectural Constraints from PROJECT.md

- **Single server per session** — JellyfinClient holds one auth context; no multi-server state machine needed
- **No transcoding** — always use `/Items/{itemId}/Download` or `AudioCodec=copy`; never set a bitrate cap
- **State inside dest folder** — manifest MUST be co-located with media, not in `app.getPath('userData')`
- **FAT32 compat** — path sanitization is non-optional; test on a FAT32 USB in CI if possible
- **Relative M3U8 paths** — the playlist must work without this app present; use paths relative to M3U8 file location

---

## Sources

- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) — official, HIGH confidence
- [Electron IPC Tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc) — official, HIGH confidence
- [Jellyfin API Overview by James Harvey](https://jmshrv.com/posts/jellyfin-api/) — MEDIUM confidence (community, well-researched)
- [Jellyfin Authorization Header Spec](https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f) — HIGH confidence (written by Jellyfin contributor)
- [Jellyfin TypeScript SDK](https://typescript-sdk.jellyfin.org/) — official, HIGH confidence
- [electron-store](https://github.com/sindresorhus/electron-store) — official repo, HIGH confidence
- [M3U Wikipedia](https://en.wikipedia.org/wiki/M3U) — MEDIUM confidence (de facto standard, no formal spec)
- [Microsoft FAT32 filename rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) — official, HIGH confidence
