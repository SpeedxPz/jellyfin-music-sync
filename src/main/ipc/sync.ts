// src/main/ipc/sync.ts
import { ipcMain, dialog, Notification } from 'electron'
import type { BrowserWindow } from 'electron'
import { runSync } from '../lib/sync-engine'
import { getApi } from '../lib/jellyfin'
import { store } from '../lib/store'
import type { SyncOptions } from '../../../shared/ipc-types'

// Module-level AbortController — one sync run at a time
let _abortController: AbortController | null = null

export function registerSyncHandlers(mainWindow: BrowserWindow): void {
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
          playlistNames: opts.playlistNames,
          destination,
          concurrentDownloads: Math.min(5, Math.max(1, opts.concurrentDownloads ?? store.get('concurrentDownloads'))),
        },
        evt.sender,
        _abortController.signal
      )
      // D-NOTIF: fire only on clean complete — check aborted flag (T-04-03, Pitfall 5)
      if (!_abortController?.signal.aborted && Notification.isSupported()) {
        const body =
          summary.added === 0 && summary.failed === 0
            ? 'All tracks up to date'
            : `${summary.added} added, ${summary.failed} failed`
        const notif = new Notification({ title: 'Sync complete', body })
        // D-NOTIF-CLICK: focus app window; guard destroyed window (Pitfall 2)
        notif.on('click', () => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus()
        })
        notif.show()
      }

      // D-SUMMARY-DESTINATION: include resolved destination in payload (Pitfall 3)
      const summaryWithDest = { ...summary, destination }

      // D-PROG-PUSH: send complete event to renderer
      if (!evt.sender.isDestroyed()) {
        evt.sender.send('sync:complete', summaryWithDest)
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
