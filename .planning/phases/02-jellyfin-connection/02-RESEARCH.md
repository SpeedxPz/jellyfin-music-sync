# Phase 2: Jellyfin Connection — Research

**Researched:** 2026-04-20
**Domain:** Jellyfin TypeScript SDK, Electron safeStorage, React/Zustand auth state
**Confidence:** HIGH (core SDK, Electron APIs) / MEDIUM (playlist track-count field)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-AUTH-STORAGE:** On Windows and Linux (when encryption is available), store token via `safeStorage.encryptString()` → persist the encrypted Buffer (base64-encoded) in electron-conf. On login, load from electron-conf, decrypt with `safeStorage.decryptString()`, attach to Jellyfin SDK session.
- **D-AUTH-LINUX:** On Linux where `safeStorage.isEncryptionAvailable()` returns `false`, fall back to storing the auth token as plaintext in the electron-conf userData JSON file. Show a persistent in-app warning banner. Do not hard-fail or refuse to log in.
- **D-UI-SCOPE:** Build real, shippable login and playlist browser screens in Phase 2. Not a dev panel.
- **D-UI-LAYOUT:** Two-screen model: Login screen (not authenticated) → Playlist browser screen (authenticated). Navigation driven by auth state.
- **D-UI-LOGOUT:** Logout button in playlist browser. Clears stored credentials and calls Jellyfin `/Sessions/Logout` (via `getSessionApi(api).reportSessionEnded()`), then returns to Login screen.
- **D-SERVER-VALIDATE:** Ping `GET /System/Info/Public` before login. Three error variants: unreachable, non-Jellyfin, wrong credentials. Errors inline below Connect button; fields stay populated.
- **D-API-PAGINATION:** Always paginate playlist item fetches with `startIndex` + `limit=500` loop.
- **D-API-CLIENT:** Use `@jellyfin/sdk 0.13.0` in main process only.
- **D-SIZE-EST:** Track count only — no MB estimate.
- **D-FILTER:** Client-side substring filter on playlist names (case-insensitive, React state).
- **D-ERROR-DISPLAY:** Errors display inline below Connect button. Not a modal, not a toast.

### Claude's Discretion

- Exact Tailwind styling, spacing, and color choices (follow Phase 1 patterns)
- Password input show/hide toggle (include if straightforward)
- Loading states (spinner placement and text)
- Empty playlist list state copy

### Deferred Ideas (OUT OF SCOPE)

- **LIB-02** (playlist size in MB) — explicitly deferred; O(N) API calls required.
- Multiple Jellyfin server support — out of scope.
- Token refresh / session expiry handling — Phase 2 stretch goal at most.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can enter a Jellyfin server URL and log in with username and password | SDK `getUserApi().authenticateUserByName()` + IPC `auth:login` handler |
| AUTH-02 | App validates server URL is reachable before attempting login | `getSystemApi(api).getPublicSystemInfo()` ping pattern |
| AUTH-03 | App persists the auth token between restarts using secure storage | `safeStorage.encryptString()` → base64 in electron-conf; Linux plaintext fallback |
| AUTH-04 | User can log out, clearing stored credentials and revoking server session | `getSessionApi(api).reportSessionEnded()` + clear electron-conf fields |
| LIB-01 | User can view all their Jellyfin playlists with track count displayed | `getItemsApi(api).getItems({ includeItemTypes: [BaseItemKind.Playlist], recursive: true })` with `ChildCount` field |
| LIB-03 | User can select multiple playlists to sync in a single run | Zustand selection state in renderer; Sync button disabled when zero selected |
| LIB-04 | User can filter the playlist list by name | Client-side substring filter in React state — no API involvement |
</phase_requirements>

---

## Summary

Phase 2 adds Jellyfin authentication and playlist browsing to the Electron app. All HTTP work lives in the main process using `@jellyfin/sdk 0.13.0`. The renderer is a two-screen React app (Login / Playlist Browser) driven by Zustand auth state, communicating with main only through the existing typed IPC surface.

The SDK is ESM-only (`"type": "module"`) while the current project has no `"type"` field in `package.json` (defaults to CJS). The electron-vite build must exclude `@jellyfin/sdk` from externalization so Vite bundles it as CJS for the main process. This is the single most critical build configuration change in Phase 2.

Electron's `safeStorage` API is straightforward: encrypt on save, decrypt on load, check `isEncryptionAvailable()` after `app.whenReady()`. On Linux with no keyring, `isEncryptionAvailable()` returns `false` (or the backend is `basic_text`) — store plaintext and surface a warning banner.

**Primary recommendation:** Install `@jellyfin/sdk` and `zustand`, configure `electron.vite.config.ts` to exclude `@jellyfin/sdk` from externalization, implement `registerAuthHandlers` and `registerPlaylistHandlers` in main, then build Login and PlaylistBrowser React screens driven by a Zustand store.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP calls to Jellyfin server | Main process (Node.js) | — | CLAUDE.md: all I/O in main process |
| safeStorage encrypt/decrypt | Main process | — | `safeStorage` is Electron main-only API |
| electron-conf token persistence | Main process | — | electron-conf requires `'electron-conf/main'` import |
| Auth state (logged-in/out) | Renderer (Zustand) | — | UI navigation is renderer concern; no raw token exposed |
| Playlist list state + filter | Renderer (Zustand) | — | Client-side filter; data arrives via IPC result |
| IPC bridge | Preload | — | contextBridge already exposes all needed channels; NO CHANGES to preload.ts |
| Login screen UI | Renderer (React) | — | Two-screen navigation driven by Zustand auth state |
| Playlist browser UI | Renderer (React) | — | Checkbox selection, filter input, Sync button |

---

## Standard Stack

### Core (already in package.json as devDependencies or dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@jellyfin/sdk` | 0.13.0 [VERIFIED: npm registry] | Typed Jellyfin REST client | Official SDK; generates typed API classes from OpenAPI spec |
| `electron` | ^39.2.6 (installed: 41.2.1) [VERIFIED: npm view] | Desktop runtime | Project foundation |
| `electron-conf` | ^1.3.0 [VERIFIED: package.json] | Persistent settings store | Already used in Phase 1 for settings |
| `zustand` | 5.0.12 (latest) [VERIFIED: npm registry] | Renderer auth + playlist state | Minimal store; works without Provider wrap |
| `react` | ^19.2.1 [VERIFIED: package.json] | UI rendering | Already used |
| `tailwindcss` | ^4.2.2 [VERIFIED: package.json] | Styling | Already used |
| `vitest` | ^3.1.0 [VERIFIED: package.json] | Unit testing | Already configured |

### New dependencies to install
```bash
npm install @jellyfin/sdk zustand
```

Note: `@jellyfin/sdk` 0.13.0 is current latest stable. `zustand` 5.0.12 is current latest. [VERIFIED: npm registry]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand | React Context + useState | Context requires Provider wrap, causes full re-renders; Zustand is lighter for small auth state |
| `getItemsApi` for playlist list | `getPlaylistsApi.getPlaylists()` | `getPlaylists()` does not exist; playlists must be fetched via `getItemsApi` with `includeItemTypes: [BaseItemKind.Playlist]` |
| `safeStorage.encryptString` (sync) | `encryptStringAsync` (async) | Async API preferred per Electron docs (non-blocking, supports key rotation) — use async if available in Electron 39 build; sync is safe fallback |

---

## Architecture Patterns

### System Architecture Diagram

```
Renderer (React)                Preload               Main Process (Node.js)
────────────────                ───────               ──────────────────────
LoginScreen                     contextBridge         registerAuthHandlers()
  │ user submits form            │                      │
  │──ipcRenderer.invoke──────────│──────────────────────│ auth:login
  │                              │                      │  1. createApi(url)
  │                              │                      │  2. getSystemApi → getPublicSystemInfo()
  │                              │                      │  3. getUserApi → authenticateUserByName()
  │                              │                      │  4. safeStorage.encryptString(token)
  │                              │                      │  5. store.set({ encryptedToken, userId, serverUrl })
  │                              │                      │  6. return AuthResult
  │◄─────────────────────────────│◄─────────────────────│
  │ set Zustand auth state       │                      │
  │                              │                      │
PlaylistBrowserScreen            │                      │
  │ mounts → fetch playlists     │                      │
  │──ipcRenderer.invoke──────────│──────────────────────│ sync:getPlaylists
  │                              │                      │  loop: getItemsApi(api).getItems(...)
  │                              │                      │  startIndex += limit until all fetched
  │◄─────────────────────────────│◄─────────────────────│ return { id, name, trackCount }[]
  │                              │                      │
  │ user clicks Log out          │                      │
  │──ipcRenderer.invoke──────────│──────────────────────│ auth:logout
  │                              │                      │  getSessionApi(api).reportSessionEnded()
  │                              │                      │  store.delete(encryptedToken, userId, …)
  │◄─────────────────────────────│◄─────────────────────│
  │ clear Zustand auth state     │                      │
  │                              │                      │
App startup                      │                      │
  │──ipcRenderer.invoke──────────│──────────────────────│ auth:getStatus
  │                              │                      │  load token from store, decrypt
  │                              │                      │  if valid → return { connected: true, serverName }
  │◄─────────────────────────────│◄─────────────────────│
  │ route to correct screen      │                      │
```

### Recommended Project Structure

```
src/
├── main/
│   ├── ipc/
│   │   ├── settings.ts       # Phase 1 — unchanged
│   │   ├── stubs.ts          # Remove auth + getPlaylists stubs once handlers registered
│   │   ├── auth.ts           # NEW: registerAuthHandlers() — auth:login, auth:logout, auth:getStatus
│   │   └── playlists.ts      # NEW: registerPlaylistHandlers() — sync:getPlaylists
│   └── lib/
│       ├── store.ts          # Extend Settings interface to add token/user fields
│       ├── logger.ts         # Unchanged
│       └── jellyfin.ts       # NEW: module-level Api instance holder + helper (createJellyfinApi)
├── renderer/src/
│   ├── store/
│   │   └── auth.ts           # NEW: Zustand useAuthStore — { authenticated, userId, serverName, ... }
│   ├── screens/
│   │   ├── LoginScreen.tsx   # NEW
│   │   └── PlaylistBrowser.tsx # NEW
│   └── App.tsx               # Replace DevPanel with auth-driven screen router
shared/
└── ipc-types.ts              # Extend AuthResult: add linuxPlaintextWarning boolean
```

### Pattern 1: @jellyfin/sdk Initialization (Main Process)

**What:** Create a single Jellyfin SDK instance per session. Store the `Api` object in a module-level variable for reuse across handler calls.

**When to use:** Auth handler creates the Api; playlist handler reuses it; logout clears it.

```typescript
// src/main/lib/jellyfin.ts
// Source: typescript-sdk.jellyfin.org — Jellyfin class + createApi
import { Jellyfin } from '@jellyfin/sdk'
import { getSystemApi } from '@jellyfin/sdk/generated-client/api/system-api'
import { getUserApi } from '@jellyfin/sdk/generated-client/api/user-api'
import { getItemsApi } from '@jellyfin/sdk/generated-client/api/items-api'
import { getSessionApi } from '@jellyfin/sdk/generated-client/api/session-api'
import type { Api } from '@jellyfin/sdk'

const jellyfin = new Jellyfin({
  clientInfo: { name: 'Jellyfin Music Sync', version: '0.1.0' },
  deviceInfo: { name: 'Desktop', id: 'jellyfin-music-sync-desktop' },
})

// Module-level Api instance — null until successful login
let _api: Api | null = null

export function createJellyfinApi(baseUrl: string): Api {
  _api = jellyfin.createApi(baseUrl)
  return _api
}

export function getApi(): Api | null { return _api }
export function clearApi(): void { _api = null }
export { getSystemApi, getUserApi, getItemsApi, getSessionApi }
```

**Note on imports:** `@jellyfin/sdk` utility functions are located at subpaths like `@jellyfin/sdk/generated-client/api/system-api`. Verify exact subpath after install. [ASSUMED — path structure not confirmed against installed package]

### Pattern 2: Server Reachability Ping (AUTH-02)

```typescript
// Source: typescript-sdk.jellyfin.org — getSystemApi + getPublicSystemInfo
import { getSystemApi } from '@jellyfin/sdk/...'
import axios from 'axios'

async function pingServer(url: string): Promise<{ name: string; version: string } | null> {
  const api = createJellyfinApi(url)
  try {
    const response = await getSystemApi(api).getPublicSystemInfo()
    // PublicSystemInfo fields: ServerName, Version, Id, LocalAddress
    return {
      name: response.data.ServerName ?? 'Jellyfin',
      version: response.data.Version ?? '',
    }
  } catch (err) {
    // Network errors: err.code === 'ECONNREFUSED' or 'ETIMEDOUT' → unreachable
    // Non-Jellyfin server: HTTP 200 but response is not valid JSON / missing fields
    if (axios.isAxiosError(err)) {
      if (!err.response) {
        throw new Error('UNREACHABLE')  // ECONNREFUSED, ETIMEDOUT, DNS failure
      }
      throw new Error('NOT_JELLYFIN')   // HTTP response but not a Jellyfin server
    }
    throw err
  }
}
```

### Pattern 3: Authentication (AUTH-01)

```typescript
// Source: typescript-sdk.jellyfin.org — getUserApi authenticateUserByName
// AuthenticationResult fields: User (UserDto), AccessToken, ServerId
// UserDto fields: Id, Name, ServerId, ServerName (client-side only)

async function login(url: string, username: string, password: string) {
  const api = createJellyfinApi(url)
  const auth = await getUserApi(api).authenticateUserByName({
    authenticateUserByName: { Username: username, Pw: password },
  })
  // auth.data: AuthenticationResult
  // auth.data.AccessToken: string
  // auth.data.User?.Id: string (userId)
  // auth.data.ServerId: string
  // auth.data.User?.Name: string (display name)

  // Update the api instance with the received token
  api.update({ accessToken: auth.data.AccessToken! })

  return auth.data
}
```

**Error handling:** A 401 from Jellyfin throws an Axios error with `err.response.status === 401`. Distinguish from network errors via `axios.isAxiosError(err) && err.response` (has response = auth failure) vs `!err.response` (no response = network error). [VERIFIED: Axios error shape documented at axios/axios]

### Pattern 4: Token Persistence with safeStorage (AUTH-03)

```typescript
// Source: electronjs.org/docs/latest/api/safe-storage
// Must only be called after app.whenReady()

import { safeStorage } from 'electron'

// Encrypt and store
const encryptedBuffer = safeStorage.encryptString(plainToken)
const base64Token = encryptedBuffer.toString('base64')
store.set({ encryptedToken: base64Token })

// Decrypt on restore
const base64Token = store.get('encryptedToken')
const buffer = Buffer.from(base64Token, 'base64')
const plainToken = safeStorage.decryptString(buffer)

// Linux fallback check (after app.whenReady())
const canEncrypt = safeStorage.isEncryptionAvailable()
// Also check: safeStorage.getSelectedStorageBackend() === 'basic_text' → effectively plaintext
// D-AUTH-LINUX: if !canEncrypt → store plaintext, set linuxPlaintextWarning: true in AuthResult
```

**Timing:** `safeStorage` methods must only be called after `app.whenReady()` — calling them at module load time will crash. [VERIFIED: electronjs.org/docs/latest/api/safe-storage]

### Pattern 5: Playlist Fetching with Pagination (LIB-01)

```typescript
// Source: typescript-sdk.jellyfin.org — ItemsApi.getItems, BaseItemDto.ChildCount
// D-API-PAGINATION: always use startIndex + limit=500 loop

import { BaseItemKind } from '@jellyfin/sdk/generated-client'

async function fetchAllPlaylists(api: Api, userId: string) {
  const PAGE_SIZE = 500
  const all: Array<{ id: string; name: string; trackCount: number }> = []
  let startIndex = 0

  while (true) {
    const response = await getItemsApi(api).getItems({
      userId,
      includeItemTypes: [BaseItemKind.Playlist],
      recursive: true,
      startIndex,
      limit: PAGE_SIZE,
      sortBy: ['SortName'],
      sortOrder: ['Ascending'],
    })
    const items = response.data.Items ?? []
    for (const item of items) {
      all.push({
        id: item.Id!,
        name: item.Name ?? '(Unnamed)',
        // ChildCount is the track count for playlists
        // RecursiveItemCount is an alternative — ChildCount preferred for direct children
        trackCount: item.ChildCount ?? 0,
      })
    }
    if (items.length < PAGE_SIZE) break  // Last page
    startIndex += PAGE_SIZE
  }

  return all
}
```

**Track count field:** `BaseItemDto.ChildCount` is the standard field for direct child count on playlist items. `RecursiveItemCount` counts nested items and may overcount for nested structures. [MEDIUM confidence — ChildCount confirmed as existing field; which one Jellyfin uses for playlists confirmed by community reports of `"ChildCount": 11` in playlist responses]

### Pattern 6: Logout (AUTH-04)

```typescript
// Source: typescript-sdk.jellyfin.org — getSessionApi reportSessionEnded
async function logout(api: Api) {
  try {
    await getSessionApi(api).reportSessionEnded()
  } catch {
    // Best-effort — clear local credentials even if server call fails
  }
  // Clear stored token
  store.delete('encryptedToken')
  store.delete('userId')
  store.delete('serverUrl')
  clearApi()
}
```

### Pattern 7: Zustand Auth Store (Renderer)

```typescript
// Source: zustand docs + verified npm version 5.0.12
// Double-parentheses required for TypeScript inference with create<T>()()
import { create } from 'zustand'

interface AuthState {
  authenticated: boolean
  userId: string | null
  serverName: string | null
  displayName: string | null
  linuxPlaintextWarning: boolean
  setAuthenticated: (result: AuthResult & { linuxPlaintextWarning?: boolean }) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  authenticated: false,
  userId: null,
  serverName: null,
  displayName: null,
  linuxPlaintextWarning: false,
  setAuthenticated: (result) => set({
    authenticated: true,
    userId: result.userId,
    serverName: result.serverName,
    displayName: result.displayName,
    linuxPlaintextWarning: result.linuxPlaintextWarning ?? false,
  }),
  clearAuth: () => set({
    authenticated: false, userId: null, serverName: null,
    displayName: null, linuxPlaintextWarning: false,
  }),
}))
```

**No persist middleware:** Token lives in main process / electron-conf, not renderer. Renderer re-hydrates auth state via `auth:getStatus` IPC on app mount.

### Pattern 8: App.tsx Screen Router

```typescript
// src/renderer/src/App.tsx — replaces Phase 1 DevPanel
import { useEffect } from 'react'
import { useAuthStore } from './store/auth'
import LoginScreen from './screens/LoginScreen'
import PlaylistBrowser from './screens/PlaylistBrowser'

export default function App() {
  const { authenticated, setAuthenticated } = useAuthStore()

  useEffect(() => {
    // Restore session on startup
    window.electronAPI.auth.getStatus().then((status) => {
      if (status.connected) {
        // Minimal re-hydration — full AuthResult not needed here
        setAuthenticated({ userId: '', serverName: status.serverName ?? '', ... })
      }
    })
  }, [])

  return authenticated ? <PlaylistBrowser /> : <LoginScreen />
}
```

### Anti-Patterns to Avoid

- **Exposing the Jellyfin API instance to renderer:** Never pass the `Api` object through IPC. All SDK calls stay in main.
- **Calling safeStorage before app.ready:** Will throw an error. Always call inside `app.whenReady()` callbacks or IPC handlers (which only fire after ready).
- **Externalizing @jellyfin/sdk without bundling:** Since `@jellyfin/sdk` is ESM-only and the project has no `"type": "module"`, it will throw `ERR_REQUIRE_ESM` unless bundled. Add it to `externalizeDeps.exclude`.
- **Storing the decrypted token in Zustand:** The renderer should never hold the raw access token. Main process manages the token; renderer holds auth metadata (userId, serverName, displayName) from the AuthResult.
- **Using limit without startIndex loop:** Jellyfin's default cap is 100 items. Always use `limit=500` in a `startIndex` pagination loop.
- **Using `getPlaylists()` on PlaylistsApi:** This method does not exist. Use `getItemsApi(api).getItems({ includeItemTypes: [BaseItemKind.Playlist] })`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Typed Jellyfin REST client | Custom fetch wrapper | `@jellyfin/sdk` | Generated from OpenAPI spec; handles auth header, token update, cancellation |
| Electron secure storage | Custom file encryption | `safeStorage` (built-in Electron API) | OS keychain integration (Keychain/DPAPI/libsecret); no deps needed |
| Settings persistence | Custom JSON store | `electron-conf` (already installed) | Already handling settings; extend same store for auth fields |
| Renderer state management | Complex useState + prop drilling | Zustand 5 | Already in tech stack; minimal boilerplate for two-screen auth flow |
| Async HTTP error detection | Manual status code parsing | `axios.isAxiosError(err)` type guard | Separates network failures from HTTP error responses cleanly |

**Key insight:** The Jellyfin SDK's `api.update({ accessToken })` pattern means you never need to reconstruct the API instance after login — update the existing instance's token in-place.

---

## Critical Build Configuration Change

**@jellyfin/sdk is ESM-only.** The project has no `"type": "module"` in `package.json` (defaults to CJS). Without a config change, importing the SDK in main process will throw `ERR_REQUIRE_ESM` at runtime.

**Fix — `electron.vite.config.ts`:**

```typescript
export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['@jellyfin/sdk'],  // Bundle ESM-only SDK as CJS
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: true,  // Preload doesn't import SDK — unchanged
    },
  },
  // ...
})
```

[VERIFIED: electron-vite.org/guide/troubleshooting — `externalizeDeps.exclude` is the documented fix for ERR_REQUIRE_ESM]

**Alternative:** Add `"type": "module"` to `package.json` to enable ESM throughout (Electron 28+ supports it). However, this changes the entire project's module format and may require updating `electron-conf` imports and other CJS-specific patterns. Prefer `externalizeDeps.exclude` as the minimal-impact fix.

---

## IPC Contract — What Phase 2 Implements

Phase 2 replaces stubs for these channels (from `stubs.ts`):

| Channel | Handler | Returns | Notes |
|---------|---------|---------|-------|
| `auth:login` | `registerAuthHandlers` | `AuthResult` | Ping + login + encrypt + persist |
| `auth:logout` | `registerAuthHandlers` | `void` | reportSessionEnded + clear store |
| `auth:getStatus` | `registerAuthHandlers` | `{ connected: boolean; serverName?: string }` | Decrypt stored token, validate |
| `sync:getPlaylists` | `registerPlaylistHandlers` | `Array<{ id, name, trackCount }>` | Uses stored token from module-level Api |

**`AuthResult` type extension needed in `shared/ipc-types.ts`:**

The existing `AuthResult` interface is missing `displayName` and `linuxPlaintextWarning`. Add:
```typescript
export interface AuthResult {
  userId: string
  accessToken: string        // Keep for Phase 3 download auth
  serverId: string
  serverName: string         // From PublicSystemInfo.ServerName (ping step)
  displayName: string        // From AuthenticationResult.User.Name
  linuxPlaintextWarning: boolean  // true when safeStorage unavailable on Linux
}
```

**`Settings` store extension needed in `src/main/lib/store.ts`:**

Add auth-related fields persisted in electron-conf:
```typescript
export interface Settings {
  lastDestination: string
  concurrentDownloads: number
  // Phase 2 additions
  serverUrl: string          // default: ''
  userId: string             // default: ''
  encryptedToken: string     // base64-encoded encrypted token (or plaintext on Linux)
  displayName: string        // default: ''
  serverName: string         // default: ''
}
```

---

## Common Pitfalls

### Pitfall 1: ERR_REQUIRE_ESM from @jellyfin/sdk
**What goes wrong:** Main process crashes with `Error [ERR_REQUIRE_ESM]: require() of ES Module` at startup.
**Why it happens:** `@jellyfin/sdk` ships as ESM-only (`"type": "module"`). electron-vite externalizes all `node_modules` by default — the main process then tries to `require()` the module at runtime, which fails.
**How to avoid:** Add `@jellyfin/sdk` to `externalizeDeps.exclude` in `electron.vite.config.ts` so Vite bundles it as CJS.
**Warning signs:** Crash on import; `out/main/index.js` contains `require('@jellyfin/sdk')` rather than bundled code.

### Pitfall 2: safeStorage Called Before app.ready
**What goes wrong:** `safeStorage.encryptString()` throws `Error: safeStorage is not available before the ready event`.
**Why it happens:** `safeStorage` depends on Electron app state being fully initialized.
**How to avoid:** Only call safeStorage inside `ipcMain.handle()` callbacks (which only fire after the renderer loads, after app is ready) or inside `app.whenReady()` callbacks. Never call at module-load time.
**Warning signs:** Crash during main process startup before any IPC is invoked.

### Pitfall 3: ChildCount vs RecursiveItemCount for Track Count
**What goes wrong:** Track count is 0 or wrong for some playlists.
**Why it happens:** Jellyfin playlists can return `ChildCount: 0` if the `fields` parameter doesn't include the field, or if the API uses a different count field.
**How to avoid:** Verify `ChildCount` is populated in actual API response. If `ChildCount` is always 0, try `RecursiveItemCount`. Consider requesting `fields: ['ChildCount', 'RecursiveItemCount']` in getItems parameters.
**Warning signs:** All playlists show "0 tracks".

### Pitfall 4: Jellyfin Playlist Pagination with Private Playlists
**What goes wrong:** `limit` returns fewer items than expected even when `startIndex` loop is correct.
**Why it happens:** Jellyfin applies its row-level limit before filtering out private playlists from other users, so a page of 500 may contain fewer than 500 visible results even if more exist. [CITED: github.com/jellyfin/jellyfin/issues/14603]
**How to avoid:** Loop until `items.length === 0` (not `< PAGE_SIZE`), or check `response.data.TotalRecordCount` against accumulated count.
**Warning signs:** Paginated loop stops early; some playlists missing.

### Pitfall 5: auth:getStatus Without Stored Token
**What goes wrong:** App starts, calls `auth:getStatus`, tries to decrypt null/empty token, throws.
**Why it happens:** Fresh install or after logout — no token in store.
**How to avoid:** In `auth:getStatus` handler, check `store.get('encryptedToken')` is non-empty before attempting decrypt. Return `{ connected: false }` if no token.
**Warning signs:** Crash on fresh install; app immediately errors before Login screen renders.

### Pitfall 6: Stubs Not Removed When Real Handlers Registered
**What goes wrong:** `ipcMain.handle()` throws `Error: Attempted to register a second handler for 'auth:login'`.
**Why it happens:** `registerStubs()` already registered all Phase 2 channels; registering real handlers a second time on the same channel throws.
**How to avoid:** In `main/index.ts`, call `registerAuthHandlers()` and `registerPlaylistHandlers()` in place of (not alongside) the Phase 2 stubs. Either remove stub registration for those channels or call `ipcMain.removeHandler()` before registering real handlers. Cleanest: remove Phase 2 channels from `stubs.ts` in the same commit.
**Warning signs:** App throws on startup; IPC handler registration error in logs.

---

## Code Examples

### Full Authentication Flow (main process)

```typescript
// src/main/ipc/auth.ts
// Source: typescript-sdk.jellyfin.org, electronjs.org/docs/safe-storage

import { ipcMain } from 'electron'
import { safeStorage } from 'electron'
import { getSystemApi } from '@jellyfin/sdk/...'
import { getUserApi } from '@jellyfin/sdk/...'
import { getSessionApi } from '@jellyfin/sdk/...'
import { createJellyfinApi, getApi, clearApi } from '../lib/jellyfin'
import { store } from '../lib/store'
import { log } from '../lib/logger'
import type { AuthResult } from '../../../shared/ipc-types'
import axios from 'axios'

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_evt, url: string, username: string, password: string): Promise<AuthResult> => {
    // Step 1: Ping server (AUTH-02)
    const api = createJellyfinApi(url)
    let serverName = 'Jellyfin'
    let serverVersion = ''
    try {
      const sysInfo = await getSystemApi(api).getPublicSystemInfo()
      serverName = sysInfo.data.ServerName ?? 'Jellyfin'
      serverVersion = sysInfo.data.Version ?? ''
    } catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        throw new Error('Could not reach server. Check the URL and try again.')
      }
      throw new Error('URL reached but not a Jellyfin server. Is the URL correct?')
    }

    // Step 2: Authenticate (AUTH-01)
    let authData: any
    try {
      const resp = await getUserApi(api).authenticateUserByName({
        authenticateUserByName: { Username: username, Pw: password },
      })
      authData = resp.data
      api.update({ accessToken: authData.AccessToken })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        throw new Error('Login failed. Check your username and password.')
      }
      throw err
    }

    // Step 3: Persist token (AUTH-03)
    const token: string = authData.AccessToken
    const canEncrypt = safeStorage.isEncryptionAvailable()
    const linuxPlaintextWarning = !canEncrypt
    let storedToken: string
    if (canEncrypt) {
      storedToken = safeStorage.encryptString(token).toString('base64')
    } else {
      storedToken = token  // Linux fallback: plaintext
    }

    store.set({
      serverUrl: url,
      userId: authData.User?.Id ?? '',
      encryptedToken: storedToken,
      displayName: authData.User?.Name ?? '',
      serverName,
    })
    log('INFO', `Login success: user=${authData.User?.Name}, server=${serverName} ${serverVersion}`)

    return {
      userId: authData.User?.Id ?? '',
      accessToken: token,
      serverId: authData.ServerId ?? '',
      serverName,
      displayName: authData.User?.Name ?? '',
      linuxPlaintextWarning,
    }
  })

  ipcMain.handle('auth:getStatus', async (): Promise<{ connected: boolean; serverName?: string }> => {
    const encryptedToken = store.get('encryptedToken')
    if (!encryptedToken) return { connected: false }
    // Attempt to restore session
    try {
      const canEncrypt = safeStorage.isEncryptionAvailable()
      const token = canEncrypt
        ? safeStorage.decryptString(Buffer.from(encryptedToken, 'base64'))
        : encryptedToken  // plaintext fallback
      const serverUrl = store.get('serverUrl')
      const api = createJellyfinApi(serverUrl)
      api.update({ accessToken: token })
      // Optionally ping to confirm session still valid
      return { connected: true, serverName: store.get('serverName') }
    } catch {
      return { connected: false }
    }
  })

  ipcMain.handle('auth:logout', async (): Promise<void> => {
    const api = getApi()
    if (api) {
      try {
        await getSessionApi(api).reportSessionEnded()
      } catch {
        // Best-effort
      }
    }
    store.set({ serverUrl: '', userId: '', encryptedToken: '', displayName: '', serverName: '' })
    clearApi()
    log('INFO', 'User logged out')
  })
}
```

### getPlaylists with Pagination (main process)

```typescript
// src/main/ipc/playlists.ts
// Source: typescript-sdk.jellyfin.org — ItemsApi.getItems, BaseItemKind
import { ipcMain } from 'electron'
import { getItemsApi } from '@jellyfin/sdk/...'
import { BaseItemKind } from '@jellyfin/sdk/generated-client'
import { getApi } from '../lib/jellyfin'
import { store } from '../lib/store'

export function registerPlaylistHandlers(): void {
  ipcMain.handle('sync:getPlaylists', async (): Promise<Array<{ id: string; name: string; trackCount: number }>> => {
    const api = getApi()
    if (!api) throw new Error('Not authenticated')
    const userId = store.get('userId')
    const PAGE_SIZE = 500
    const results: Array<{ id: string; name: string; trackCount: number }> = []
    let startIndex = 0

    while (true) {
      const resp = await getItemsApi(api).getItems({
        userId,
        includeItemTypes: [BaseItemKind.Playlist],
        recursive: true,
        startIndex,
        limit: PAGE_SIZE,
        sortBy: ['SortName'],
        sortOrder: ['Ascending'],
      })
      const items = resp.data.Items ?? []
      for (const item of items) {
        results.push({
          id: item.Id!,
          name: item.Name ?? '(Unnamed)',
          trackCount: item.ChildCount ?? 0,
        })
      }
      if (items.length === 0) break
      startIndex += PAGE_SIZE
    }

    return results
  })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `jellyfin-apiclient` (deprecated npm package) | `@jellyfin/sdk` | ~2022 | Typed, OpenAPI-generated; old package unmaintained |
| Manual Authorization header construction | `Jellyfin` class + `createApi()` | With SDK launch | SDK handles header format automatically |
| `api.authenticateUserByName()` (convenience method on Api class) | `getUserApi(api).authenticateUserByName()` | SDK v0.8+ | Direct method deprecated; use generated API class method |
| `keytar` for secure storage | `safeStorage` (built-in Electron) | Electron ~15+ | No native addon; works cross-platform without rebuild |
| `electron-store` for settings | `electron-conf` | Electron-vite 5 project | electron-store v9+ is ESM-only (ERR_REQUIRE_ESM); electron-conf is the replacement |

**Deprecated/outdated:**
- `api.authenticateUserByName()` (direct on Api instance): Deprecated. Use `getUserApi(api).authenticateUserByName()`.
- `@thornbill/jellyfin-sdk`: Old pre-release name. Current package is `@jellyfin/sdk`.
- `keytar`: Replaced by `safeStorage` for Electron apps.

---

## Open Questions

1. **Exact @jellyfin/sdk import subpaths for API factory functions**
   - What we know: Helper functions like `getSystemApi`, `getUserApi`, `getItemsApi`, `getSessionApi` exist and accept the `Api` instance.
   - What's unclear: Exact import path — may be `@jellyfin/sdk/generated-client/api/system-api` or a re-export from the main `@jellyfin/sdk` package index.
   - Recommendation: After `npm install @jellyfin/sdk`, inspect `node_modules/@jellyfin/sdk/package.json` exports field and `lib/index.js` to find correct import paths. The docs show bare usage (`import { getSystemApi } from '@jellyfin/sdk'`) — confirm this works after bundling.

2. **ChildCount vs RecursiveItemCount for playlist track count**
   - What we know: `BaseItemDto.ChildCount` exists and community reports show `"ChildCount": 11` in playlist responses.
   - What's unclear: Whether Jellyfin always populates `ChildCount` without needing to request it in the `fields` parameter, or whether `RecursiveItemCount` is more reliable.
   - Recommendation: In Wave 0 / first test against a real Jellyfin server, log both values. If `ChildCount` is 0 when `RecursiveItemCount` is correct, add `fields: ['ChildCount']` to getItems request.

3. **`auth:getStatus` session validation depth**
   - What we know: Can restore token from store and reconstruct the Api instance.
   - What's unclear: Should `getStatus` make a live API call (e.g., ping `/System/Info/Public`) to validate the token, or trust the stored token and let the first playlist fetch fail if expired?
   - Recommendation: Start with trust-stored-token approach. If the token is invalid, `sync:getPlaylists` will throw an axios 401 — catch it in the renderer and send the user back to login. Full session-validation on startup is a stretch goal.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Main process | ✓ | v24.13.0 | — |
| npm | Package install | ✓ | bundled with Node | — |
| `@jellyfin/sdk` | Auth + playlists | NOT INSTALLED | 0.13.0 available | — |
| `zustand` | Renderer auth state | NOT INSTALLED | 5.0.12 available | — |
| `safeStorage` (Electron built-in) | Token encryption | ✓ (Electron 39+) | — | Linux: plaintext fallback per D-AUTH-LINUX |
| Real Jellyfin server | Integration testing | UNKNOWN | — | Manual testing required; no mock needed for unit tests |

**Missing dependencies requiring install:**
- `@jellyfin/sdk` and `zustand` must be installed before any Phase 2 code can be written.
- `npm install @jellyfin/sdk zustand`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `getSystemApi`, `getUserApi`, etc. can be imported from `@jellyfin/sdk` directly (re-exported from main package index) | Code Examples | Import paths would need to reference submodule paths like `@jellyfin/sdk/generated-client/api/system-api` — confirm after install |
| A2 | `BaseItemKind.Playlist` is the correct enum value to filter playlists from `getItems` | Pattern 5 | Wrong enum value returns no results; verify against installed package's `BaseItemKind` enum |
| A3 | `api.update({ accessToken })` is the correct way to attach the token after login (not reconstructing a new Api) | Pattern 3 | If `update()` doesn't propagate to API helpers correctly, would need to recreate the Api with `createApi(url, token)` |
| A4 | `ChildCount` is reliably populated for playlist items without needing to specify it in the `fields` param | Pattern 5, Pitfall 3 | Track counts would show 0; fix: add `fields: ['ChildCount']` to getItems request |
| A5 | `safeStorage.getSelectedStorageBackend()` is available in Electron 39+ | Pattern 4 | May be a newer API; fallback: use `isEncryptionAvailable()` only |

---

## Sources

### Primary (HIGH confidence)
- `https://typescript-sdk.jellyfin.org/` — SDK overview, createApi, getSystemApi, getUserApi, getSessionApi, AuthenticationResult, UserDto, PublicSystemInfo, PlaylistsApi, ItemsApi
- `https://typescript-sdk.jellyfin.org/classes/index.Api.html` — Api class methods: update(), authenticateUserByName (deprecated), accessToken getter
- `https://typescript-sdk.jellyfin.org/interfaces/generated-client.AuthenticationResult.html` — AuthenticationResult fields: User, AccessToken, ServerId
- `https://typescript-sdk.jellyfin.org/interfaces/generated-client.UserDto.html` — UserDto fields: Id, Name, ServerId, ServerName
- `https://typescript-sdk.jellyfin.org/interfaces/generated-client.PublicSystemInfo.html` — PublicSystemInfo fields: ServerName, Version, Id
- `https://www.electronjs.org/docs/latest/api/safe-storage` — isEncryptionAvailable, encryptString, decryptString, getSelectedStorageBackend, Linux behavior
- `https://electron-vite.org/guide/troubleshooting` — ERR_REQUIRE_ESM fix via externalizeDeps.exclude
- `https://electron-vite.org/guide/dependency-handling` — externalizeDeps.exclude configuration
- npm registry — @jellyfin/sdk@0.13.0 (latest), zustand@5.0.12 (latest) [VERIFIED]

### Secondary (MEDIUM confidence)
- `https://typescript-sdk.jellyfin.org/classes/generated-client.ItemsApi.html` — getItems parameters (userId, includeItemTypes, recursive, startIndex, limit)
- `https://typescript-sdk.jellyfin.org/interfaces/generated-client.BaseItemDto.html` — ChildCount, RecursiveItemCount fields
- `https://forum.jellyfin.org/t-howto-access-playlist-data-through-api` — `"ChildCount": 11` in playlist API responses confirmed by community

### Tertiary (LOW confidence — flag for validation)
- `https://github.com/jellyfin/jellyfin/issues/14603` — Playlist pagination count issue with private playlists affecting limit behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry verified; official docs confirmed
- SDK auth + system API patterns: HIGH — verified against official typescript-sdk.jellyfin.org docs
- Playlist track count field (ChildCount): MEDIUM — field exists in BaseItemDto docs; confirmed in forum but not tested against live server
- Import subpaths for SDK helpers: ASSUMED (A1) — pattern shown in docs, exact paths need post-install verification
- ESM/CJS bundling fix: HIGH — electron-vite docs explicitly document ERR_REQUIRE_ESM + externalizeDeps.exclude

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (SDK is stable; Electron APIs stable)
