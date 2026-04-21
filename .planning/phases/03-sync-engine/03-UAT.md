---
status: complete
phase: 03-sync-engine
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md]
started: 2026-04-21T00:00:00.000Z
updated: 2026-04-21T00:00:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start — App launches without errors
expected: Kill any running dev server. Run `npm run dev` from scratch. Electron window opens, no console errors about ERR_REQUIRE_ESM, "second handler" duplicate channel errors, or "Not implemented" thrown from stubs. The login screen (or playlist browser if already authenticated) loads normally.
result: pass

### 2. Sync Selected button — folder picker opens
expected: Log in, navigate to the playlist browser. Select at least one playlist (checkbox checked). Click "Sync Selected". A native OS folder picker dialog opens. The dialog pre-fills with the last-used destination folder if one was previously chosen (first run: no pre-fill).
result: pass

### 3. Sync starts after folder selection
expected: In the folder picker dialog, choose any local folder and confirm. The dialog closes and the "Sync Selected" button immediately changes text to "Syncing..." and becomes disabled. No error is shown below the button.
result: pass

### 4. Cancelling dialog does nothing
expected: Click "Sync Selected", then click Cancel (or close) in the folder picker dialog without selecting a folder. The button returns to its normal "Sync Selected" state. No error message appears and no sync begins.
result: pass

### 5. Files downloaded to destination
expected: After a sync completes (wait for button to return to "Sync Selected"), open the chosen destination folder. Tracks are organized as: `Artist/Album/TrackName.ext`. Folder and file names should not contain illegal FAT32 characters (no `/ : * ? " < > |`). A `_jellyfin-sync.json` manifest file exists at the destination root.
result: pass
note: No in-progress download counter shown (expected — Phase 4 adds live progress UI; Phase 3 only emits sync:progress events)

### 6. M3U8 playlist file generated
expected: In the destination folder, a `.m3u8` file exists named after the synced playlist (e.g. `My Playlist.m3u8`). Opening it in a text editor shows `#EXTM3U` on the first line, followed by `#EXTINF:` entries with duration and track name, and relative file paths using forward slashes.
result: pass

### 7. Incremental sync skips existing files
expected: Run "Sync Selected" a second time on the same playlist to the same destination. The sync completes faster (no files are re-downloaded). The `_jellyfin-sync.json` manifest is updated but existing files on disk are untouched (same file sizes and modification timestamps).
result: pass

### 8. Sync error shown in UI
expected: If the sync fails (e.g. Jellyfin server goes offline mid-sync, or destination becomes read-only), a red error message appears below the "Sync Selected" button and the button returns to its normal state. The app does not crash or freeze.
result: skipped
reason: Hard to trigger in dev — requires server disconnect or read-only destination mid-sync

## Summary

total: 8
passed: 7
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps
