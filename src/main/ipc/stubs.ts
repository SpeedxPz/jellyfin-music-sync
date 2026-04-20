// src/main/ipc/stubs.ts
import { ipcMain } from 'electron'

// Phase 3 channels (implemented in Phase 3)
// NOTE: sync:getPlaylists is implemented in Phase 2 (src/main/ipc/playlists.ts) — not a stub.
// sync:cancel is fire-and-forget via ipcMain.on — registered below, not in PHASE3_CHANNELS.
const PHASE3_CHANNELS = [
  'sync:start',
]

export function registerStubs(): void {
  for (const channel of PHASE3_CHANNELS) {
    ipcMain.handle(channel, () => {
      // D-06: Must throw, never return null/undefined/empty object.
      throw new Error(`Not implemented: ${channel}`)
    })
  }

  // sync:cancel is fire-and-forget (preload uses ipcRenderer.send, not invoke).
  ipcMain.on('sync:cancel', () => {
    // stub: no-op until Phase 3
  })
}
