---
phase: 04-ui-feedback
plan: "04"
subsystem: packaging

tags: [electron-builder, packaging, icons, nsis, appimage, smoke-test]

requires:
  - phase: 04-ui-feedback
    plan: "03"
    provides: All Phase 4 UI screens complete and wired; typecheck clean; 55 tests green

provides:
  - build/icon.png (512x512 PNG, Linux AppImage icon)
  - build/icon.ico (ICO format with ICO magic bytes, Windows NSIS icon)
  - npm run build:win — produces NSIS installer via electron-builder
  - npm run build:linux — produces AppImage + deb via electron-builder
  - Human-verified packaged build passing all 12 smoke test steps

affects: []

tech-stack:
  added: []
  patterns:
    - "Icon generation: electron-icon-builder --input=<source> --output=build/ --flatten produces ICO + PNG size variants"
    - "Build scripts: build:win and build:linux wrap electron-vite build + electron-builder --win/--linux"

key-files:
  created:
    - build/icon.png
    - build/icon.ico
  modified:
    - package.json

key-decisions:
  - "04-04: Custom sync.png icon (music note + circular arrows) used instead of gray placeholder — approved by user during smoke test checkpoint"
  - "04-04: Window default size set to 900x640 (min 800x560) — accommodates playlist list + sync screen without scrollbar at common resolutions"
  - "04-04: eye toggle in LoginScreen replaced with flat SVG icons (no emoji) — consistent with rest of UI and avoids platform-specific glyph rendering"
  - "04-04: Download concurrents label replaces Downloads in settings header — more precise terminology"

requirements-completed: [PROG-01, PROG-02, POST-01, POST-02, POST-03, POST-04]

duration: ~20min
completed: 2026-04-22
---

# Phase 4 Plan 04: Icon Assets, Build Scripts, and Packaged Build Verification Summary

**Icon assets (build/icon.ico, build/icon.png) added and packaging scripts wired; human-verified NSIS installer on Windows passes all 12 smoke test steps including live progress, cancel, notification, and destination folder open**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-04-22
- **Tasks:** 2 (1 auto + 1 checkpoint)
- **Files modified:** 3

## Accomplishments

- Generated `build/icon.ico` (valid ICO format, ICO magic bytes `00 00 01 00`) and `build/icon.png` (512x512 PNG) from a custom sync-themed source image
- Added `build:win` and `build:linux` npm scripts to `package.json` wrapping electron-vite build + electron-builder
- Human-verified packaged build on Windows passing all 12 smoke test steps:
  1. App launches to Login screen
  2. Login to Jellyfin server — Playlist browser appears
  3. Downloads concurrents control visible in header
  4. − / + clamps between 1 and 5; persists across restart
  5. Sync Selected → destination picker → SyncScreen with real-time progress bars
  6. SyncSummaryScreen shows "Sync Complete" with correct counts
  7. Desktop notification fires on completion (not on cancel)
  8. "Open destination folder" opens OS file explorer
  9. "Back to playlists" returns to browser
  10. Cancel → SyncSummaryScreen shows "Sync Canceled"
  11. No `*.part` files after cancel
  12. No notification fires after cancel

## Task Commits

Each task was committed atomically:

1. **Task 1: Icon assets and build scripts** — `d7be07e` (chore)

Additional fixes applied post-Task 1 (all committed before smoke test checkpoint):

| Commit | Type | Description |
|--------|------|-------------|
| `d16a196` | fix | Stable "Now" label with concurrent downloads in SyncScreen |
| `00fec94` | fix | Default window size 900x640, min 800x560 |
| `a80282c` | fix | Constrain screens to window height; playlist list scrolls internally |
| `d3787cd` | fix | Replace emoji eye toggle with flat SVG icons in LoginScreen |
| `dd2fd7b` | fix | Rename "Downloads" label to "Download concurrents" |
| `2c72f8b` | fix | Replace gray placeholder with flat music+sync icon |
| `11991c9` | fix | Use custom sync.png as app icon |

## Files Created/Modified

- `build/icon.png` — 512x512 PNG icon used by Linux AppImage packager
- `build/icon.ico` — ICO format icon used by Windows NSIS installer; verified ICO magic bytes at offset 0
- `package.json` — Added `build:win` and `build:linux` scripts

## Decisions Made

- Custom sync.png (music note + circular arrows) approved by user in place of gray placeholder — gives the installer and Start Menu shortcut a distinct identity
- Window default bumped from Electron default 800x600 to 900x640 to accommodate the sidebar + content split without horizontal clipping
- SVG eye-toggle replaces emoji in LoginScreen — cross-platform consistent rendering; emoji was rendering differently on Linux AppImage
- "Download concurrents" label replaces "Downloads" in settings header for precision

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stable "Now" label with concurrent downloads**
- **Found during:** Post-Task 1 pre-checkpoint refinement
- **Issue:** With concurrent downloads active, the "Now downloading" label flickered between track names as multiple IPC progress events fired
- **Fix:** Stabilized label to show the most recently started track name only (latest `trackName` from progress event with `bytesDownloaded === 0`)
- **Files modified:** `src/renderer/src/screens/SyncScreen.tsx`
- **Commit:** `d16a196`

**2. [Rule 2 - UX Critical] Window size too small for content**
- **Found during:** Post-Task 1 pre-checkpoint refinement
- **Issue:** Default 800x600 window clipped the playlist list footer controls; min constraint allowed unusable layout
- **Fix:** Set `width: 900, height: 640, minWidth: 800, minHeight: 560` in createWindow()
- **Files modified:** `src/main/index.ts`
- **Commit:** `00fec94`

**3. [Rule 1 - Bug] Screen overflow — content taller than viewport**
- **Found during:** Post-Task 1 pre-checkpoint refinement
- **Issue:** PlaylistBrowserScreen's playlist list grew beyond the window height; no internal scroll
- **Fix:** Applied `h-full overflow-hidden` to outer containers and `overflow-y-auto` to the scrollable list region
- **Files modified:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx`, `src/renderer/src/App.tsx`
- **Commit:** `a80282c`

**4. [Rule 2 - UX] Emoji eye toggle inconsistent cross-platform**
- **Found during:** Post-Task 1 pre-checkpoint refinement
- **Issue:** Emoji `👁` / `🙈` renders differently on Linux vs Windows in packaged builds
- **Fix:** Replaced with flat SVG eye / eye-off icons
- **Files modified:** `src/renderer/src/screens/LoginScreen.tsx`
- **Commit:** `d3787cd`

**5. [Rule 2 - UX] Ambiguous "Downloads" label in settings**
- **Found during:** Post-Task 1 pre-checkpoint refinement
- **Issue:** "Downloads" header label was ambiguous — could mean download count or a section for downloads
- **Fix:** Renamed to "Download concurrents"
- **Files modified:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx`
- **Commit:** `dd2fd7b`

**6. [Rule 2 - UX] Gray placeholder icon shipped in final build**
- **Found during:** Task 1 completion
- **Issue:** Placeholder icon (solid gray square) is visually undifferentiated on Windows taskbar/Start menu
- **Fix:** Created custom sync.png with music note + circular arrows motif; approved by user at checkpoint
- **Files modified:** `build/icon.png`, `build/icon.ico`, and source asset
- **Commits:** `2c72f8b`, `11991c9`

## Known Stubs

None — all UI screens are fully wired; no placeholders or TODO markers in rendered UI paths.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced. Packaging wraps existing code; electron-builder NSIS installer uses standard Windows UAC; no custom installer actions.

---

## Self-Check: PASSED

- `build/icon.png` — FOUND
- `build/icon.ico` — FOUND
- Commit `d7be07e` — FOUND (Task 1: icon assets and build scripts)
- Commit `d16a196` — FOUND (fix: stable Now label)
- Commit `00fec94` — FOUND (fix: window size)
- Commit `a80282c` — FOUND (fix: layout scroll)
- Commit `d3787cd` — FOUND (fix: SVG eye toggle)
- Commit `dd2fd7b` — FOUND (fix: label rename)
- Commit `11991c9` — FOUND (fix: custom icon)
- Human verification checkpoint: APPROVED (all 12 smoke test steps passed)

---
*Phase: 04-ui-feedback*
*Completed: 2026-04-22*
