// src/renderer/src/screens/SyncScreen.tsx
import { useEffect, useRef, useState } from 'react'
import { useSyncStore } from '../store/syncStore'
import { ProgressBar } from '../components/ProgressBar'

export default function SyncScreen() {
  const { progress, failedCount, updateProgress, setSummary, cancel, reset } = useSyncStore()
  const [stopping, setStopping] = useState(false)

  // Fix: with concurrent downloads, multiple trackIds emit events simultaneously.
  // Only update the "Now" label when a genuinely new trackId is seen (new download started).
  // Lock per-file progress to that same track so neither label nor bar flickers.
  const seenTrackIds = useRef(new Set<string>())
  const nowTrackId = useRef('')
  const [nowTrack, setNowTrack] = useState('')
  const [fileProgress, setFileProgress] = useState({ bytesDownloaded: 0, bytesTotal: 0 })

  // D-PROG-EVENTS: subscribe on mount; return cleanup to prevent listener accumulation (Pitfall 1)
  useEffect(() => {
    const removeProgress = window.electronAPI.on('sync:progress', (p) => {
      updateProgress(p)
      if (!seenTrackIds.current.has(p.trackId)) {
        seenTrackIds.current.add(p.trackId)
        nowTrackId.current = p.trackId
        setNowTrack(p.trackName)
      }
      if (p.trackId === nowTrackId.current) {
        setFileProgress({ bytesDownloaded: p.bytesDownloaded, bytesTotal: p.bytesTotal })
      }
    })
    const removeComplete = window.electronAPI.on('sync:complete', (summary) => {
      setSummary(summary)
    })
    // WR-02: sync:error is declared in ipc-types.ts; subscribe so the renderer exits
    // the syncing state when the main process emits a fatal error (e.g. auth failure).
    const removeError = window.electronAPI.on('sync:error', () => {
      reset()
    })
    return () => {
      removeProgress()
      removeComplete()
      removeError()
    }
  }, [])

  const handleStop = () => {
    setStopping(true)
    cancel()
    window.electronAPI.sync.cancel()
  }

  // Derived display values
  const overallPct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0
  const filePct = fileProgress.bytesTotal > 0
    ? Math.round((fileProgress.bytesDownloaded / fileProgress.bytesTotal) * 100)
    : 0
  const toMB = (n: number) => (n / 1_048_576).toFixed(1)
  const done = progress?.current ?? 0
  const total = progress?.total ?? 0
  const remaining = Math.max(0, total - done)

  return (
    <div className="h-full bg-gray-900 text-gray-100 flex flex-col">
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
            {nowTrack ? `Now: ${nowTrack}` : 'Now: —'}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">File</span>
            <span className="text-sm text-gray-400">
              {fileProgress.bytesTotal > 0
                ? `${toMB(fileProgress.bytesDownloaded)} / ${toMB(fileProgress.bytesTotal)} MB`
                : '0.0 / 0.0 MB'}
            </span>
          </div>
          <ProgressBar value={filePct} size="sm" />
        </div>

        {/* Counter row — per UI-SPEC Copywriting Contract */}
        <p className="text-sm text-gray-400">
          ✔ {done} done  •  ⧖ {remaining} remaining  •  ✖ {failedCount} failed
        </p>
      </main>
    </div>
  )
}
