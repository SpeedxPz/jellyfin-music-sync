// src/main/ipc/stubs.ts
import { ipcMain } from 'electron'

// Phase 2 channels (implemented in Phase 2)
const PHASE2_CHANNELS = [
  'auth:login',
  'auth:logout',
  'auth:getStatus',
]

// Phase 3 channels (implemented in Phase 3) — sync:cancel excluded because it
// uses ipcMain.on (fire-and-forget send), not ipcMain.handle (invoke).
const PHASE3_CHANNELS = [
  'sync:start',
  'sync:getPlaylists',
]

const ALL_STUB_CHANNELS = [...PHASE2_CHANNELS, ...PHASE3_CHANNELS]

export function registerStubs(): void {
  for (const channel of ALL_STUB_CHANNELS) {
    ipcMain.handle(channel, () => {
      // D-06: Must throw, never return null/undefined/empty object.
      // This ensures accidental early invocations are visible immediately.
      throw new Error(`Not implemented: ${channel}`)
    })
  }

  // sync:cancel is fire-and-forget (preload uses ipcRenderer.send, not invoke).
  // Register with ipcMain.on so messages are not silently dropped.
  // Phase 3 will replace this stub with the real cancel logic.
  ipcMain.on('sync:cancel', () => {
    // stub: no-op until Phase 3
  })
}
