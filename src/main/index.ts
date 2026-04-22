import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerSettingsHandlers } from './ipc/settings'
import { registerAuthHandlers } from './ipc/auth'
import { registerPlaylistHandlers } from './ipc/playlists'
import { registerSyncHandlers } from './ipc/sync'
import { registerShellHandlers } from './ipc/shell'
import { registerStubs } from './ipc/stubs'
import { log } from './lib/logger'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, // MANDATORY — never disable (CLAUDE.md)
      nodeIntegration: false, // MANDATORY — never disable (CLAUDE.md)
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // HMR for renderer based on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.jellyfin.music-sync')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerSettingsHandlers()
  registerAuthHandlers()      // AUTH-01, AUTH-02, AUTH-03, AUTH-04
  registerPlaylistHandlers()  // LIB-01: sync:getPlaylists
  registerShellHandlers()     // POST-03: shell:openPath
  registerStubs()             // No active stubs — empty placeholder
  log('INFO', 'App started')

  const win = createWindow()
  registerSyncHandlers(win)   // SYNC-01 through SYNC-07, M3U8-01 through M3U8-03; must come after createWindow() — Pitfall 2

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
