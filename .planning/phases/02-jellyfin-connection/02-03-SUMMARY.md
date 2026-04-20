---
phase: 02-jellyfin-connection
plan: 03
subsystem: renderer-auth
tags: [zustand, react, tailwind, ipc, screen-router, login-form]

# Dependency graph
requires:
  - phase: 02-02
    provides: auth:login, auth:logout, auth:getStatus IPC handlers; AuthResult with displayName/linuxPlaintextWarning

provides:
  - "useAuthStore — Zustand store with authenticated/userId/serverName/displayName/linuxPlaintextWarning; no raw token"
  - "LoginScreen — server URL + credentials form; single auth:login IPC call; inline error display"
  - "App.tsx — two-screen auth router; auth:getStatus hydration on mount; Phase 1 DevPanel removed"
  - "PlaylistBrowserScreen — placeholder stub for plan 02-04"
  - "ipc-types.ts getStatus() return type extended with displayName/userId/linuxPlaintextWarning"

affects: [02-04-playlist-browser, 03-sync-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zustand create<T>()() double-parentheses pattern for TypeScript generic inference (Zustand 5)"
    - "Screen router pattern: authenticated ternary in App.tsx root; auth state hydrated via IPC on mount"
    - "Inline error display: error state set from caught Error.message; fields stay populated (no clear on error)"

key-files:
  created:
    - "src/renderer/src/store/authStore.ts — Zustand useAuthStore; setAuthenticated/clearAuth actions; no raw token"
    - "src/renderer/src/screens/LoginScreen.tsx — login form with ping+auth IPC, exact UI-SPEC classes and copy"
    - "src/renderer/src/screens/PlaylistBrowserScreen.tsx — temporary placeholder for plan 02-04"
  modified:
    - "src/renderer/src/App.tsx — replaced Phase 1 DevPanel with two-screen auth router"
    - "shared/ipc-types.ts — getStatus() return type extended with displayName/userId/linuxPlaintextWarning"

key-decisions:
  - "accessToken excluded from renderer state by design — Pick<AuthResult> type enforces this at compile time"
  - "getStatus() return type updated in ipc-types.ts to match what the main-process handler already returns"
  - "reachableText state retained in LoginScreen for future use (ping success banner) even though current IPC does ping+auth atomically"

# Metrics
duration: ~3min
completed: 2026-04-20
---

# Phase 2 Plan 03: Auth Store, Login Screen, and App Router Summary

**Zustand auth store with no raw token, LoginScreen with exact UI-SPEC Tailwind classes, and App.tsx two-screen router with session restore on mount**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-04-20
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Created useAuthStore Zustand store; authenticated/userId/serverName/displayName/linuxPlaintextWarning; no raw accessToken in renderer
- Created LoginScreen with exact copy strings and Tailwind classes from 02-UI-SPEC.md; single auth:login IPC call; inline error display; fields stay populated on error
- Replaced Phase 1 DevPanel in App.tsx with two-screen auth router; auth:getStatus called on mount for session restore
- Created PlaylistBrowserScreen placeholder to allow compilation ahead of plan 02-04
- Extended getStatus() return type in ipc-types.ts to include displayName/userId/linuxPlaintextWarning (main-process handler already returns these)
- npx tsc --noEmit and npm run build both exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zustand auth store** - `5afd78b` (feat)
2. **Task 2: Create LoginScreen component** - `f64792b` (feat)
3. **Task 3: Update App.tsx screen router** - `3e34a23` (feat)

## Files Created/Modified

- `src/renderer/src/store/authStore.ts` — useAuthStore with setAuthenticated/clearAuth; no raw token stored
- `src/renderer/src/screens/LoginScreen.tsx` — Login form; auth:login IPC wiring; exact UI-SPEC classes/copy
- `src/renderer/src/screens/PlaylistBrowserScreen.tsx` — Temporary placeholder (full impl in plan 02-04)
- `src/renderer/src/App.tsx` — Two-screen router on authenticated state; auth:getStatus on mount; DevPanel removed
- `shared/ipc-types.ts` — getStatus() return type extended with displayName/userId/linuxPlaintextWarning

## Decisions Made

- **No raw accessToken in renderer:** authStore uses `Pick<AuthResult, 'userId' | 'serverName' | 'displayName' | 'linuxPlaintextWarning'>` — the accessToken field is structurally excluded by the type; enforced at compile time (T-02-03-01 mitigated)
- **ipc-types.ts getStatus update:** Main-process auth handler already returned displayName/userId/linuxPlaintextWarning but the type contract only declared `connected` and `serverName`. Updated the type to match reality so App.tsx can use these fields without type errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Extended ipc-types.ts getStatus() return type**
- **Found during:** Task 3
- **Issue:** ipc-types.ts declared `getStatus(): Promise<{ connected: boolean; serverName?: string }>` but the plan's App.tsx code uses `status.displayName`, `status.userId`, and `status.linuxPlaintextWarning`. The main-process handler already returns these fields; only the type contract was missing them.
- **Fix:** Extended the return type in ipc-types.ts to include all fields the handler returns
- **Files modified:** `shared/ipc-types.ts`
- **Committed in:** `3e34a23` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (type contract gap between implementation and declaration)
**Impact on plan:** Required for TypeScript to compile; no behavior change; main-process handler unchanged.

## Known Stubs

- `src/renderer/src/screens/PlaylistBrowserScreen.tsx` — Intentional placeholder; displays static text "Playlist Browser — coming in plan 04". Will be replaced by full implementation in plan 02-04.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced beyond what is in the plan's threat model. All four STRIDE threats addressed as designed:
- T-02-03-01: accessToken excluded from authStore via Pick<AuthResult> type constraint
- T-02-03-02: Server URL validation delegated to main-process ping (accepted per plan)
- T-02-03-03: getStatus failure wrapped in .catch() — falls through to LoginScreen
- T-02-03-04: Password show/hide toggle is user-initiated; no logging of values

## Self-Check: PASSED

- `src/renderer/src/store/authStore.ts` — EXISTS
- `src/renderer/src/screens/LoginScreen.tsx` — EXISTS
- `src/renderer/src/screens/PlaylistBrowserScreen.tsx` — EXISTS
- `src/renderer/src/App.tsx` — UPDATED (contains `authenticated ? <PlaylistBrowserScreen`)
- `shared/ipc-types.ts` — UPDATED (getStatus return type extended)
- Commits 5afd78b, f64792b, 3e34a23 — all present in git log
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS

---
*Phase: 02-jellyfin-connection*
*Completed: 2026-04-20*
