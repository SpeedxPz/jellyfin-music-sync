---
phase: 02-jellyfin-connection
plan: 02
subsystem: auth
tags: [ipc-handlers, authentication, safeStorage, jellyfin-sdk, pagination]

# Dependency graph
requires:
  - phase: 02-01
    provides: jellyfin.ts wrapper (createJellyfinApi/getApi/clearApi + API helpers), extended Settings/AuthResult types, extended store.ts with 5 auth fields

provides:
  - "registerAuthHandlers — auth:login, auth:logout, auth:getStatus IPC handlers"
  - "registerPlaylistHandlers — sync:getPlaylists with startIndex pagination loop"
  - "stubs.ts cleaned: PHASE2_CHANNELS removed, sync:getPlaylists removed"
  - "index.ts wired: registerAuthHandlers() and registerPlaylistHandlers() called before registerStubs()"

affects: [02-03-login-screen, 02-04-playlist-browser, 03-sync-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "safeStorage.encryptString + base64 for token persistence; plaintext fallback on Linux with WARN log"
    - "startIndex pagination loop with limit=500; terminates on empty page (not items.length < PAGE_SIZE)"
    - "isAxiosError() type guard to distinguish network errors from HTTP errors without importing axios"
    - "Auth handler clears all 5 store fields on logout via single store.set({})"

key-files:
  created:
    - "src/main/ipc/auth.ts — registerAuthHandlers: auth:login (server ping + credential auth + token encrypt), auth:getStatus (session restore), auth:logout (reportSessionEnded + store clear)"
    - "src/main/ipc/playlists.ts — registerPlaylistHandlers: sync:getPlaylists with startIndex pagination, BaseItemKind.Playlist filter, ChildCount field request"
  modified:
    - "src/main/ipc/stubs.ts — removed PHASE2_CHANNELS array and sync:getPlaylists from PHASE3_CHANNELS; only sync:start remains"
    - "src/main/index.ts — added registerAuthHandlers() and registerPlaylistHandlers() imports and calls"

key-decisions:
  - "BaseItemKind imported from @jellyfin/sdk/lib/generated-client/models (verified via models/index.d.ts re-export)"
  - "api.accessToken = token used directly (property is publicly settable per Api class declaration)"
  - "Pagination terminates on items.length === 0, not items.length < PAGE_SIZE (Pitfall 4 — private playlists return fewer than PAGE_SIZE even when more pages exist)"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, LIB-01]

# Metrics
duration: 7min
completed: 2026-04-20
---

# Phase 2 Plan 02: Auth and Playlist IPC Handlers Summary

**Auth IPC handlers with server-ping validation, safeStorage token encryption, and paginated playlist fetch replacing Phase 2 stubs**

## Performance

- **Duration:** ~7 min
- **Completed:** 2026-04-20
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created auth.ts with three IPC handlers covering full auth lifecycle: server reachability ping, credential auth, encrypted token persistence, session restore, and session revocation
- Created playlists.ts with startIndex pagination loop terminating on empty page per Pitfall 4
- Cleaned stubs.ts: removed PHASE2_CHANNELS and sync:getPlaylists; only sync:start remains as Phase 3 stub
- Wired registerAuthHandlers() and registerPlaylistHandlers() into index.ts before registerStubs()
- npx tsc --noEmit and npm run build both exit 0 with no duplicate handler errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create auth.ts IPC handler** - `02c6cb3` (feat)
2. **Task 2: Create playlists.ts IPC handler** - `a90a79c` (feat)
3. **Task 3: Remove Phase 2 stubs and wire handlers into index.ts** - `391a4ae` (feat)

## Files Created/Modified

- `src/main/ipc/auth.ts` — Three IPC handlers: auth:login (ping + auth + encrypt), auth:getStatus (session restore), auth:logout (revoke + clear)
- `src/main/ipc/playlists.ts` — sync:getPlaylists with limit=500 startIndex loop; BaseItemKind.Playlist filter
- `src/main/ipc/stubs.ts` — PHASE2_CHANNELS removed; sync:getPlaylists removed; only sync:start remains
- `src/main/index.ts` — registerAuthHandlers() and registerPlaylistHandlers() added to app startup

## Decisions Made

- **BaseItemKind import path:** `@jellyfin/sdk/lib/generated-client/models` — verified via models/index.d.ts which re-exports all model types including base-item-kind
- **api.accessToken settability:** Confirmed publicly settable property in Api class declaration (not read-only); direct assignment used
- **Pagination termination:** `items.length === 0` (not `< PAGE_SIZE`) per Pitfall 4 — private playlists cause Jellyfin to return fewer items per page even when more pages remain

## Deviations from Plan

None — plan executed exactly as written. All three tasks completed without deviation. TypeScript and build verification passed on first attempt.

## Threat Surface Scan

All threats in the plan's threat model were mitigated as implemented:
- T-02-02-01: Server reachability ping via getPublicSystemInfo() before credentials sent
- T-02-02-02: safeStorage.encryptString() used when available; Linux plaintext surfaced via linuxPlaintextWarning
- T-02-02-03: accessToken included in AuthResult for Phase 3 download headers; not persisted in renderer
- T-02-02-05: sync:getPlaylists checks getApi() === null and userId before proceeding

No new security-relevant surface introduced beyond the threat model.

## Known Stubs

None in this plan's created files. stubs.ts retains sync:start as intentional Phase 3 stub.

## Self-Check: PASSED

- `src/main/ipc/auth.ts` — EXISTS
- `src/main/ipc/playlists.ts` — EXISTS
- Commits 02c6cb3, a90a79c, 391a4ae — all present in git log
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS

---
*Phase: 02-jellyfin-connection*
*Completed: 2026-04-20*
