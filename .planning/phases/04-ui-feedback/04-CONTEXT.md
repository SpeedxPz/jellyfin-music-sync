# Phase 4: UI & Feedback - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the renderer UI on top of the already-complete sync engine: a full-screen progress view with live progress bars, cancel-to-partial-summary flow, a post-sync summary screen with expandable error log, a desktop notification on completion, a concurrent-downloads control on the playlist browser, and packaged builds (NSIS + AppImage). Phase 4 is all renderer — no changes to main-process sync logic.

</domain>

<decisions>
## Implementation Decisions

### Screen Architecture

- **D-SCREEN:** `App.tsx` becomes a 3-state router: `login` → `playlists` → `syncing`. A new `SyncScreen` replaces the playlist browser while a sync is running. The app returns to the playlist browser (via `SyncSummaryScreen` or inline summary state) when sync completes or is canceled.
- **D-ROUTER:** Use a Zustand `syncStore` (or extend the existing state pattern) to hold `syncState: 'idle' | 'syncing' | 'summary'`, accumulated `SyncProgress`, and the final `SyncSummary`. App.tsx renders the correct screen based on this state.

### Progress Screen (SyncScreen)

- **D-PROG-LAYOUT:** The progress screen shows:
  1. Header: app title + Cancel button
  2. Subtitle: "Syncing N playlists • M tracks"
  3. Overall progress bar with percentage (from `current`/`total` in `SyncProgress`)
  4. Current track label: "Now: {artist} — {trackName}" (derived from `trackName`)
  5. Per-file byte progress bar with MB display: "3.1 / 7.0 MB" (from `bytesDownloaded`/`bytesTotal`)
  6. Done/remaining/failed counters at the bottom

- **D-PROG-EVENTS:** Subscribe to `sync:progress` via `window.electronAPI.on('sync:progress', cb)` immediately when SyncScreen mounts. Subscribe to `sync:complete` the same way. Both subscriptions use the `on()` method already in the preload.

### Post-Sync Summary Screen

- **D-SUMMARY-LAYOUT:** When `sync:complete` fires, transition the sync state to `'summary'` and render a summary view (either a separate `SyncSummaryScreen` or a conditional branch inside `SyncScreen`). Shows:
  - Header: "Sync Complete" (or "Sync Canceled") + "Back to playlists" button
  - Count rows: ✔ added / 🗑 removed / ⏭ unchanged / ✖ failed
  - "Open destination folder" button (POST-03) — calls a new IPC handler in main process that invokes `shell.openPath(destination)`
  - Expandable failures section (collapsed by default): "✖ N failed — show details ▾" expands to list each `{ name, reason }` from `SyncSummary.failures`

- **D-SUMMARY-DESTINATION:** The destination folder path must be available in the renderer when the summary is displayed. Either include it in `SyncSummary` (returned from `sync:start`) or cache it in `syncStore` when sync starts. Planner decides the cleanest approach.

### Cancel UX

- **D-CANCEL:** Cancel button on SyncScreen calls `window.electronAPI.sync.cancel()` (fire-and-forget). The renderer does NOT wait for a cancel confirmation event — instead it accumulates whatever `SyncProgress` events arrived before the abort, then when `sync:complete` fires (which still fires after a cancel with partial counts) it transitions to the summary with a "Sync Canceled" header.
- **D-CANCEL-STATE:** Add a `canceled: boolean` flag to syncStore. Set it to `true` when the user clicks Cancel. The summary view uses this flag to choose the header ("Sync Canceled" vs "Sync Complete").

### Failures Display

- **D-FAILURES:** The failures list is collapsed by default. A local `useState` toggle controls the expand/collapse. No animation needed — simple show/hide. When `failures.length === 0`, the expandable section is not rendered at all.

### Desktop Notification

- **D-NOTIF:** Fire a desktop notification on `sync:complete` only (not on cancel). Use Electron's `new Notification(...)` API from the **main process** (renderer notifications require `allowRendererProcessReuse` and are less reliable). The main process already sends `sync:complete` to the renderer — the notification should be sent from `src/main/ipc/sync.ts` immediately before or after `evt.sender.send('sync:complete', summary)`.
- **D-NOTIF-CONTENT:** Title: "Sync complete". Body: "{added} added, {failed} failed" (or "All tracks up to date" if added === 0 and failed === 0).
- **D-NOTIF-CLICK:** Clicking the notification calls `mainWindow.focus()` to bring the app to the foreground. No shell.openPath on click.

### Settings UI

- **D-SETTINGS-CONTROL:** Add an inline concurrent-downloads control to the `PlaylistBrowserScreen` header: `Downloads: [−] N [+]` where N is clamped 1–5. Clicking calls `window.electronAPI.settings.set({ concurrentDownloads: N })`. Read the initial value from `window.electronAPI.settings.get()` on mount (alongside the existing playlist fetch). The control is disabled while syncing (though syncing replaces the playlist browser, so this is mostly a safety guard).
- **D-SETTINGS-PASS:** Pass the current `concurrentDownloads` value from the settings UI into the `SyncOptions` when calling `sync.start`, replacing the current hardcoded `3`.

### Packaging

- **D-PACKAGE:** Use `electron-builder` (already in the stack) with:
  - Windows: NSIS one-click installer
  - Linux: AppImage (no system dependencies)
  - No auto-updater for v1
  - Claude's Discretion: exact `electron-builder.yml` config, icon assets, app ID, output directory

### Claude's Discretion

- Exact Zustand store shape and file name for sync state
- Whether `SyncSummaryScreen` is a separate file or a conditional branch in `SyncScreen`
- Progress bar component implementation (native CSS or small utility)
- Animation/transition between progress and summary views (none required)
- How the destination path is surfaced in the summary (include in SyncSummary or cache in store)
- electron-builder config details (app ID, productName, icon paths, output directory)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Progress — PROG-01, PROG-02
- `.planning/REQUIREMENTS.md` §Post-Sync — POST-01, POST-02, POST-03, POST-04
- `.planning/REQUIREMENTS.md` §Settings — SET-01, SET-02 (concurrent downloads UI)

### IPC Contract
- `shared/ipc-types.ts` — `SyncProgress`, `SyncSummary`, `ElectronAPI.on()` overloads for `sync:progress` and `sync:complete`; `SyncOptions.concurrentDownloads`
- `src/preload/index.ts` — `on()` implementation (`ipcRenderer.on` wrapper); `sync.cancel` is fire-and-forget (`ipcRenderer.send`)
- `src/main/ipc/sync.ts` — `sync:complete` push after `runSync()` returns; where to add desktop notification

### Architecture Rules
- `CLAUDE.md` — All I/O in main process; contextIsolation: true / nodeIntegration: false

### Prior Phase Context
- `.planning/phases/03-sync-engine/03-CONTEXT.md` — D-PROG-GRANULARITY (progress event shape), D-PROG-PUSH (webContents.send channel name `sync:progress`), D-DEST-PICKER/SAVE (destination handling)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/store/authStore.ts` — Zustand pattern to follow for new `syncStore`
- `src/renderer/src/screens/PlaylistBrowserScreen.tsx` — Settings control goes into this file's header; `concurrentDownloads` passed into `sync.start` call
- `src/main/ipc/sync.ts` — Add desktop notification call here, alongside the existing `evt.sender.send('sync:complete', summary)` line

### Established Patterns
- Dark gray Tailwind theme: `bg-gray-900` (page), `bg-gray-800` (header/cards), `text-gray-100`
- Two-screen router in `App.tsx` — extend to 3-state with `syncState` from the new store
- `window.electronAPI.on(event, cb)` subscription pattern already typed and implemented in preload
- IPC handlers export a `register*Handlers()` function called from `src/main/index.ts`

### Integration Points
- `src/renderer/src/App.tsx` — Add third routing branch for `syncing`/`summary` states
- `src/main/ipc/sync.ts` — Add desktop notification; optionally include `destination` in `sync:complete` payload
- `src/renderer/src/screens/PlaylistBrowserScreen.tsx` — Add downloads control to header; pass value to `sync.start`
- `electron-builder` config — new file (`electron-builder.yml` or inline in `package.json`)

### No Existing Components
- No component library or reusable UI components yet — Phase 4 builds progress bars, count rows, and the expandable failures list from scratch using Tailwind

</code_context>

<specifics>
## Specific Ideas

- Progress screen mockup (user-selected):
  ```
  [ Jellyfin Music Sync ]              [Cancel]

  Syncing 3 playlists • 247 tracks

  Overall:  ███████████████▌░░░░░░░░  62%

  Now: The Strokes — Reptilia
  File:     ███████████░░░░░░░░░░░░░  44%  (3.1 / 7.0 MB)

  ✔ 153 done  •  ⧖ 94 remaining  •  ✖ 0 failed
  ```

- Summary screen mockup (user-selected):
  ```
  [ Jellyfin Music Sync ]         [Back to playlists]

  Sync Complete

    ✔  153 added
    🗑   12 removed
    ⏭   82 unchanged
    ✖    3 failed  [show details ▾]

    ▾ Failed tracks:
    • AC/DC — Thunderstruck.flac — 403 Forbidden
    • Miles Davis — Kind of Blue.mp3 — Connection timeout

  [Open destination folder]
  ```

- Cancel summary mockup:
  ```
  Sync Canceled

    ✔   89 added (before cancel)
    ⧖  158 remaining (not downloaded)
    ✖    0 failed
  ```

- Notification content: Title "Sync complete", body "{N} added, {M} failed" or "All tracks up to date"

- Settings control in header: `Downloads: [−] 3 [+]` clamped 1–5

</specifics>

<deferred>
## Deferred Ideas

- Animation/transitions between screen states — not required for v1
- Speed and ETA display during sync — listed in REQUIREMENTS.md §v2 Deferred
- Dry-run mode / preview — listed in REQUIREMENTS.md §v2 Deferred

</deferred>

---

*Phase: 04-ui-feedback*
*Context gathered: 2026-04-21*
