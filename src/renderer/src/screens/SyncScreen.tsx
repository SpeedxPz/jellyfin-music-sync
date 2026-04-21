// src/renderer/src/screens/SyncScreen.tsx
import { useEffect, useState } from 'react'
import { useSyncStore } from '../store/syncStore'
import { ProgressBar } from '../components/ProgressBar'

export default function SyncScreen() {
  const { progress, updateProgress, setSummary, cancel } = useSyncStore()
  const [stopping, setStopping] = useState(false)

  // D-PROG-EVENTS: subscribe on mount; return cleanup to prevent listener accumulation (Pitfall 1)
  // T-04-02: on() returns cleanup fn (fixed in plan 04-01)
  useEffect(() => {
    const removeProgress = window.electronAPI.on('sync:progress', (p) => {
      updateProgress(p)
    })
    const removeComplete = window.electronAPI.on('sync:complete', (summary) => {
      setSummary(summary)
    })
    return () => {
      removeProgress()
      removeComplete()
    }
  }, [])

  const handleStop = () => {
    setStopping(true)
    cancel()                                  // D-CANCEL-STATE: set canceled=true in store
    window.electronAPI.sync.cancel()          // D-CANCEL: fire-and-forget
  }

  // Derived display values
  const overallPct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0
  const filePct = progress && progress.bytesTotal > 0
    ? Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100)
    : 0
  const toMB = (n: number) => (n / 1_048_576).toFixed(1)
  const done = progress?.current ?? 0
  const total = progress?.total ?? 0
  const remaining = Math.max(0, total - done)
  const failed = progress?.status === 'error' ? 1 : 0  // track-level; summary has total failed

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header — per UI-SPEC §SyncScreen regions */}
      <header className="bg-gray-800 border-b border-gray-600 px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">Jellyfin Music Sync</span>
        {/* D-CANCEL: Stop Sync button; min 44px touch target */}
        <button
          type="button"
          onClick={handleStop}
          disabled={stopping}
          aria-label="Stop Sync"
          className={`text-red-400 hover:text-red-300 text-sm min-h-[44px] min-w-[44px] ${stopping ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {stopping ? 'Stopping…' : 'Stop Sync'}
        </button>
      </header>

      {/* Content — per UI-SPEC §SyncScreen regions */}
      <main className="flex-1 flex flex-col p-6 gap-6">
        {/* Subtitle */}
        <p className="text-sm text-gray-400">
          Syncing {progress ? `• ${total} tracks` : '…'}
        </p>

        {/* Overall progress */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Overall</span>
            <span className="text-sm font-semibold">{overallPct}%</span>
          </div>
          <ProgressBar value={overallPct} size="md" />
        </div>

        {/* Current track */}
        <div className="flex flex-col gap-2">
          {/* D-PROG-LAYOUT: "Now: {artist} — {trackName}"; aria-live for screen reader */}
          <p
            className="text-sm text-gray-400 truncate"
            aria-live="polite"
          >
            {progress ? `Now: ${progress.trackName}` : 'Now: —'}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">File</span>
            <span className="text-sm text-gray-400">
              {progress
                ? `${toMB(progress.bytesDownloaded)} / ${toMB(progress.bytesTotal)} MB`
                : '0.0 / 0.0 MB'}
            </span>
          </div>
          <ProgressBar value={filePct} size="sm" />
        </div>

        {/* Counter row — per UI-SPEC Copywriting Contract */}
        <p className="text-sm text-gray-400">
          ✔ {done} done  •  ⧖ {remaining} remaining  •  ✖ {failed} failed
        </p>
      </main>
    </div>
  )
}
