// src/main/ipc/shell.ts
import { ipcMain, shell } from 'electron'

export function registerShellHandlers(): void {
  // shell:openPath — open destination folder in OS file explorer (POST-03)
  // T-04-01: validate path is non-empty; path was chosen by user via native dialog (main controls resolution)
  ipcMain.handle('shell:openPath', async (_evt, path: string): Promise<void> => {
    if (!path) return
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })
}
