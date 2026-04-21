import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerSettingsHandlers } from './ipc/settings'
import { registerAuthHandlers } from './ipc/auth'
import { registerPlaylistHandlers } from './ipc/playlists'
import { registerSyncHandlers } from './ipc/sync'
import { registerStubs } from './ipc/stubs'
import { log } from './lib/logger'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 320,
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
  registerSyncHandlers()      // SYNC-01 through SYNC-07, M3U8-01 through M3U8-03
  registerStubs()             // No active stubs — empty placeholder
  log('INFO', 'App started')
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
