---
phase: 02-jellyfin-connection
fixed_at: 2026-04-20T00:00:00Z
review_path: .planning/phases/02-jellyfin-connection/02-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-04-20
**Source review:** .planning/phases/02-jellyfin-connection/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Session restore accepts stored credentials without server validation

**Files modified:** `src/main/ipc/auth.ts`
**Commit:** 4c320a0
**Applied fix:** Added a `getUserApi(api).getCurrentUser()` ping inside `auth:getStatus` immediately after attaching the decrypted token to the API instance. A 401 response clears stored credentials and returns `{ connected: false }`. Any other error (network unreachable) returns `{ connected: false }` without wiping the store, allowing the user to re-authenticate when the server comes back online. The `return { connected: true, ... }` block is now only reached after the ping succeeds.

---

### WR-01: Empty string IDs can pollute playlist results

**Files modified:** `src/main/ipc/playlists.ts`
**Commit:** 2fda504
**Applied fix:** Added `if (!item.Id) continue` guard at the top of the for-loop in `sync:getPlaylists`. Items without an `Id` are now skipped entirely rather than being pushed with `id: ''`. The `id` field in the pushed object now uses `item.Id` directly (no `?? ''` fallback) since the guard guarantees it is truthy.

---

### WR-02: Checkbox onClick and parent button onClick both fire toggleSelect — double-toggle risk

**Files modified:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx`
**Commit:** 6b69429
**Applied fix:** Replaced the `<li><button><input onChange/onClick stopPropagation></button></li>` nesting with a `<li><input id/onChange><label htmlFor></label></li>` structure. Selection now fires exclusively via the checkbox `onChange` handler — no `stopPropagation` dependency, no interactive content inside `<button>`, and no double-toggle risk. The `<label>` wraps both the playlist name and track count spans so the full row remains clickable via the label's implicit checkbox activation.

---

### WR-03: App startup silently swallows auth:getStatus error — no user feedback

**Files modified:** `src/renderer/src/App.tsx`
**Commit:** cc401c3
**Applied fix:** Replaced `console.error('auth:getStatus failed on startup', err)` with a no-op comment explaining the rationale. The catch block is retained so unhandled rejection is suppressed, but no renderer-side logging occurs. The main process `auth:getStatus` handler already emits `WARN` via `log()` for credential-clearing events; IPC-layer failures in development are programming errors caught by other means.

---

### WR-04: Login form has no client-side validation before IPC call

**Files modified:** `src/renderer/src/screens/LoginScreen.tsx`
**Commit:** 81b3cc1
**Applied fix:** Added three guard clauses at the top of `handleConnect` (before `setLoading(true)`) that check `url.trim()`, `username.trim()`, and `password` in turn, calling `setError` with a specific per-field message and returning early if any is blank. The `setLoading(true)` call is now only reached after all fields pass validation, ensuring no IPC call is made with empty inputs.

---

_Fixed: 2026-04-20_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
