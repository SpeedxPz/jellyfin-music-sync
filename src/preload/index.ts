// src/preload/index.ts
// Exposes a typed IPC bridge to the renderer via contextBridge.
// NEVER expose raw ipcRenderer — only the typed electronAPI wrapper.
import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../../shared/ipc-types'

const api: ElectronAPI = {
  // ── Phase 1: Settings (implemented in main/ipc/settings.ts) ──────────────
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (s) => ipcRenderer.invoke('settings:set', s),
    getLogPath: () => ipcRenderer.invoke('settings:getLogPath'),
  },

  // ── Phase 2: Auth (stubs — main/ipc/stubs.ts will throw) ─────────────────
  auth: {
    login: (url, user, pass) => ipcRenderer.invoke('auth:login', url, user, pass),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getStatus: () => ipcRenderer.invoke('auth:getStatus'),
  },

  // ── Phase 3: Sync (stubs — main/ipc/stubs.ts will throw) ─────────────────
  sync: {
    start: (opts) => ipcRenderer.invoke('sync:start', opts),
    // sync:cancel is fire-and-forget — use send, not invoke
    cancel: () => ipcRenderer.send('sync:cancel'),
    getPlaylists: () => ipcRenderer.invoke('sync:getPlaylists'),
  },

  // ── Phase 4: Event subscriptions (stubs — no main handler yet) ───────────
  on: (event, cb) => {
    ipcRenderer.on(event, (_evt, payload) => cb(payload))
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
