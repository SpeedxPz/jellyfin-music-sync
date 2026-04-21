// src/main/ipc/stubs.ts
import { ipcMain } from 'electron'

// Phase 3 channels (sync:start, sync:cancel) are now implemented in src/main/ipc/sync.ts.
// This array is intentionally empty — kept as a placeholder for future stub phases.
const PHASE3_CHANNELS: string[] = []

export function registerStubs(): void {
  for (const channel of PHASE3_CHANNELS) {
    ipcMain.handle(channel, () => {
      // D-06: Must throw, never return null/undefined/empty object.
      throw new Error(`Not implemented: ${channel}`)
    })
  }
  // sync:cancel no-op removed — real handler in sync.ts uses ipcMain.on('sync:cancel', ...)
}
