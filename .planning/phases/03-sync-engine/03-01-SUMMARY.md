---
phase: 03-sync-engine
plan: "01"
subsystem: sync-engine-core
tags: [manifest, m3u8, downloader, p-limit, ipc-types, fat32, atomic-write, tdd]
dependency_graph:
  requires: [01-03-fs-utils, 01-02-preload-ipc]
  provides: [manifest-rw, m3u8-gen, track-downloader]
  affects: [03-02-sync-orchestrator, 03-03-ipc-handlers]
tech_stack:
  added: [p-limit@3.1.0]
  patterns: [atomic-write, part-file-lifecycle, passthrough-chunk-counting, fat32-per-segment-sanitize, vitest-module-mock-factory]
key_files:
  created:
    - src/main/lib/manifest.ts
    - src/main/lib/m3u8.ts
    - src/main/lib/downloader.ts
    - tests/lib/manifest.test.ts
    - tests/lib/m3u8.test.ts
    - tests/lib/downloader.test.ts
  modified:
    - shared/ipc-types.ts
    - package.json
    - package-lock.json
decisions:
  - "p-limit@3 (CJS-compatible) pinned as direct dep — v4+ is ESM-only, same ERR_REQUIRE_ESM class as electron-store"
  - "downloadTrack uses PassThrough for chunk counting — avoids double-consuming the axios response stream"
  - "fileSize stored from statSync(destPath).size post-rename — Content-Length unreliable for chunked responses"
  - "manifest.localPath stored as forward-slash relative — reconstructed via split('/') + join() for OS stat"
  - "vi.mock factory with module-level axiosMockImpl variable — avoids ESM namespace non-configurable + vi.mock hoisting conflict"
metrics:
  duration: "7 min"
  completed: "2026-04-21"
  tasks_completed: 3
  files_created: 6
  files_modified: 3
---

# Phase 3 Plan 01: Core Sync Library Modules Summary

One-liner: p-limit@3 installed (CJS), SyncSummary extended, and three fully-implemented sync engine library modules (manifest.ts, m3u8.ts, downloader.ts) created with TDD — 49 tests passing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install p-limit@3 + extend SyncSummary | 24be38a | package.json, package-lock.json, shared/ipc-types.ts |
| 2 (RED) | Failing tests for manifest.ts | b844eff | tests/lib/manifest.test.ts |
| 2 (GREEN) | Implement manifest.ts | 810e395 | src/main/lib/manifest.ts |
| 3 (RED) | Failing tests for m3u8.ts + downloader.ts | 4800ff3 | tests/lib/m3u8.test.ts, tests/lib/downloader.test.ts |
| 3 (GREEN) | Implement m3u8.ts + downloader.ts | b57b422 | src/main/lib/m3u8.ts, src/main/lib/downloader.ts |
| 3 (fix) | Fix TS2345 content-length type | 347c8e3 | src/main/lib/downloader.ts |

## Verification Results

- All 49 tests pass (`npm test`): 17 manifest + 8 m3u8 + 11 downloader + 13 fs-utils
- TypeScript compiles cleanly (`npm run typecheck:node`)
- `node -e "require('p-limit')"` exits 0 (CJS require works)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong runTimeTicks values in m3u8 test data**
- **Found during:** Task 3 GREEN phase (first test run)
- **Issue:** Test used `180_000_000_00` (= 18,000,000,000 ticks = 1800s) instead of `1_800_000_000` (= 180s). Jellyfin uses 100ns ticks so 1s = 10,000,000 ticks.
- **Fix:** Corrected all tick values in m3u8.test.ts to match the correct scale
- **Files modified:** tests/lib/m3u8.test.ts
- **Commit:** b57b422

**2. [Rule 1 - Bug] vi.mock hoisting conflict with in-body variables**
- **Found during:** Task 3 GREEN phase
- **Issue:** `vi.mock('axios', factory)` is hoisted to top of file by Vitest but factory referenced `errorStream` defined inside a test body → `ReferenceError: errorStream is not defined`
- **Fix:** Rewrote downloader tests to use module-level `axiosMockImpl` variable captured by the `vi.mock` factory, with per-test assignment. Avoids both hoisting and ESM namespace non-configurable errors.
- **Files modified:** tests/lib/downloader.test.ts
- **Commit:** b57b422

**3. [Rule 1 - Bug] `vi.spyOn(axiosModule, 'default')` fails on ESM namespace**
- **Found during:** Task 3, second fix attempt
- **Issue:** `vi.spyOn` on ESM default export raises `Cannot redefine property: default` — ESM module namespace objects are frozen
- **Fix:** Switched from `vi.spyOn` approach to `vi.mock` factory with module-level resolver variable (same fix as #2)
- **Files modified:** tests/lib/downloader.test.ts
- **Commit:** b57b422

**4. [Rule 1 - Bug] `buildLocalPath` test used POSIX root `/music` on Windows**
- **Found during:** Task 3 GREEN phase
- **Issue:** `path.join('/music', 'Artist', ...)` on Windows produces `\music\Artist\...` — `startsWith('/music')` is false
- **Fix:** Changed `const destRoot = '/music'` to `join(tmpdir(), 'jms-buildpath-test')` to get a real OS-native absolute path
- **Files modified:** tests/lib/downloader.test.ts
- **Commit:** b57b422

**5. [Rule 1 - Bug] TypeScript TS2345 on `parseInt(response.headers['content-length'])`**
- **Found during:** Task 3 typecheck verification
- **Issue:** Axios `RawAxiosResponseHeaders['content-length']` is `string | number | boolean | string[] | AxiosHeaders`, not `string` — `parseInt` requires `string`
- **Fix:** Wrapped with `String(...)` before `parseInt`
- **Files modified:** src/main/lib/downloader.ts
- **Commit:** 347c8e3

## Known Stubs

None — all exported functions are fully implemented.

## Threat Surface Scan

All threats in the plan's `<threat_model>` are mitigated as implemented:
- T-03-01-01: `sanitizePathSegment` applied per-segment in `buildLocalPath` (artist, album, filename separately)
- T-03-01-02: `safeReadJson` with `EMPTY_MANIFEST` fallback in `readManifest`
- T-03-01-03: `.part` renamed only on `pipeline` success; deleted in catch block
- T-03-01-04: `join(destRoot, sanitized(artist), sanitized(album), sanitized(file))` — no path traversal possible

No new threat surface beyond the plan's threat model.

## Self-Check: PASSED

Files exist:
- src/main/lib/manifest.ts: FOUND
- src/main/lib/m3u8.ts: FOUND
- src/main/lib/downloader.ts: FOUND
- tests/lib/manifest.test.ts: FOUND
- tests/lib/m3u8.test.ts: FOUND
- tests/lib/downloader.test.ts: FOUND

Commits exist: 24be38a, b844eff, 810e395, 4800ff3, b57b422, 347c8e3 — all verified in git log
