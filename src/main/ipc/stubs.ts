// src/main/ipc/stubs.ts
import { ipcMain } from 'electron'

// Phase 2 channels (implemented in Phase 2)
const PHASE2_CHANNELS = [
  'auth:login',
  'auth:logout',
  'auth:getStatus',
]

// Phase 3 channels (implemented in Phase 3)
const PHASE3_CHANNELS = [
  'sync:start',
  'sync:cancel',
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
}
