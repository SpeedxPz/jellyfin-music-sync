---
phase: 02-jellyfin-connection
plan: 01
subsystem: auth
tags: [jellyfin-sdk, zustand, electron-vite, typescript, esm-cjs, safeStorage]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: electron-conf store, ipc-types.ts contract, logger.ts, electron-vite build setup

provides:
  - "@jellyfin/sdk and zustand installed as runtime dependencies"
  - "ESM bundling fix: @jellyfin/sdk excluded from externalization, bundled as CJS"
  - "AuthResult interface extended with displayName and linuxPlaintextWarning fields"
  - "Settings interface extended with serverUrl, userId, encryptedToken, displayName, serverName fields"
  - "store.ts schema and defaults extended with 5 new auth fields"
  - "src/main/lib/jellyfin.ts: module-level Jellyfin SDK wrapper with createJellyfinApi/getApi/clearApi and API helper re-exports"

affects: [02-02-auth-handlers, 02-03-playlists, 02-04-ui, 03-sync-engine]

# Tech tracking
tech-stack:
  added:
    - "@jellyfin/sdk 0.13.0 — official Jellyfin TypeScript REST client (ESM-only package)"
    - "zustand 5.0.12 — renderer auth and playlist state management"
  patterns:
    - "ESM-only packages excluded from electron-vite externalizeDeps so Vite bundles them as CJS"
    - "Module-level Api instance pattern: single _api variable managed via createJellyfinApi/getApi/clearApi"
    - "Schema as any cast to bypass ajv JSONSchemaType required constraint (D-01: no required array)"
    - "API helper re-exports from one module (jellyfin.ts) so handler files have a single import source"

key-files:
  created:
    - "src/main/lib/jellyfin.ts — Jellyfin SDK wrapper; exports createJellyfinApi, getApi, clearApi, getSystemApi, getUserApi, getItemsApi, getSessionApi"
  modified:
    - "electron.vite.config.ts — main.build.externalizeDeps changed from true to { exclude: ['@jellyfin/sdk'] }"
    - "shared/ipc-types.ts — AuthResult + Settings interfaces extended with auth fields"
    - "src/main/lib/store.ts — schema.properties and defaults extended with 5 new string fields"
    - "package.json — @jellyfin/sdk and zustand added to dependencies"

key-decisions:
  - "Use @jellyfin/sdk/lib/utils/api/* subpaths for API factory helpers (no exports map in package; files at lib/utils/api/system-api etc.)"
  - "Schema cast as any in store.ts to avoid ajv JSONSchemaType required error without violating D-01 (no required array)"

patterns-established:
  - "Pattern: All Jellyfin SDK imports in main process go through src/main/lib/jellyfin.ts — never construct Api directly in handler files"
  - "Pattern: externalizeDeps.exclude for ESM-only packages in electron-vite main build"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, LIB-01]

# Metrics
duration: 4min
completed: 2026-04-20
---

# Phase 2 Plan 01: SDK Install, ESM Fix, and Jellyfin Wrapper Summary

**@jellyfin/sdk bundled as CJS via electron-vite exclude, typed wrapper module with module-level Api instance, and extended Settings/AuthResult interfaces for auth persistence**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-20T05:35:44Z
- **Completed:** 2026-04-20T05:39:44Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Installed @jellyfin/sdk 0.13.0 and zustand 5.0.12 as runtime dependencies
- Fixed ERR_REQUIRE_ESM risk by excluding @jellyfin/sdk from electron-vite externalization (bundled as CJS inline)
- Extended AuthResult with displayName and linuxPlaintextWarning; Settings with 5 new auth persistence fields
- Created jellyfin.ts wrapper exporting all 7 required symbols; confirmed with npm run build exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and fix ESM build config** - `c78484c` (chore)
2. **Task 2: Extend shared types (AuthResult + Settings) and store.ts** - `e593c7d` (feat)
3. **Task 3: Create Jellyfin SDK wrapper module** - `bd22bfa` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/main/lib/jellyfin.ts` — Module-level Jellyfin SDK wrapper; createJellyfinApi/getApi/clearApi + API helper re-exports
- `electron.vite.config.ts` — ESM bundling fix: externalizeDeps changed from `true` to `{ exclude: ['@jellyfin/sdk'] }`
- `shared/ipc-types.ts` — AuthResult extended with displayName + linuxPlaintextWarning; Settings extended with 5 auth fields
- `src/main/lib/store.ts` — Schema and defaults extended with serverUrl, userId, encryptedToken, displayName, serverName
- `package.json` / `package-lock.json` — @jellyfin/sdk and zustand added to dependencies

## Decisions Made

- **@jellyfin/sdk subpath imports:** API factory helpers are at `@jellyfin/sdk/lib/utils/api/{name}-api` (no exports map in package.json; verified by file inspection and runtime node require test)
- **Schema as any cast:** Used `as any` on store.ts schema literal to bypass ajv `JSONSchemaType<T>` strict `required` requirement without violating D-01 (no `required` array to avoid init errors on fresh config)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing TS2322 type error in store.ts schema**
- **Found during:** Task 1 (build verification — npm run build runs typecheck first)
- **Issue:** store.ts schema object lacked `required` array which `JSONSchemaType<Settings>` enforces strictly via ajv types. Error was pre-existing before our changes (confirmed by git stash test). The build typecheck revealed it.
- **Fix:** Added `as any` cast to the schema object literal, bypassing ajv's strict type inference while preserving runtime validation behavior. Per D-01, no `required` array is added — defaults handle field presence.
- **Files modified:** `src/main/lib/store.ts`
- **Verification:** `npx tsc --noEmit` exits 0 for both tsconfig.node.json and tsconfig.web.json
- **Committed in:** `e593c7d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 pre-existing bug)
**Impact on plan:** Required fix for build to pass; no scope creep; consistent with D-01 decision.

## Issues Encountered

- npm run build runs typecheck before vite build — a pre-existing TS2322 error in store.ts (missing `required` in ajv schema type) was revealed. Fixed as Rule 1 deviation. The electron-vite build itself (bypassing typecheck) completed successfully, confirming the ESM fix worked before type errors were resolved.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All foundation types in place for auth handler implementation (02-02)
- jellyfin.ts wrapper ready; auth handlers import createJellyfinApi/getApi/clearApi from it
- Settings store has all 5 auth fields; auth handlers can store/restore session via store.set/store.get
- Zustand installed; renderer auth store (02-04) can import from 'zustand'
- No blockers

---
*Phase: 02-jellyfin-connection*
*Completed: 2026-04-20*
