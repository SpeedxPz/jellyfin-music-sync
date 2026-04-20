// src/main/lib/jellyfin.ts
// Jellyfin SDK wrapper — holds the module-level Api instance for the current session.
// All HTTP calls to the Jellyfin server go through the Api instance managed here.
// NEVER expose the Api instance or any SDK type to the renderer via IPC.
import { Jellyfin } from '@jellyfin/sdk'
import type { Api } from '@jellyfin/sdk'

// Re-export API factory helpers so handler files import from one place.
export { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api'
export { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api'
export { getItemsApi } from '@jellyfin/sdk/lib/utils/api/items-api'
export { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api'

const jellyfin = new Jellyfin({
  clientInfo: {
    name: 'Jellyfin Music Sync',
    version: '0.1.0',
  },
  deviceInfo: {
    name: 'Desktop',
    id: 'jellyfin-music-sync-desktop',
  },
})

// Module-level Api instance — null until successful login or session restore.
let _api: Api | null = null

/**
 * Creates (or replaces) the module-level Api instance for the given base URL.
 * Call during auth:login and auth:getStatus to set up the session.
 */
export function createJellyfinApi(baseUrl: string): Api {
  _api = jellyfin.createApi(baseUrl)
  return _api
}

/** Returns the current Api instance, or null if not authenticated. */
export function getApi(): Api | null {
  return _api
}

/** Clears the module-level Api instance. Call on auth:logout. */
export function clearApi(): void {
  _api = null
}
