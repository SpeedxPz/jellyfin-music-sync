# Technology Stack

**Project:** Jellyfin Music Sync
**Researched:** 2026-04-19
**Overall confidence:** HIGH (all critical choices verified against official docs or npm registry)

---

## Core Framework

| Technology | Version | Purpose | Rationale | Confidence |
|------------|---------|---------|-----------|------------|
| Electron | ^41.0.0 | Desktop runtime — Windows + Linux | v41 ships Node.js 24 and Chromium 146. The constraint in PROJECT.md is exactly Electron + TypeScript; no reason to deviate. v41.2.1 is current stable (released 2026-04-16). | HIGH |
| TypeScript | ^5.4 | Language | Project constraint. TS 5.4+ gives satisfies, const type params, and stricter narrowing — use throughout main, preload, and renderer. | HIGH |
| Node.js | 24.x (bundled) | Runtime in main process | Electron 41 bundles Node 24. No separate install needed; use Node 24 APIs (native fetch, fs/promises, ReadableStream) freely. | HIGH |

**IPC Pattern — use contextBridge + typed preload, NOT ipcRenderer in renderer**

The correct Electron IPC architecture for 2025:

1. **Main process** — handles all I/O: Jellyfin API calls, file writes, sync orchestration.
2. **Preload script** — `contextBridge.exposeInMainWorld('api', { ... })` exposes a typed surface. Never expose the raw `ipcRenderer`.
3. **Renderer** — calls `window.api.*`, has zero Node access.

Create `src/preload/index.ts` that exposes typed handlers, then `src/types/electron-api.d.ts` that augments `Window` so the renderer gets autocomplete. This is the pattern the Electron docs recommend and avoids `nodeIntegration: true` which is a security footgun.

DO NOT use `ipcRenderer` directly in renderer code. DO NOT set `nodeIntegration: true`.

---

## Build Tooling

| Technology | Version | Purpose | Rationale | Confidence |
|------------|---------|---------|-----------|------------|
| electron-vite | ^5.0.0 | Build system | Unified Vite config for main + preload + renderer in one tool. v5.0 is current (Dec 2025). Handles the dual-context problem (ESM renderer, CJS main) automatically. Hot-reload in both renderer and main process during dev. Preferred over rolling your own Vite + tsc setup. | HIGH |
| Vite | ^6.0 (peer dep of electron-vite) | Bundler for renderer | Bundled by electron-vite; no separate config needed unless customising. | HIGH |

**Why not Electron Forge?** Forge is Electron's officially recommended tool and great for new projects, but electron-vite has better TypeScript + Vite DX out of the box with less boilerplate. For this app's scope (single dev, no plugin ecosystem needed), electron-vite is the leaner choice.

---

## HTTP / Jellyfin API Client

| Technology | Version | Purpose | Rationale | Confidence |
|------------|---------|---------|-----------|------------|
| @jellyfin/sdk | ^0.13.0 | Jellyfin REST API | Official Jellyfin TypeScript SDK, auto-generated from the Jellyfin OpenAPI spec. Covers auth (`/Users/AuthenticateByName`), playlist enumeration, and item metadata. v0.13.0 targets Jellyfin 10.11.x. Use this instead of raw fetch — typed responses, server discovery helper, access token management. | HIGH |
| Node.js native fetch | built-in | Downloading audio files | Node 24 (bundled in Electron 41) ships a stable native `fetch`. Use it for streaming binary downloads to avoid an extra HTTP dep. `got` is the alternative if you need retry hooks, but native fetch + manual retry logic is sufficient here. | HIGH |

**Why not axios?** Axios has limited native streaming support and adds ~50KB. For a sync tool doing binary file streaming, you want `ReadableStream` pipe-to-file, which native fetch and `got` handle cleanly and axios does not.

**Why not the older `jellyfin-apiclient`?** Officially deprecated. The npm page directs users to `@jellyfin/sdk`. Do not use it.

**Download streaming pattern (main process):**
```typescript
const response = await fetch(audioUrl, { headers: { 'X-Emby-Token': accessToken } });
if (!response.body) throw new Error('No body');
const writer = fs.createWriteStream(destPath);
await pipeline(Readable.fromWeb(response.body), writer);
```
`Readable.fromWeb` (Node 18+) bridges the WHATWG ReadableStream to a Node stream, enabling `stream/promises.pipeline` for backpressure-safe writes.

---

## File System and Download Management

| Technology | Version | Purpose | Rationale | Confidence |
|------------|---------|---------|-----------|------------|
| Node.js `fs/promises` + `stream/promises` | built-in | File I/O, streaming writes | No library needed. `fs/promises.mkdir({ recursive: true })`, `pipeline()`, `rename()` for atomic writes. Electron 41/Node 24 has all required APIs. | HIGH |
| p-limit | ^6.0 | Concurrent download throttling | Controls simultaneous downloads (recommend 3–5 concurrent). ~100M weekly downloads, maintained by Sindre Sorhus. Simpler API than p-queue for this use case. Install from main process only. | HIGH |
| sanitize-filename | ^1.6.4 | FAT32-safe filenames | Strips characters illegal on FAT32/Windows (`\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) from artist/album/track names before building paths. Required for USB compatibility per PROJECT.md constraints. | HIGH |

**Concurrent download recommendation:** 3 simultaneous downloads. Enough to keep bandwidth utilised; low enough to avoid rate-limiting from a home Jellyfin server.

**Atomic writes:** Write to a `.tmp` file first, then `fs.rename()` to final path. If the app crashes mid-download, the manifest won't reference a partial file.

**Manifest file:** `_jellyfin-sync.json` stored in the destination root, as specified in PROJECT.md. Plain JSON with a map of `itemId → { path, etag, addedAt }`. Read/write entirely in the main process; never expose raw FS paths to the renderer.

---

## UI Framework

| Technology | Version | Purpose | Rationale | Confidence |
|------------|---------|---------|-----------|------------|
| React | ^19.0 | Renderer UI | This is a medium-complexity app with real-time progress updates flowing from main → renderer via IPC events. React's ecosystem (hooks, context) handles this cleanly. Svelte would reduce bundle size but has a smaller component ecosystem and less team familiarity in most orgs. React 19's compiler optimisations narrow the performance gap with Svelte. | MEDIUM |
| Zustand | ^5.0 | Renderer state | Lightweight (<1 KB gzip). Replaces Redux for this scale. Store holds: server config, selected playlists, sync job state, per-file progress. Works without Provider boilerplate, making it easy to update from IPC event listeners outside the component tree. | HIGH |
| Tailwind CSS | ^4.0 | Styling | Utility-first, no runtime, pairs well with electron-vite's Vite pipeline. Tailwind v4 uses a new CSS-first config — no `tailwind.config.js` needed. Avoid heavy component libraries (MUI, Chakra) for an Electron app; they ship large JS bundles and browser-first assumptions. | MEDIUM |

**Why not Vue or Svelte?** Both are valid. React is chosen here because Zustand, the IPC typing patterns, and most Electron boilerplates are React-first. If the team has Vue experience, Vue 3 + Pinia is a reasonable swap with the same architecture.

**Progress reporting pattern:** Main process emits `ipc.send('sync:progress', payload)` per downloaded file. Preload exposes `onSyncProgress(cb)` using `ipcRenderer.on`. Renderer's Zustand store listens and updates per-file/per-playlist progress without polling.

---

## Packaging

| Technology | Version | Purpose | Rationale | Confidence |
|------------|---------|---------|-----------|------------|
| electron-builder | ^26.8.2 | Package + distribute | Current stable (26.8.2, March 2026). Produces NSIS installer for Windows and AppImage + deb for Linux from a single config. Supports code signing for Windows. More configurable than Electron Forge for cross-platform CI builds. | HIGH |

**Target formats:**

| Platform | Format | Rationale |
|----------|--------|-----------|
| Windows | NSIS (`.exe` installer) | Standard Windows installer with uninstaller. Alternatively `portable` for no-install ZIP. |
| Linux | AppImage | Universal, no install, runs on Ubuntu/Fedora/Arch without packaging per-distro. Primary Linux target. |
| Linux | `.deb` | Secondary target for Debian/Ubuntu users who want system integration. |

**Why not Electron Forge for packaging?** Forge can only build for the current platform by default, requiring OS-specific CI runners. electron-builder supports cross-compilation targets in one config, including Docker-based Linux builds from Windows. Better for a solo dev shipping to both platforms.

---

## Dev Tooling

| Technology | Version | Purpose | Rationale | Confidence |
|------------|---------|---------|-----------|------------|
| ESLint | ^9.0 | Linting | ESLint 9 uses flat config (`eslint.config.js`). Use `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`. Catch IPC type mismatches early. | HIGH |
| Prettier | ^3.0 | Formatting | Pair with ESLint via `eslint-config-prettier` to avoid rule conflicts. | HIGH |
| Vitest | ^3.0 | Unit testing | Vite-native test runner; integrates directly with the electron-vite pipeline. Use for testing: manifest read/write logic, FAT32 sanitisation, M3U8 generation, IPC handler logic (mocked). No browser/Electron needed for unit tests. | HIGH |
| pnpm | ^9.0 | Package manager | Faster installs, strict dependency isolation. Works well with electron-vite monorepo-style setup. | MEDIUM |

**What NOT to use:**

| Tool | Reason to Avoid |
|------|----------------|
| `jest` | Requires additional transform config for ESM + Vite; Vitest is drop-in with electron-vite. |
| `webpack` | electron-vite already uses Vite; adding Webpack creates a dual-bundler mess. |
| `nodeIntegration: true` | Security hole. Use contextBridge IPC pattern instead. |
| `jellyfin-apiclient` | Officially deprecated in favour of `@jellyfin/sdk`. |
| `axios` | Binary streaming support is poor; native fetch or `got` are cleaner for file downloads. |
| `electron-dl` | Wraps Electron's `DownloadItem` which routes through Chromium's download manager — wrong tool for background sync to arbitrary paths. Use Node stream pipeline instead. |

---

## Installation

```bash
# Scaffold with electron-vite (React + TypeScript template)
pnpm create @quick-start/electron jellyfin-music-sync --template react-ts

# Jellyfin API
pnpm add @jellyfin/sdk

# Concurrency + filename safety
pnpm add p-limit sanitize-filename

# UI state
pnpm add zustand

# Styling
pnpm add -D tailwindcss @tailwindcss/vite

# Packaging
pnpm add -D electron-builder

# Linting + testing
pnpm add -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-config-prettier prettier vitest
```

---

## Sources

- [Electron Releases — releases.electronjs.org](https://releases.electronjs.org/) — v41.2.1 confirmed current stable
- [Electron IPC — electronjs.org/docs](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron contextBridge — electronjs.org/docs](https://www.electronjs.org/docs/latest/api/context-bridge)
- [jellyfin-sdk-typescript — github.com/jellyfin](https://github.com/jellyfin/jellyfin-sdk-typescript) — v0.13.0, targets Jellyfin 10.11.x
- [electron-vite 5.0 announcement](https://electron-vite.org/blog/)
- [electron-builder — electron.build](https://www.electron.build/index.html) — v26.8.2
- [p-limit — github.com/sindresorhus](https://github.com/sindresorhus/p-limit)
- [sanitize-filename — npmjs.com](https://www.npmjs.com/package/sanitize-filename)
- [Zustand comparison — zustand.docs.pmnd.rs](https://zustand.docs.pmnd.rs/learn/getting-started/comparison)
- [Axios vs Fetch 2025 — logrocket.com](https://blog.logrocket.com/axios-vs-fetch-2025/)
