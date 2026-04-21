// src/renderer/src/screens/SyncSummaryScreen.tsx
import { useState } from 'react'
import { useSyncStore } from '../store/syncStore'

export default function SyncSummaryScreen() {
  const { summary, canceled, reset } = useSyncStore()
  const [showFailures, setShowFailures] = useState(false)

  // Guard: summary should always exist when syncPhase='summary', but handle null defensively
  if (!summary) return null

  const handleOpenDestination = () => {
    if (!summary.destination) return
    window.electronAPI.shell.openPath(summary.destination)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-600 px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">Jellyfin Music Sync</span>
        {/* Back to playlists — calls reset() which sets syncPhase='idle' → App shows PlaylistBrowserScreen */}
        <button
          type="button"
          onClick={reset}
          className="text-blue-400 hover:text-blue-300 text-sm min-h-[44px]"
        >
          Back to playlists
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col p-6 gap-6">
        {/* D-SUMMARY-LAYOUT: heading (D-CANCEL-STATE: canceled flag drives label) */}
        <h1 className="text-xl font-semibold">
          {canceled ? 'Sync Canceled' : 'Sync Complete'}
        </h1>

        {/* Count rows — per UI-SPEC §SyncSummaryScreen */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-400 w-4">✔</span>
            <span className="text-gray-100">{summary.added} added</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-400 w-4">🗑</span>
            <span className="text-gray-100">{summary.removed} removed</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-400 w-4">⏭</span>
            <span className="text-gray-100">{summary.unchanged} unchanged</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-red-400 w-4">✖</span>
            <span className="text-gray-100">{summary.failed} failed</span>
          </div>
        </div>

        {/* D-FAILURES: expandable failures section — only when failures.length > 0 */}
        {summary.failures.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowFailures((v) => !v)}
              aria-expanded={showFailures}
              className="text-sm text-red-400 cursor-pointer hover:text-red-300"
            >
              {showFailures
                ? '▴ hide details'
                : `✖ ${summary.failures.length} failed — show details ▾`}
            </button>
            {showFailures && (
              <ul className="mt-2 space-y-1">
                {summary.failures.map((f, i) => (
                  <li key={i} className="text-sm text-gray-400">
                    • {f.name} — {f.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* POST-03: Open destination folder — disabled if destination is empty (edge case guard) */}
        <button
          type="button"
          onClick={handleOpenDestination}
          disabled={!summary.destination}
          className={`border border-gray-600 text-gray-100 hover:bg-gray-800 rounded py-2 px-4 text-sm font-semibold w-full ${
            !summary.destination ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        >
          Open destination folder
        </button>
      </main>
    </div>
  )
}
