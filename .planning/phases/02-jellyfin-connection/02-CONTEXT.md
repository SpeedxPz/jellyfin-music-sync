# Phase 2: Jellyfin Connection - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can authenticate against a Jellyfin server, browse their playlists with track counts, select multiple playlists for sync, and their session persists across app restarts. This phase delivers real, shippable login and playlist browser screens — not a dev panel. Phase 3 adds the sync engine; Phase 4 adds progress display and other feedback on top.

</domain>

<decisions>
## Implementation Decisions

### Token Storage — Linux safeStorage Fallback

- **D-AUTH-LINUX:** On Linux where `safeStorage.isEncryptionAvailable()` returns `false` (no libsecret/kwallet), fall back to storing the auth token as plaintext in the electron-conf userData JSON file. Show a persistent in-app warning banner informing the user that secure storage is unavailable and their token is stored in plaintext. Do not hard-fail or refuse to log in. Graceful degradation over security-first blocking.
- **D-AUTH-STORAGE:** On Windows and Linux (when encryption is available), store token via `safeStorage.encryptString()` → persist the encrypted Buffer (base64-encoded) in electron-conf. On login, load from electron-conf, decrypt with `safeStorage.decryptString()`, attach to Jellyfin SDK session.

### UI Scope

- **D-UI-SCOPE:** Build real, shippable login and playlist browser screens in Phase 2. Not a dev panel. Phase 4 wires live progress, cancel, and post-sync summary on top — it should not need to rework auth or library screens.
- **D-UI-LAYOUT:** Two-screen model: Login screen (shown when not authenticated) → Playlist browser screen (shown when authenticated). Navigation between them is driven by auth state.
- **D-UI-LOGOUT:** Logout button accessible from the playlist browser screen. Clears stored credentials and revokes the server session (calls Jellyfin `/Sessions/Logout`), then returns to the login screen.

### Playlist Size Estimation

- **D-SIZE-EST:** Show track count only next to each playlist. No size-in-MB display — accurate size requires O(N) API calls (one MediaSources fetch per track), which is too slow for a page-load operation. Track count is available directly from the playlist API response at zero extra cost.
- **D-LIB02-DEFER:** LIB-02 ("estimated total download size per playlist") is explicitly deferred. Track count satisfies the user's need to gauge relative playlist size before syncing. LIB-02 may be revisited in a future version.

### Server Validation + Error UX

- **D-SERVER-VALIDATE:** Before attempting login, ping `GET /System/Info/Public` on the server URL. This endpoint requires no authentication and returns Jellyfin server info if the URL is correct.
  - If request times out or ECONNREFUSED → show: "Could not reach server. Check the URL and try again."
  - If request succeeds but response is not a Jellyfin server → show: "URL reached but not a Jellyfin server. Is the URL correct?"
  - If reachable → proceed with login. Show server name/version from the Info response as confirmation.
  - If login fails (wrong credentials) → show: "Login failed. Check your username and password."
- **D-ERROR-DISPLAY:** Errors display inline below the Connect button (not a modal, not a toast). Input fields remain populated so the user can correct and retry without re-entering everything.

### Playlist Filtering

- **D-FILTER:** Client-side filter by playlist name. No server-side search — filter applied to the already-fetched playlist list in React state. Case-insensitive substring match. Filter input appears above the playlist list.

### Jellyfin API

- **D-API-PAGINATION:** Always paginate playlist item fetches with `startIndex` + `limit=500` loop. The default Jellyfin cap is 100 items — large playlists will be silently truncated without pagination. (Already noted in STATE.md blockers.)
- **D-API-CLIENT:** Use `@jellyfin/sdk 0.13.0` (already installed). Create the Jellyfin API instance in the main process; do not expose the SDK or raw HTTP to the renderer.

### Claude's Discretion

- Exact Tailwind styling, spacing, and color choices (follow established Phase 1 patterns)
- Password input show/hide toggle (include if straightforward, skip if complex)
- Loading states (spinner placement and text)
- Empty playlist list state copy

</decisions>

<specifics>
## Specific Ideas

- Login screen layout (from discussion): Server URL input, Username input, Password input, Connect button — stacked vertically. After successful reachability check, show "✓ Reachable: Jellyfin X.Y.Z" before proceeding with login.
- Playlist browser (from discussion): Checkbox per playlist, playlist name, track count. Multi-select with a Sync button. Filter input above the list.
- The app should feel like a real tool from Phase 2 onward — not a prototype.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — AUTH-01, AUTH-02, AUTH-03, AUTH-04 (auth), LIB-01, LIB-03, LIB-04 (library browsing); LIB-02 explicitly deferred per D-LIB02-DEFER above

### Architecture + IPC Contract
- `shared/ipc-types.ts` — Full IPC surface including `AuthResult`, `SyncOptions`; Phase 2 replaces auth stub channels with real implementations
- `src/main/ipc/stubs.ts` — Channels to replace: `auth:login`, `auth:logout`, `auth:getStatus`, `sync:getPlaylists`
- `CLAUDE.md` — Architecture rules (all I/O in main process, contextIsolation enforced, typed IPC via contextBridge)

### Phase 1 Foundation (existing code to extend)
- `src/main/lib/store.ts` — electron-conf store; Phase 2 adds token persistence fields
- `src/main/lib/logger.ts` — Existing logger; Phase 2 handlers use `log()` for auth events
- `src/main/index.ts` — App entry point; Phase 2 IPC handlers registered here alongside settings handlers

### Roadmap
- `.planning/ROADMAP.md` §Phase 2 — Goal, success criteria, and requirements for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/lib/store.ts` — electron-conf Conf instance; Phase 2 extends the Settings interface in `shared/ipc-types.ts` to add `jellyfinUrl`, `jellyfinUserId`, and `encryptedToken` fields (or stores token in a separate conf key)
- `src/main/lib/logger.ts` — `log(level, message)` available for auth events (login success, login failure, logout)
- `src/preload/index.ts` — Already exposes `window.electronAPI.auth.*` and `window.electronAPI.sync.getPlaylists()`; Phase 2 replaces stub handlers with real ones in main process — preload does NOT need to change

### Established Patterns
- All I/O in main process: Jellyfin SDK calls, safeStorage encryption/decryption, and HTTP requests all go in `src/main/ipc/auth.ts` and `src/main/ipc/playlists.ts`
- IPC handler registration: follow `registerSettingsHandlers()` pattern — create `registerAuthHandlers()` and `registerPlaylistHandlers()`, call both from `app.whenReady()` in `src/main/index.ts`
- electron-conf import: must use `'electron-conf/main'` (not bare `'electron-conf'`) — CJS main process requirement

### Integration Points
- `src/main/index.ts` — Add `registerAuthHandlers()` and `registerPlaylistHandlers()` calls alongside existing `registerSettingsHandlers()` and `registerStubs()`; remove stub registrations for replaced channels
- `src/renderer/src/App.tsx` — Replace DevPanel with real Login and PlaylistBrowser screens; auth state drives which screen renders
- `shared/ipc-types.ts` — `AuthResult` interface must carry enough data for the renderer to display server name, user display name, and handle the Linux plaintext-token warning flag

</code_context>

<deferred>
## Deferred Ideas

- **LIB-02 (playlist size in MB)** — Requires O(N) MediaSources API calls per playlist; deferred to a future version. Track count shown instead.
- **Multiple Jellyfin server support** — Out of scope per REQUIREMENTS.md; one server per session.
- **Token refresh / session expiry handling** — If the token expires between sessions, re-authentication is needed; the exact UX for this (silent re-auth vs. forced logout) is a Phase 2 stretch goal if straightforward, otherwise deferred.

</deferred>

---

*Phase: 02-jellyfin-connection*
*Context gathered: 2026-04-20*
