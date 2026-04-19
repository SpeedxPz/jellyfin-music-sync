# Domain Pitfalls

**Domain:** Electron desktop app — Jellyfin music sync to USB/local folder
**Researched:** 2026-04-19

---

## Critical Pitfalls

Mistakes that cause data loss, hard-to-reproduce bugs, or full rewrites.

---

### Pitfall 1: FAT32 Illegal Characters in Artist/Album/Song Filenames

**What goes wrong:** Music metadata pulled from Jellyfin frequently contains characters that are illegal on FAT32 volumes: `\ / : * ? " < > |`. Artist names like `AC/DC`, album names like `...And Justice For All`, and song titles with colons or question marks will throw `ENOENT` or `EINVAL` errors when written to USB drives formatted as FAT32 (or exFAT under strict drivers). The error is silent if not explicitly caught because `fs.mkdir` and `fs.writeFile` throw rather than warn.

**Why it happens:** The filename sanitization step is assumed to be simple (strip bad chars), but developers usually forget the full set of FAT32-forbidden characters, forget to sanitize each path segment independently (Artist, Album, filename), and forget that `.` at the start of a filename is invisible on some systems but illegal as a folder name on Windows FAT32. Case-insensitivity is also a trap: `Greatest Hits` and `greatest hits` are the same folder on FAT32, causing one to silently overwrite the other.

**Consequences:** Crash during download, orphaned partial files, sync aborts mid-playlist, user sees half-synced USB.

**Prevention:**
- Implement a `sanitizePathSegment(s: string): string` utility that strips or replaces all of: `\ / : * ? " < > |` plus leading/trailing spaces and dots, and trims to 200 characters (leave headroom for the full path to stay under 255 characters per segment and under ~240 characters total for the combined path).
- Apply it to each segment separately: artist name, album name, and file stem. Never apply to the full path at once.
- Normalize Unicode to NFC before sanitization (accent characters can appear as multi-byte sequences that vary by OS).
- Log the original and sanitized name when they differ; surface this in the UI as a warning.
- Add a test suite with known pathological names: `AC/DC`, `Guns N' Roses`, `???`, `...And Justice For All`, `CON` (Windows reserved name), names with trailing dots.

**Warning signs:** `ENOENT` or `EINVAL` on `fs.mkdir`/`fs.writeFile` with paths containing artist/album names; sync works on NTFS destinations but fails on USB.

**Phase:** Core sync logic phase (file writing, folder creation).

---

### Pitfall 2: Sync Manifest Corruption on Interrupted Sync

**What goes wrong:** The manifest file (`_jellyfin-sync.json`) is written at the end of each sync to record which files are present. If the app crashes, the USB is yanked, or the process is force-killed mid-write, the JSON is partially written — resulting in a truncated or syntactically invalid file. On the next launch, `JSON.parse` throws, the manifest is treated as absent, and the app re-downloads the entire library instead of syncing incrementally. On a large library this is 10–20 GB of redundant downloads.

**Why it happens:** Developers write the manifest with a simple `fs.writeFileSync(path, JSON.stringify(state))`. If the process is killed during that write, the file on disk is a partial buffer. FAT32 has no journal, so there is no recovery. The atomic write pattern (write to `.tmp`, then `fs.renameSync`) is known but often skipped as "good enough later."

**Consequences:** Full re-download on every interrupted sync; data perceived as lost; poor UX for large libraries.

**Prevention:**
- Always write the manifest atomically: write to `_jellyfin-sync.tmp.json` then `fs.renameSync` to `_jellyfin-sync.json`. On FAT32 this is as safe as the filesystem allows.
- On startup, always `JSON.parse` inside a try/catch; if parse fails, log the error and start a fresh manifest (don't crash, but do warn the user that the previous state was unreadable and a full re-scan will occur).
- Validate manifest schema on load (check for expected top-level keys) before trusting its contents.
- Consider writing the manifest incrementally per-playlist rather than once at the very end of a full sync.

**Warning signs:** User reports "it re-downloaded everything again"; `SyntaxError: Unexpected end of JSON` in logs; manifest file is 0 bytes or truncated.

**Phase:** Sync state / manifest design phase.

---

### Pitfall 3: Partial Download Files Left on Disk

**What goes wrong:** A song download is interrupted (network drop, app close, USB full). The partial `.flac` or `.mp3` file sits in the destination folder. On the next sync the app checks `fs.existsSync(destPath)` and finds the file present — so it skips the download, marking the track as synced. The media player on the USB then plays a corrupted track (or refuses to play it) with no indication of what went wrong.

**Why it happens:** Existence checks are cheaper than integrity checks. The `existsSync` shortcut is added early, never revisited. There is no download-in-progress marker, so a half-written file looks identical to a complete one.

**Consequences:** Silently corrupt audio files on the device; sync state diverges from reality; user distrust.

**Prevention:**
- Download to a temp path first (e.g., `Artist/Album/.Song.flac.part`) then `fs.renameSync` to final path only on successful completion with a verified non-zero file size.
- On startup, scan the destination for any `*.part` files and delete them before beginning sync.
- Track in-flight downloads in memory (a `Set<string>` of destination paths) and handle `SIGTERM`/`uncaughtException`/`unhandledRejection` to cancel in-flight downloads and delete `.part` files before exit.
- Optionally compare downloaded file size against `Content-Length` from the Jellyfin response header as a lightweight integrity check.

**Warning signs:** Files with 0 bytes or unexpected small sizes at destination paths; media player reports "cannot read file"; `Content-Length` mismatch in download logs.

**Phase:** Download engine phase.

---

### Pitfall 4: Jellyfin Auth Token Not Persisted — Login on Every Launch

**What goes wrong:** The access token returned by `/Users/AuthenticateByName` is stored in memory only. When the app restarts, the user is prompted to log in again. Every authentication call creates a new device session on the server. After a few weeks of testing, the server accumulates dozens of orphaned sessions. Worse, if credentials are cached in plaintext in `localStorage` in the renderer process, they are readable by any injected script.

**Why it happens:** Token persistence is treated as "phase 2." Storing credentials in Electron's renderer `localStorage` is obvious but insecure. The correct location (Electron's main process, using `keytar` or `safeStorage`) requires platform-specific setup that is deferred.

**Consequences:** Poor UX (login every launch); credential leak if `localStorage` is used; server-side session accumulation.

**Prevention:**
- Store the access token (not the raw password) using `electron.safeStorage.encryptString` / `decryptString` to the app's user data directory. This is OS-keychain-backed on Windows (DPAPI) and Linux (libsecret/kwallet).
- Never store the plaintext password after initial authentication. The token is sufficient for all subsequent API calls.
- Use a stable, app-specific `deviceId` (e.g., a UUID generated once and stored alongside the token) so the server tracks exactly one session per installation. Per Jellyfin's API contract, one `deviceId` maps to one access token; regenerating it every launch creates new sessions.
- Expose a "Log Out" action that calls `/Sessions/Logout` to revoke the token on the server before clearing local storage.

**Warning signs:** Server admin sees dozens of identical device entries; login screen appears on every launch; `safeStorage` not imported in main process.

**Phase:** Authentication phase (first milestone).

---

### Pitfall 5: Jellyfin API Pagination — Missing Items in Large Playlists

**What goes wrong:** `GET /Playlists/{playlistId}/Items` has a default page limit. Calling it without `startIndex` + `limit` and iterating pages returns only the first 100 items. A 500-song playlist silently syncs as 100 songs. The developer tests with a small playlist and never encounters the bug.

**Why it happens:** The endpoint returns `TotalRecordCount` alongside the items array, but if the caller never compares `items.length` to `TotalRecordCount`, the truncation is invisible. There is also a confirmed Jellyfin server bug (Issue #15186) where `TotalRecordCount` can be slightly inconsistent with actual returned items across certain server versions.

**Consequences:** Playlists silently synced with missing tracks; users report "missing songs" without understanding why.

**Prevention:**
- Always paginate: fetch with `limit=500` (or your chosen page size) and `startIndex=0`; if `TotalRecordCount > items.length`, loop with increasing `startIndex` until all items are collected.
- Assert after collection: `assert(allItems.length === totalRecordCount)` — if there is a discrepancy, log a warning rather than silently proceeding.
- Use `userId` in all `/Items` and `/Playlists` requests; the API requires it and will return an error without it.

**Warning signs:** Synced song count is exactly 100 for any playlist larger than 100 tracks; `TotalRecordCount` is logged but item count is not compared.

**Phase:** Jellyfin API client phase.

---

## Moderate Pitfalls

---

### Pitfall 6: M3U8 Path Encoding — Broken Playlists on Car Stereos

**What goes wrong:** The generated M3U8 file uses URL-encoded paths (e.g., `AC%2FDC/Back%20In%20Black/...`) or uses backslashes (Windows path separator). Most hardware media players (car stereos, DAPs) expect plain relative POSIX paths with spaces as spaces, not percent-encoded. The playlist opens in VLC (which handles encoding) but fails on the head unit.

**Why it happens:** Developers use `encodeURIComponent` or `path.join` (which uses backslashes on Windows) when building playlist lines. The M3U spec has no formal encoding requirement, and different players interpret it differently. The VLC forum documents this as a known compat issue.

**Consequences:** Playlist file is present on USB but plays no tracks on the target device.

**Prevention:**
- Write M3U8 path lines as plain relative POSIX paths: use `/` as separator, do not percent-encode, preserve spaces as literal spaces.
- Use `path.relative(playlistDir, trackPath).split(path.sep).join('/')` to normalize to forward slashes regardless of OS.
- Write the M3U8 file itself with UTF-8 encoding and include `#EXTM3U` on line 1.
- Do not use the sanitized-on-disk name as the `#EXTINF` display name; use the original Jellyfin metadata for display and the sanitized name for the path.
- Test the generated file by opening it in both VLC and a hardware player or emulator.

**Warning signs:** M3U8 has `%20` or `%2F` in paths; path separators are backslashes; playlists work on PC but not on USB device.

**Phase:** M3U8 generation phase.

---

### Pitfall 7: Electron contextIsolation Disabled — RCE Exposure

**What goes wrong:** The developer enables `nodeIntegration: true` and/or `contextIsolation: false` in the BrowserWindow config for convenience (to avoid writing a preload script). Any XSS vector in the renderer — including a malformed server error message rendered as HTML — can invoke Node.js APIs directly and achieve Remote Code Execution.

**Why it happens:** Tutorials from 2018–2020 showed `nodeIntegration: true` as the "easy" path. Early Electron defaults had it enabled. Copy-pasted boilerplate still carries these settings.

**Consequences:** Malicious Jellyfin server URL (or MITM attack on an HTTP server URL) can execute arbitrary OS commands.

**Prevention:**
- Set `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` in all BrowserWindows from day one.
- All Node.js / main-process functionality must be exposed through a typed `contextBridge` in the preload script. Keep the bridge surface minimal and specific (e.g., `ipc.startSync(config)`, not `ipc.runCommand(cmd)`).
- Never expose `require`, `shell.openExternal` with user-controlled URLs (without validation), or `fs` directly via `contextBridge`.
- Validate the server URL before connecting: must be `http://` or `https://`, no `file://` or `javascript:` schemes.

**Warning signs:** `nodeIntegration: true` anywhere in BrowserWindow config; preload script does `window.require = require`.

**Phase:** Electron app scaffolding phase (must be correct from the start — retrofitting is painful).

---

### Pitfall 8: Concurrent Download Storms — USB Write Throughput Saturation

**What goes wrong:** The app launches 10–20 simultaneous HTTP downloads and pipes them all to the USB drive at once. USB 2.0 flash drives have ~10–15 MB/s sequential write throughput, which is the bottleneck. With many concurrent writers, throughput per file drops, write cache fills, and the OS starts queuing. The result is slower overall sync than 3–4 concurrent downloads, and occasional `ENOSPC` false-positives because the kernel's write buffer is full even when the device is not.

**Why it happens:** "More concurrent = faster" is true for network-bottlenecked downloads to fast storage, but USB flash drives are I/O bottlenecked, not network bottlenecked. The concurrency model is set to match network capacity, not disk capacity.

**Consequences:** Slower total sync; occasional spurious errors; drive write cache exhaustion on budget USB drives.

**Prevention:**
- Default concurrent downloads to 3 (adjustable by user). This is the sweet spot for most USB drives: enough to keep the network busy without saturating write queues.
- Implement a simple semaphore/queue (e.g., `p-limit` npm package) rather than `Promise.all` over the full track list.
- Detect `ENOSPC` (no space on device) explicitly and stop the sync cleanly rather than crashing — report remaining space to the user before and during sync.

**Warning signs:** USB sync is slower than expected for large libraries; `ENOSPC` errors on drives with space available; memory usage grows proportionally with concurrent downloads.

**Phase:** Download engine phase.

---

### Pitfall 9: Deduplication Key Collision — Two Different Songs With the Same Path

**What goes wrong:** Two songs with different Jellyfin IDs but identical artist + album + title metadata (e.g., a studio version and a live version both titled "Yesterday") resolve to the same sanitized file path. The first song is downloaded; the second overwrites it. The M3U8 for one playlist silently points to the wrong audio file.

**Why it happens:** The deduplication scheme (`Artist/Album/Title.ext`) does not account for metadata collisions. Track numbers are the standard disambiguation but are often omitted from the path.

**Consequences:** One of two identically-named songs is permanently lost; wrong audio plays; M3U references are silently wrong.

**Prevention:**
- Include the track number in the filename: `01 - Yesterday.flac`, `02 - Yesterday (Live).flac`. Use the `IndexNumber` field from the Jellyfin `BaseItemDto`.
- When a path collision is still detected after including track number, append the Jellyfin item ID suffix as a tiebreaker: `01 - Yesterday [a3f2b].flac`.
- The manifest should key by Jellyfin item ID (not file path) to distinguish songs even if they share a path.

**Warning signs:** Two playlists reference the same physical file but should reference different audio; test with a library that has live vs. studio versions of the same track.

**Phase:** Sync logic / deduplication phase.

---

### Pitfall 10: Jellyfin Token in Download URL Logged or Leaked

**What goes wrong:** Jellyfin's audio download endpoint accepts the token as a query parameter: `/Audio/{id}/stream?api_key={token}`. If the app logs request URLs (common during debugging), or if Electron's net module logs are captured, the user's session token is exposed in plaintext logs stored on disk.

**Why it happens:** Using the `api_key` query parameter is convenient (no need to set Authorization headers on streaming requests). Log statements during development capture the full URL and are not removed before release.

**Consequences:** Token readable in log files on disk; if log files are uploaded in a bug report, token is leaked.

**Prevention:**
- Pass the token via the `Authorization: MediaBrowser Token="..."` header, not as a query parameter, for all non-streaming requests.
- For the streaming/download `GET` request (where headers are harder to set with `electron.net`), use the `api_key` parameter but ensure the URL is never logged. Use a log-sanitization utility that redacts `api_key=...` from all logged strings.
- Rotate tokens: call `/Sessions/Logout` and re-authenticate if a token may have been exposed.

**Warning signs:** Full download URLs appear in app logs; `api_key` parameter visible in Electron DevTools network tab.

**Phase:** Jellyfin API client phase.

---

### Pitfall 11: USB Eject Safety — Writes Not Flushed Before Removal

**What goes wrong:** Sync completes, the UI shows "Done," but the OS has not flushed write buffers to the USB drive. The user immediately unplugs. On Linux (which uses aggressive write caching), this frequently results in corrupted or missing files even though the app "finished." The last files written — often the manifest — are the most likely to be lost.

**Why it happens:** Node.js `fs.writeFile` resolves its promise when data is in the OS buffer, not when it is committed to the physical device. FAT32 has no journal to recover from incomplete writes. The app has no hook into the OS eject process to ensure buffers are flushed first.

**Consequences:** Manifest corruption (see Pitfall 2); last few downloaded files missing or zero-byte; user data loss.

**Prevention:**
- After the final manifest write, call `fd.datasync()` (via `fs.open` + `fs.fdatasync`) on the manifest file before closing it.
- Show a "Safe to remove" state in the UI only after all file handles are closed and `datasync` has returned.
- Include a "Safely Eject" button that issues `udisksctl power-off` (Linux) or invokes the Windows `DeviceIoControl` safe-removal API via a native addon or shell command before reporting the drive as safe to remove. This is a nice-to-have but should be planned from the start.
- Instruct users in the UI: do not remove the USB until the "Sync complete — safe to remove" message appears.

**Warning signs:** Manifest is 0 bytes or corrupted after unplugging; users report files present on PC but missing when drive is opened on another device.

**Phase:** Download engine finalization / USB UX phase.

---

## Minor Pitfalls

---

### Pitfall 12: Jellyfin Server Version Mismatch — Unexpected API Shape

**What goes wrong:** The Jellyfin API has had breaking changes between major versions (e.g., `PlayableMediaTypes` changed from comma-delimited string to array of strings between 10.8 and 10.10). The app is built against one server version's API shape and silently misbehaves against another.

**Prevention:** Use the official `@jellyfin/sdk` TypeScript package which is versioned alongside the server. Call `/System/Info` on connection and validate `Version` is >= the minimum supported version. Surface a clear error if the server is too old rather than experiencing mysterious parse failures.

**Phase:** API client / connection phase.

---

### Pitfall 13: Windows MAX_PATH (260 chars) Causing ENAMETOOLONG

**What goes wrong:** `destination\Artist\Album\Song.flac` can exceed 260 characters on Windows if the destination folder is deeply nested (e.g., `D:\Users\username\Documents\Music Backups\Jellyfin\`) and metadata is verbose. Node.js on Windows throws `ENAMETOOLONG` or silently truncates.

**Prevention:** Check total path length before writing; truncate the filename stem (not the extension) if the total would exceed 240 characters. Consider warning the user if their chosen destination folder path is longer than 80 characters. Enable `LongPathsEnabled` registry setting detection and log whether it is active.

**Phase:** File writing / path construction utilities.

---

### Pitfall 14: IPC Large Payload Blocking the Renderer

**What goes wrong:** Progress updates or the full sync manifest are sent over `ipcRenderer` as large JSON blobs on every file completion event. With 500 songs and frequent updates, the serialization cost freezes the UI.

**Prevention:** Send only incremental diffs over IPC (e.g., `{completed: 42, total: 500, lastFile: 'Song.flac'}`), not the entire state object. Debounce progress events to at most 4 per second. Never send file buffers over IPC; keep file I/O entirely in the main process.

**Phase:** IPC / progress reporting phase.

---

### Pitfall 15: Deleting Songs Still Referenced by Other Playlists

**What goes wrong:** Song X is in Playlist A and Playlist B. The user removes Song X from Playlist A and runs sync. The app deletes the file from disk because it is no longer in Playlist A. Playlist B now has a broken M3U8 reference.

**Why it happens:** Deletion logic checks one playlist's previous vs. current state, not the union of all synced playlists.

**Prevention:** Before deleting any file, check whether its Jellyfin item ID appears in any other currently-synced playlist's item list. Only delete if the item is absent from all active playlists. The manifest must track which playlists reference each file, not just which files exist.

**Phase:** Incremental sync / deletion logic phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Electron scaffolding | `contextIsolation: false` set for convenience | Set security config in first commit, enforce via linting |
| Auth / login | Token in plaintext storage or regenerated `deviceId` | Use `safeStorage`, generate `deviceId` once on first launch |
| Jellyfin API client | Pagination truncation; missing `userId` param | Always paginate; unit test with >100 item playlists |
| File path construction | Illegal FAT32 chars; path length overflow | `sanitizePathSegment` utility with test suite before any I/O |
| Download engine | Partial files; concurrent storms; `ENOSPC` | `.part` temp files; semaphore with limit 3; explicit space check |
| Sync manifest write | Corruption on crash/eject | Atomic write via temp + rename; try/catch on read |
| M3U8 generation | Backslashes; percent-encoding; wrong encoding | POSIX paths; raw spaces; UTF-8 with `#EXTM3U` header |
| Deletion logic | Cross-playlist file reference | Ref-count per item ID across all playlists before delete |
| USB finalization | Buffers not flushed | `fdatasync` on manifest; "safe to remove" UI gate |

---

## Sources

- [Jellyfin API Authorization gist (nielsvanvelzen)](https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f)
- [Jellyfin token expiry issue #2704](https://github.com/jellyfin/jellyfin/issues/2704)
- [Jellyfin "Copy Stream URL" token leak issue #10808](https://github.com/jellyfin/jellyfin/issues/10808)
- [Jellyfin /Items endpoint missing items issue #9864](https://github.com/jellyfin/jellyfin/issues/9864)
- [Jellyfin /Items incorrect count issue #15186](https://github.com/jellyfin/jellyfin/issues/15186)
- [Jellyfin playlist API endpoint docs (TypeScript SDK)](https://typescript-sdk.jellyfin.org/classes/generated-client.PlaylistsApi.html)
- [Jellyfin playlist path collision issue #1874](https://github.com/jellyfin/jellyfin/issues/1874)
- [Electron Security — contextIsolation docs](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Security tutorial](https://www.electronjs.org/docs/latest/tutorial/security)
- [Bishop Fox — Reasonably Secure Electron](https://bishopfox.com/blog/reasonably-secure-electron)
- [VLC forum — M3U8 special characters and relative paths](https://forum.videolan.org/viewtopic.php?t=150344)
- [M3U Wikipedia — encoding conventions](https://en.wikipedia.org/wiki/M3U)
- [write-file-atomic npm package](https://www.npmjs.com/package/write-file-atomic)
- [Microsoft — Naming Files, Paths, and Namespaces (MAX_PATH)](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)
- [Baeldung Linux — Safe USB removal](https://www.baeldung.com/linux/cmd-line-remove-usb-safely)
- [Incremental data sync checkpoints (AppMaster)](https://appmaster.io/blog/incremental-data-sync-checkpoints)
- [Jellyfin SDK version compatibility (openHAB issue)](https://github.com/openhab/openhab-addons/issues/17674)
- [Electron IPC guide](https://www.electronjs.org/docs/latest/tutorial/ipc)
