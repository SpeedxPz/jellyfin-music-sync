---
phase: 3
slug: sync-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.1.0 |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npm test -- --reporter=verbose tests/lib/` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --reporter=verbose tests/lib/`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-W0-01 | W0 | 0 | SYNC-05, SYNC-06, SYNC-07 | — | N/A | unit | `npm test -- tests/lib/manifest.test.ts` | ❌ W0 | ⬜ pending |
| 3-W0-02 | W0 | 0 | M3U8-02, M3U8-03 | — | N/A | unit | `npm test -- tests/lib/m3u8.test.ts` | ❌ W0 | ⬜ pending |
| 3-W0-03 | W0 | 0 | D-ERR-CLEANUP | — | .part deleted on failure | unit | `npm test -- tests/lib/downloader.test.ts` | ❌ W0 | ⬜ pending |
| 3-xx-04 | — | — | SYNC-04 | Path traversal | sanitizePathSegment strips `..` and illegal chars | unit | `npm test -- tests/lib/fs-utils.test.ts` | ✅ | ⬜ pending |
| 3-xx-05 | — | — | D-MANIFEST-ATOMIC | Manifest injection | atomicWriteJson never writes in-place | unit | `npm test -- tests/lib/fs-utils.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/manifest.test.ts` — stubs for SYNC-05, SYNC-06, SYNC-07 (manifest schema, incremental check, cross-playlist deletion)
- [ ] `tests/lib/m3u8.test.ts` — stubs for M3U8-02, M3U8-03 (relative path normalization, EXTINF generation)
- [ ] `tests/lib/downloader.test.ts` — stubs for D-ERR-CLEANUP (.part cleanup on error and path-building logic)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Track downloads in original format, no transcoding | SYNC-02 | Requires live Jellyfin server + real audio file | Play the downloaded file; confirm codec matches server original |
| M3U8 plays on a separate device when drive is plugged in | M3U8-01, M3U8-02 | Cross-device portability cannot be automated | Copy destination to USB; open .m3u8 in VLC on another machine |
| Destination folder picker dialog opens with last-used path | SYNC-01 | Native dialog is OS-rendered; cannot be automated | Click Sync Selected; verify dialog opens at `Settings.lastDestination` |
| Second sync run downloads zero files when nothing changed | SYNC-05 | Requires live server + filesystem state | Run sync twice on same destination; confirm no network activity on second run |
| *.part files from prior interrupted run are cleaned on startup | D-ERR-ORPHANS | Requires filesystem pre-condition setup | Place a .part file in destination; restart app; confirm file is deleted |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
