# Phase 2: Jellyfin Connection — Discussion Log

**Date:** 2026-04-20
**Participant:** User + Claude

---

## Area 1: Token Storage + Linux safeStorage Fallback

**Question:** On Linux where `safeStorage.isEncryptionAvailable()` returns false (no libsecret/kwallet available), what should the app do?

**Options presented:**
1. Hard fail — refuse to log in, explain the issue
2. Fall back to plaintext with warning — store token in electron-conf userData JSON, show in-app warning
3. Skip token persistence — require re-login every launch on Linux

**User answer:** Fall back to plaintext with warning

**Decision recorded:** D-AUTH-LINUX — On Linux where `safeStorage.isEncryptionAvailable()` returns false, fall back to storing the auth token as plaintext in electron-conf userData JSON. Show a persistent in-app warning. No hard failure; graceful degradation.

---

## Area 2: Phase 2 UI Scope

**Question:** Phase 2 UI scope: how complete should the login and playlist browser screens be?

**Options presented:**
1. Real screens — build actual login form and playlist browser UI in Phase 2
2. Dev panel only — minimal text inputs and raw output, real UI deferred to Phase 4

**User answer:** Real screens

**Decision recorded:** D-UI-SCOPE — Build real, shippable login and playlist browser screens in Phase 2. Phase 4 adds progress, cancel, and summary on top — it should not rework auth/library screens.

---

## Area 3: Playlist Size Estimation

**Question:** What should show next to each playlist in the browser?

**Options presented:**
1. Track count only — from playlist API response, zero extra API calls
2. Size in MB (accurate) — fetch MediaSources per track, O(N) calls, slow
3. Size estimate (fast) — multiply track count by fixed average (e.g. 8 MB)

**User answer:** Track count only

**Decision recorded:** D-SIZE-EST — Show track count only. LIB-02 (size estimate) explicitly deferred — O(N) API calls too slow for page load. **D-LIB02-DEFER** — LIB-02 deferred to a future version.

---

## Area 4: Server Validation + Error UX

**Question:** What should the app check before attempting login?

**Options presented:**
1. Reachability check — ping GET /System/Info/Public before login, user-friendly errors
2. Login only — skip pre-check, let SDK fail naturally

**User answer:** Reachability check

**Decision recorded:** D-SERVER-VALIDATE — Ping GET /System/Info/Public before login. Errors shown inline below the Connect button (not modal/toast). Three distinct error cases: unreachable, not Jellyfin, wrong credentials.

---

*Log complete — all 4 gray areas resolved*
