---
phase: 02-jellyfin-connection
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - electron.vite.config.ts
  - shared/ipc-types.ts
  - src/main/lib/jellyfin.ts
  - src/main/lib/store.ts
  - src/main/ipc/auth.ts
  - src/main/ipc/playlists.ts
  - src/main/ipc/stubs.ts
  - src/main/index.ts
  - src/renderer/src/store/authStore.ts
  - src/renderer/src/screens/LoginScreen.tsx
  - src/renderer/src/screens/PlaylistBrowserScreen.tsx
  - src/renderer/src/App.tsx
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 2 delivers Jellyfin authentication (login, session restore, logout) and playlist listing. The architecture is sound: I/O is correctly confined to the main process, `contextIsolation: true` and `nodeIntegration: false` are enforced, IPC is typed via `contextBridge`, and token storage uses `safeStorage` with a documented plaintext fallback for Linux. The pagination loop in `playlists.ts` correctly follows the pitfall documentation (break on empty page, not `length < PAGE_SIZE`).

One critical issue was found: the session restore path in `auth:getStatus` creates a new API instance and attaches the decrypted token to it, but it does **not** validate the token against the server. This means a revoked or expired token is silently treated as a live session until the first actual API call fails — producing a confusing runtime error in the playlist browser rather than a clean redirect to the login screen.

Four warnings cover: empty-string IDs leaking into results, a double-trigger risk on the checkbox/button interaction, an unhandled error path in `App.tsx` startup, and missing input validation in the login form. Three info items cover a dead `reachableText` state variable, a `console.error` in renderer code, and a missing `autoAbort`/cleanup for the `useEffect` fetch in `PlaylistBrowserScreen`.

---

## Critical Issues

### CR-01: Session restore accepts stored credentials without server validation

**File:** `src/main/ipc/auth.ts:117-135`

**Issue:** `auth:getStatus` decrypts the stored token and reconstructs the API instance, but it never makes a network call to verify the token is still valid on the server. It immediately returns `{ connected: true }`. If the token has been revoked (user changed password, server admin revoked sessions, server was reinstalled), the renderer transitions to `PlaylistBrowserScreen`, the playlist fetch then fails with a 401, and the user sees a generic "Not authenticated" error with no path back to the login screen other than a manual logout.

The correct pattern is to perform a cheap authenticated ping (e.g., `getUserApi(api).getCurrentUser()`) inside `auth:getStatus` and fall through to `{ connected: false }` on a 401 response, clearing credentials as already done in the catch block.

**Fix:**
```typescript
// After: api.accessToken = token
try {
  // Cheap authenticated ping — validates token is still live on the server.
  await getUserApi(api).getCurrentUser()
} catch (err) {
  if (isAxiosError(err) && err.response?.status === 401) {
    log('WARN', 'auth:getStatus: stored token rejected by server (401) — clearing credentials')
    store.set({ serverUrl: '', userId: '', encryptedToken: '', displayName: '', serverName: '' })
    return { connected: false }
  }
  // Network unreachable: keep credentials, return connected: false without wiping store
  return { connected: false }
}
return {
  connected: true,
  serverName: store.get('serverName'),
  displayName: store.get('displayName'),
  userId: store.get('userId'),
  linuxPlaintextWarning: !canEncrypt,
}
```

---

## Warnings

### WR-01: Empty string IDs can pollute playlist results

**File:** `src/main/ipc/playlists.ts:43-49`

**Issue:** When `item.Id` or `item.Name` is `null` or `undefined`, the push assigns `id: ''` and `name: '(Unnamed)'`. An empty `id` string will pass through to the renderer, be stored in the `selected` Set, and eventually be passed as a playlist ID to `sync:start` in Phase 3. That will either silently skip the sync or produce a server error. Items without an ID are malformed and should be filtered out.

**Fix:**
```typescript
for (const item of items) {
  if (!item.Id) continue  // skip malformed items
  results.push({
    id: item.Id,
    name: item.Name ?? '(Unnamed)',
    trackCount: item.ChildCount ?? item.RecursiveItemCount ?? 0,
  })
}
```

### WR-02: Checkbox onClick and parent button onClick both fire toggleSelect — double-toggle risk

**File:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx:133-154`

**Issue:** Each playlist row is a `<button onClick={() => toggleSelect(playlist.id)}>`. Inside it sits an `<input type="checkbox" onChange={() => toggleSelect(playlist.id)} onClick={(e) => e.stopPropagation()} />`. When the user clicks the checkbox directly, `e.stopPropagation()` prevents the button's `onClick` from firing, so only `onChange` fires — one toggle, correct. But when the user clicks the **label text or track count span** (i.e., anywhere on the button that is not the checkbox), the button's `onClick` fires — one toggle, also correct.

The risk is subtle: if `stopPropagation` is ever removed or the event order changes (e.g., a React upgrade), both handlers fire on a single checkbox click, toggling the item twice (net: no change). The design is also semantically odd — a `<button>` containing an interactive `<input>` violates HTML spec (interactive content cannot be a descendant of `<button>`). This causes accessibility warnings in some environments.

**Fix:** Remove the `<input type="checkbox">` from inside the `<button>`. Use a `<li>` row with flex layout and handle selection via the button's `onClick` alone, rendering a styled checkbox-like indicator (a `<div>` with conditional border/background) instead of a real `<input>`.

Alternatively, keep the `<input>` outside the `<button>` as a sibling inside the `<li>`:
```tsx
<li key={playlist.id} className="flex items-center gap-3 px-4 rounded hover:bg-gray-700">
  <input
    type="checkbox"
    id={`pl-${playlist.id}`}
    checked={selected.has(playlist.id)}
    onChange={() => toggleSelect(playlist.id)}
    className="accent-blue-500 w-4 h-4 flex-shrink-0"
  />
  <label htmlFor={`pl-${playlist.id}`} className="flex-1 flex items-center min-h-[44px] cursor-pointer text-sm font-semibold">
    {playlist.name}
  </label>
  <span className="text-sm text-gray-400">{playlist.trackCount === 1 ? '1 track' : `${playlist.trackCount} tracks`}</span>
</li>
```

### WR-03: App startup silently swallows auth:getStatus error — no user feedback

**File:** `src/renderer/src/App.tsx:29-32`

**Issue:** If `auth:getStatus` throws (e.g., IPC handler not registered, main process crash during startup), the `catch` block logs to console but the UI remains on the login screen with no message. On a normal fresh install this is fine, but if the IPC layer itself fails, the user sees a blank login form with no indication that something went wrong. More importantly, the `console.error` call (line 31) is the only signal — it will be invisible in a packaged production build.

**Fix:** Replace `console.error` with the main-process `log` IPC channel (when available) or at minimum surface a non-blocking warning in the UI. Since this is a non-fatal startup path, a minimal fix is to add a visual fallback:
```tsx
.catch(() => {
  // Non-fatal: IPC failure on startup — user will be prompted to log in.
  // No console.error in renderer; main process logger is the right channel.
})
```
The logging improvement should pair with a main-process `app.on('uncaughtException')` guard (out of this phase's scope), but removing the renderer `console.error` prevents it showing in DevTools in production as an unactionable red error.

### WR-04: Login form has no client-side validation before IPC call

**File:** `src/renderer/src/screens/LoginScreen.tsx:17-36`

**Issue:** `handleConnect` sends the IPC call with whatever is in the fields, including empty strings. If all three fields are blank, the app hits the server ping in `auth:login` (which will fail with a network error), but the error message "Could not reach server" is misleading when the real problem is that the user left the URL field empty. Empty `username` or `password` will produce a 401 from the server, which is correctly reported, but the error message "Login failed. Check your username and password" does not tell the user which field is blank.

**Fix:**
```tsx
const handleConnect = async () => {
  setError(null)
  setReachableText(null)
  if (!url.trim()) { setError('Server URL is required.'); return }
  if (!username.trim()) { setError('Username is required.'); return }
  if (!password) { setError('Password is required.'); return }
  setLoading(true)
  // ... rest of handler
}
```

---

## Info

### IN-01: `reachableText` state is set to null and never set to a non-null value

**File:** `src/renderer/src/screens/LoginScreen.tsx:15, 19`

**Issue:** `reachableText` is declared as state and reset to `null` in `handleConnect`, but it is never assigned a non-null value anywhere in the component. The JSX block that conditionally renders it (`{reachableText && !error && ...}`) is therefore permanently dead. This appears to be a leftover from an earlier design where the ping step would briefly display a "Server reachable" message before the login step completed.

**Fix:** Remove the `reachableText` state, the `setReachableText(null)` reset in `handleConnect`, and the JSX block that renders it.

### IN-02: `console.error` in renderer startup

**File:** `src/renderer/src/App.tsx:31`

**Issue:** `console.error('auth:getStatus failed on startup', err)` in the renderer will appear in DevTools in development, but produces an unactionable red error in production DevTools (if opened) and adds no value over the main-process log. Per architecture rules, all logging should go through the main process.

**Fix:** Remove the `console.error` call. The main process `auth:getStatus` handler already logs `WARN` via `log()` when it clears credentials. If the IPC call itself fails (handler not registered), that is a programming error caught in development.

### IN-03: No AbortController / cleanup in PlaylistBrowserScreen useEffect

**File:** `src/renderer/src/screens/PlaylistBrowserScreen.tsx:21-32`

**Issue:** The `useEffect` that fetches playlists on mount does not return a cleanup function. In React Strict Mode (development), effects run twice; on the second run, the first fetch's `setPlaylists`/`setLoading` call fires on an already-unmounted (or re-mounted) component, causing a state update on stale component state. While this is not a correctness bug in production builds, it produces React warnings in development and can cause flicker.

Since the IPC call is not a true async fetch (no `AbortController` support in Electron IPC), the practical fix is to use a mounted flag:
```tsx
useEffect(() => {
  let mounted = true
  window.electronAPI.sync
    .getPlaylists()
    .then((data) => { if (mounted) { setPlaylists(data); setLoading(false) } })
    .catch((err) => { if (mounted) { setError((err as Error).message); setLoading(false) } })
  return () => { mounted = false }
}, [])
```

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
