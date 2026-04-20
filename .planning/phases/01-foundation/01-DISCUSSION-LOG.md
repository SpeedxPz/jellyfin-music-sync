# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 1-foundation
**Areas discussed:** Scaffold initialization, Settings persistence, IPC channel scope, Initial window / placeholder UI

---

## Scaffold Initialization

| Option | Description | Selected |
|--------|-------------|----------|
| Use the official starter | `npm create @quick-start/electron@latest` with react-ts template; scaffold into existing folder | ✓ |
| Manual assembly | Start from `npm init`, install deps individually | |

**User's choice:** Official starter → scaffold into existing folder (`.`)
**Notes:** CLAUDE.md and `.planning/` directory already present and won't be affected.

---

## Settings Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| electron-store | Typed, schema-validated JSON in userData; adds one dep | ✓ |
| Hand-rolled JSON | Custom read/write in userData; zero deps | |

**User's choice:** electron-store
**Follow-up — default concurrent downloads:** 3

---

## IPC Channel Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full contract for all 4 phases | Define all channels in ipc-types.ts now; Phase 2–4 are stubs | ✓ |
| Phase 1 channels only | Settings IPC only; extend in later phases | |

**User's choice:** Full contract upfront

**Follow-up — stub behavior:**

| Option | Description | Selected |
|--------|-------------|----------|
| Throw a clear error | `Error('Not implemented: auth.login')` | ✓ |
| Return null / no-op silently | Stubs resolve without doing anything | |

**Notes:** Stubs must throw — silent no-ops hide accidental early calls.

---

## Initial Window / Placeholder UI

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal dev panel | Shows settings (read/write via IPC) + log file path | ✓ |
| Blank splash screen | Centered app name and version only | |

**User's choice:** Minimal dev panel with settings controls and log path visible.

---

## Claude's Discretion

- FAT32 sanitizePathSegment internal implementation
- Atomic write helper details
- Window dimensions and Tailwind styling
- Vitest test structure
- Debug log format
- electron-store version

## Deferred Ideas

None.
