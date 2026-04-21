// shared/ipc-types.ts
// Full IPC contract for all 4 phases.
// Phase 1: settings.* channels are implemented.
// Phase 2: auth.* channels are stubs (throw 'Not implemented: <channel>').
// Phase 3: sync.* channels are stubs.
// Phase 4: on() event subscriptions are stubs.
// This file is the single source of truth for all channel names and payload shapes.

export interface Settings {
  lastDestination: string       // SET-01: remembered destination folder; default ''
  concurrentDownloads: number   // SET-02: 1–5 concurrent downloads; default 3 (D-04)
  serverUrl: string             // Jellyfin server base URL; default ''
  userId: string                // Jellyfin user ID from auth; default ''
  encryptedToken: string        // base64-encoded encrypted token OR plaintext (Linux fallback); default ''
  displayName: string           // Jellyfin user display name; default ''
  serverName: string            // Jellyfin server name from PublicSystemInfo; default ''
}

export interface AuthResult {
  userId: string
  accessToken: string
  serverId: string
  serverName: string
  displayName: string           // From AuthenticationResult.User.Name
  linuxPlaintextWarning: boolean  // true when safeStorage unavailable on Linux (D-AUTH-LINUX)
}

export interface SyncOptions {
  playlistIds: string[]
  destination: string
  concurrentDownloads: number
}

export interface SyncProgress {
  playlistId: string
  trackId: string
  trackName: string
  current: number
  total: number
  bytesDownloaded: number
  bytesTotal: number
  status: 'downloading' | 'complete' | 'error'
  error?: string
}

export interface SyncSummary {
  added: number
  removed: number
  unchanged: number
  failed: number                                          // tracks that failed to download (D-ERR-SKIP)
  failures: Array<{ name: string; reason: string }>      // error log for POST-02
}

export interface ElectronAPI {
  // ── Phase 1: Settings (implemented) ──────────────────────────────────────
  settings: {
    /** Returns the current settings object. */
    get(): Promise<Settings>
    /** Merges partial settings into the store. concurrentDownloads is clamped 1–5. */
    set(s: Partial<Settings>): Promise<void>
    /** Returns the absolute path to the debug log file (SET-03). */
    getLogPath(): Promise<string>
  }

  // ── Phase 2: Auth (stubs — throw 'Not implemented: auth:<method>') ───────
  auth: {
    login(url: string, user: string, pass: string): Promise<AuthResult>
    logout(): Promise<void>
    getStatus(): Promise<{
      connected: boolean
      serverName?: string
      displayName?: string
      userId?: string
      linuxPlaintextWarning?: boolean
    }>
  }

  // ── Phase 3: Sync (stubs — throw 'Not implemented: sync:<method>') ───────
  sync: {
    start(opts: SyncOptions): Promise<void>
    /** Fire-and-forget cancel signal. */
    cancel(): void
    getPlaylists(): Promise<Array<{ id: string; name: string; trackCount: number }>>
  }

  // ── Phase 4: Event subscriptions (stubs) ─────────────────────────────────
  on(event: 'sync:progress', cb: (p: SyncProgress) => void): void
  on(event: 'sync:complete', cb: (summary: SyncSummary) => void): void
  on(event: 'sync:error', cb: (err: { message: string }) => void): void
}

// Augment the global Window interface so renderer code can access
// window.electronAPI with full type safety without importing this file.
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
