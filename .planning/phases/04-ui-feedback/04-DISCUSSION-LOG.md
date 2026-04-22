# Phase 4: UI & Feedback - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 4-ui-feedback
**Areas discussed:** Progress screen layout, Progress detail level, Post-sync summary & cancel UX, Settings UI

---

## Progress Screen Layout

| Option | Description | Selected |
|--------|-------------|----------|
| New SyncScreen replaces playlist browser | App.tsx gets a third state: login → playlists → syncing. Clean separation, full-screen progress view. | ✓ |
| Progress panel slides in over playlist browser | Playlist list dims, panel slides up. User can see which playlists were selected while syncing. | |
| Modal/dialog over playlist browser | Centered modal shows progress. Playlist browser visible but blurred behind it. | |

**User's choice:** New SyncScreen replaces playlist browser
**Notes:** User selected the recommended option with the full-screen progress mockup.

---

## Progress Detail Level

| Option | Description | Selected |
|--------|-------------|----------|
| Overall bar + current track name | One progress bar with %, current track name, done/remaining/failed counters. | |
| Overall bar + per-file byte bar | Two-level progress: overall track count bar + per-file byte download bar with MB display. | ✓ |
| Scrolling completed track list | Live-updating list of finished tracks (most recent at top). | |

**User's choice:** Overall bar + per-file byte bar (3.1 / 7.0 MB display)
**Notes:** Both `bytesDownloaded`/`bytesTotal` (per-file) and `current`/`total` (overall) are already in `SyncProgress`.

---

## Post-Sync Summary Location

| Option | Description | Selected |
|--------|-------------|----------|
| Replaces progress view inline | Progress screen transitions to summary view in same screen. Back to playlists button returns to browser. | ✓ |
| Modal on top of playlist browser | App returns to playlist browser, summary dialog shown on top. | |
| Persistent summary panel + playlist browser | Summary panel stays visible below playlist browser. Two-pane layout. | |

**User's choice:** Replaces the progress view inline

---

## Cancel UX

| Option | Description | Selected |
|--------|-------------|----------|
| Show partial summary | Progress screen transitions to summary with "Sync Canceled" header and accumulated counts. | ✓ |
| Return to playlist browser silently | Immediate navigation back to playlist browser, no summary shown. | |

**User's choice:** Show partial summary
**Notes:** Uses a `canceled: boolean` flag in syncStore to distinguish header text.

---

## Failures Display

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable section below counts | Collapsed by default. "✖ N failed — show details ▾" expands to list track name + reason. | ✓ |
| Always visible list below counts | Failures always shown, no expand/collapse. | |

**User's choice:** Expandable section, collapsed by default

---

## Desktop Notification

| Option | Description | Selected |
|--------|-------------|----------|
| On completion only, click focuses the app | Fires on sync:complete. Title + summary counts. Click → mainWindow.focus(). | ✓ |
| On completion and cancel, click opens destination | Fires in both cases. Click → shell.openPath(destination). | |

**User's choice:** Completion only, click focuses the app

---

## Settings UI

| Option | Description | Selected |
|--------|-------------|----------|
| Inline on playlist browser | Downloads: [−] N [+] control in the header. No separate settings screen. | ✓ |
| Separate settings screen | Settings icon opens a dedicated screen or drawer. | |
| Leave as Claude's discretion (default 3) | Don't expose in UI for v1. | |

**User's choice:** Inline on playlist browser

---

## Claude's Discretion

- Zustand store shape and file name for sync state
- Whether SyncSummaryScreen is a separate file or conditional branch in SyncScreen
- Progress bar component implementation
- How destination path is surfaced in the summary
- electron-builder config details (app ID, icons, output directory)

## Deferred Ideas

- Animations/transitions between screen states
- Speed and ETA display during sync (v2)
- Dry-run mode (v2)
