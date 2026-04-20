# Phase 1: Foundation - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a launchable Electron app with: a secure architecture (contextIsolation: true, nodeIntegration: false), typed IPC contracts covering all 4 phases, FAT32-safe filesystem utilities, an atomic manifest write helper, a persistent settings store, and a debug log — all with unit tests. No feature UI; the app shows a minimal dev panel to verify Phase 1 works.

</domain>

<decisions>
## Implementation Decisions

### Scaffold
- **D-01:** Use `npm create @quick-start/electron@latest` with the `react-ts` template, scaffolded directly into the existing project root (`.`). The CLAUDE.md and `.planning/` directory are already present and will not be touched by the scaffold.

### Settings Persistence
- **D-02:** Use `electron-store` (typed, schema-validated JSON in `app.getPath('userData')`). Do not hand-roll a custom JSON store.
- **D-03:** Schema includes at minimum: `lastDestination` (string, default `''`) and `concurrentDownloads` (number, default `3`, range 1–5).
- **D-04:** Default concurrent downloads = **3**.

### IPC Channel Design
- **D-05:** Define the **full typed IPC contract for all 4 phases** in `ipc-types.ts` at Phase 1. Phase 1 implements only the `settings` channels; Phase 2–4 channels are registered as stubs.
- **D-06:** Unimplemented stub handlers **throw a clear error**: `throw new Error('Not implemented: <channel>')`. Silent no-ops are not acceptable — callers must notice accidental early calls.

### Initial Window / Placeholder UI
- **D-07:** The Phase 1 window is a **minimal dev panel** showing: app version, current settings (last folder + concurrent downloads with +/– controls wired to IPC), and the debug log file path. This is replaced by the real UI in Phase 4.

### Claude's Discretion
- FAT32 `sanitizePathSegment()` internal implementation (regex strategy, reserved name list)
- Atomic write helper implementation details (tmp suffix, error handling)
- Window dimensions and Tailwind styling for the dev panel
- Vitest test file structure and naming conventions
- Debug log format (plaintext lines vs. structured JSON)
- electron-store version to use

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture Rules
- `CLAUDE.md` — contextIsolation: true / nodeIntegration: false mandate, atomic manifest write pattern, FAT32 sanitization rules, IPC design constraints

### Requirements
- `.planning/REQUIREMENTS.md` §Settings — SET-01, SET-02, SET-03 (the three requirements in Phase 1 scope)
- `.planning/PROJECT.md` §Constraints — FAT32, Windows 10+, Linux compatibility constraints

### Known Open Questions (from STATE.md)
- `safeStorage` on headless Linux — not needed in Phase 1 but IPC stubs for auth should be aware this will be addressed in Phase 2. No decisions needed now.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project. The scaffold will generate the starting point.

### Established Patterns
- None yet — Phase 1 establishes all patterns that subsequent phases follow.

### Integration Points
- `ipc-types.ts` → `preload.ts` → `window.electronAPI` — this chain must be established in Phase 1 and followed by all subsequent phases
- `electron-store` instance lives in main process only; renderer accesses settings exclusively via IPC

</code_context>

<specifics>
## Specific Ideas

- The dev panel layout (as chosen by user):
  ```
  +---------------------------------+
  | Jellyfin Music Sync  v0.1.0-dev |
  +---------------------------------+
  | Settings                        |
  |  Last folder: [not set]         |
  |  Concurrent downloads: [3]  [+] |
  |                                 |
  | Debug log: %APPDATA%/jms/...    |
  +---------------------------------+
  ```
- IPC contract shape (as chosen by user):
  ```ts
  export interface ElectronAPI {
    // Phase 1
    settings: { get(): Promise<Settings>; set(s: Partial<Settings>): Promise<void> }
    // Phase 2 (stub — throws 'Not implemented')
    auth: { login(url, user, pass): Promise<AuthResult>; logout(): Promise<void> }
    // Phase 3 (stub)
    sync: { start(opts: SyncOptions): void; cancel(): void }
    // Phase 4 (stub)
    on(event: 'sync:progress', cb: (p: Progress) => void): void
  }
  ```

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-19*
