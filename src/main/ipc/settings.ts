// src/main/ipc/settings.ts
import { ipcMain } from 'electron'
import { store } from '../lib/store'
import { getLogPath } from '../lib/logger'
import type { Settings } from '../../../shared/ipc-types'

export function registerSettingsHandlers(): void {
  // SET-01 + SET-02: Get current settings (lastDestination + concurrentDownloads)
  ipcMain.handle('settings:get', (): Settings => {
    return store.store
  })

  // SET-01 + SET-02: Update settings (partial merge; concurrentDownloads clamped 1–5)
  ipcMain.handle('settings:set', (_evt, partial: Partial<Settings>): void => {
    if (partial.concurrentDownloads !== undefined) {
      partial = {
        ...partial,
        concurrentDownloads: Math.max(1, Math.min(5, partial.concurrentDownloads)),
      }
    }
    store.set(partial)
  })

  // SET-03: Expose log file path to renderer (app.getPath is main-process-only)
  ipcMain.handle('settings:getLogPath', (): string => {
    return getLogPath()
  })
}
