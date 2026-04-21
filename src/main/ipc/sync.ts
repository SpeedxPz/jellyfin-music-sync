// src/main/ipc/sync.ts
import { ipcMain, dialog } from 'electron'
import { runSync } from '../lib/sync-engine'
import { getApi } from '../lib/jellyfin'
import { store } from '../lib/store'
import type { SyncOptions } from '../../../shared/ipc-types'

// Module-level AbortController — one sync run at a time
let _abortController: AbortController | null = null

export function registerSyncHandlers(): void {
  // sync:start — opens folder picker, then runs sync
  // D-DEST-PICKER: dialog.showOpenDialog is invoked from main process
  // D-DEST-PREFILL: lastDestination passed as defaultPath
  // D-DEST-SAVE: chosen path saved back to settings after dialog
  ipcMain.handle('sync:start', async (evt, opts: SyncOptions) => {
    const api = getApi()
    if (!api) throw new Error('Not authenticated. Please log in first.')

    const lastDestination = store.get('lastDestination') || undefined

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: lastDestination,
      title: 'Select sync destination',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return  // user dismissed — do nothing, no error
    }

    const destination = result.filePaths[0]
    store.set({ lastDestination: destination })  // D-DEST-SAVE

    // Cancel any previously running sync (safety guard — should not occur in practice)
    if (_abortController) {
      _abortController.abort()
    }
    _abortController = new AbortController()

    try {
      const summary = await runSync(
        {
          playlistIds: opts.playlistIds,
          destination,
          concurrentDownloads: Math.min(5, Math.max(1, opts.concurrentDownloads ?? store.get('concurrentDownloads'))),
        },
        evt.sender,
        _abortController.signal
      )
      // D-PROG-PUSH: send complete event to renderer
      if (!evt.sender.isDestroyed()) {
        evt.sender.send('sync:complete', summary)
      }
    } finally {
      _abortController = null
    }
  })

  // sync:cancel — fire-and-forget abort signal (preload uses ipcRenderer.send, not invoke)
  ipcMain.on('sync:cancel', () => {
    _abortController?.abort()
  })
}
