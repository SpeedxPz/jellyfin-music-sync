// src/renderer/src/App.tsx
// Phase 1 dev panel — replaced by real UI in Phase 4.
// Purpose: Verifies the full IPC stack (renderer → preload → main → store).
import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/ipc-types'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [logPath, setLogPath] = useState<string>('')

  useEffect(() => {
    // Load settings and log path from main process via IPC on mount.
    window.electronAPI.settings.get().then(setSettings)
    window.electronAPI.settings.getLogPath().then(setLogPath)
  }, [])

  const adjustConcurrent = async (delta: number) => {
    if (!settings) return
    const next = Math.max(1, Math.min(5, settings.concurrentDownloads + delta))
    await window.electronAPI.settings.set({ concurrentDownloads: next })
    // Update local state after the IPC call confirms success.
    setSettings((prev) => (prev ? { ...prev, concurrentDownloads: next } : prev))
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
      <div className="border border-gray-600 rounded p-6 w-80 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-600 pb-2">
          <span className="font-semibold">Jellyfin Music Sync</span>
          <span className="text-gray-400 text-sm">v0.1.0-dev</span>
        </div>

        {/* Settings section */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-300">Settings</p>

          {/* SET-01: Last destination folder */}
          <p className="text-sm">
            Last folder:{' '}
            <span className="text-gray-400">
              {settings?.lastDestination || '[not set]'}
            </span>
          </p>

          {/* SET-02: Concurrent downloads with +/- controls */}
          <div className="flex items-center gap-2 text-sm">
            <span>Concurrent downloads:</span>
            <button
              onClick={() => adjustConcurrent(-1)}
              disabled={settings?.concurrentDownloads === 1}
              className="px-2 py-0.5 border border-gray-500 rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              -
            </button>
            <span className="w-4 text-center tabular-nums">
              {settings?.concurrentDownloads ?? 3}
            </span>
            <button
              onClick={() => adjustConcurrent(1)}
              disabled={settings?.concurrentDownloads === 5}
              className="px-2 py-0.5 border border-gray-500 rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
        </div>

        {/* SET-03: Debug log path */}
        <div className="text-xs text-gray-500 border-t border-gray-600 pt-2 break-all">
          Debug log: {logPath || '...'}
        </div>
      </div>
    </div>
  )
}
