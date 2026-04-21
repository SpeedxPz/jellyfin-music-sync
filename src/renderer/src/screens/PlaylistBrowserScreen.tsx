// src/renderer/src/screens/PlaylistBrowserScreen.tsx
import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'

interface Playlist {
  id: string
  name: string
  trackCount: number
}

export default function PlaylistBrowserScreen() {
  const { displayName, serverName, linuxPlaintextWarning, clearAuth } = useAuthStore()

  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Fetch playlists on mount (LIB-01)
  useEffect(() => {
    window.electronAPI.sync
      .getPlaylists()
      .then((data) => {
        setPlaylists(data)
        setLoading(false)
      })
      .catch((err) => {
        setError((err as Error).message)
        setLoading(false)
      })
  }, [])

  // Client-side filter (D-FILTER, LIB-04): case-insensitive substring match
  const visible = playlists.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  )

  // Toggle a playlist's selection (LIB-03)
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Sync handler — opens native folder picker in main process, then runs sync (D-DEST-PICKER)
  const handleSyncSelected = async () => {
    if (selected.size === 0) return
    setSyncing(true)
    setSyncError(null)
    try {
      await window.electronAPI.sync.start({
        playlistIds: Array.from(selected),
        destination: '',        // destination is resolved in main process via dialog (D-DEST-PICKER)
        concurrentDownloads: 3, // default; Phase 4 exposes settings UI
        playlistNames: Object.fromEntries(
          playlists.filter((p) => selected.has(p.id)).map((p) => [p.id, p.name])
        ),
      })
    } catch (err) {
      setSyncError((err as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  // Logout handler (AUTH-04, D-UI-LOGOUT)
  const handleLogout = async () => {
    try {
      await window.electronAPI.auth.logout()
    } catch {
      // Best-effort: clear local state regardless of server call result
    }
    clearAuth()
    // App.tsx re-renders to LoginScreen automatically (authenticated becomes false)
  }

  const selectedCount = selected.size
  const selectionLabel =
    selectedCount === 1 ? '1 playlist selected' : `${selectedCount} playlists selected`

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header bar */}
      <header className="bg-gray-800 border-b border-gray-600 px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">Jellyfin Music Sync</span>
        <button
          type="button"
          onClick={handleLogout}
          className="text-red-400 hover:text-red-300 text-sm"
        >
          Log out
        </button>
      </header>

      {/* Linux plaintext warning banner (D-AUTH-LINUX) — shown when safeStorage unavailable */}
      {linuxPlaintextWarning && (
        <div className="bg-yellow-900/40 border-y border-yellow-700 text-yellow-300 text-sm px-6 py-2">
          Warning: Secure storage is unavailable on this system. Your login token is stored in plaintext.
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col p-6 gap-4">
        {/* Logged in as */}
        <div className="text-sm text-gray-400">
          <p>Logged in as: {displayName}</p>
          <p>{serverName}</p>
        </div>

        {/* Section heading */}
        <h2 className="text-xl font-semibold">Your Playlists</h2>

        {/* Filter input (LIB-04) */}
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name..."
          className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 w-full placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />

        {/* Playlist list area */}
        <div className="flex-1">
          {loading && (
            <div className="flex items-center gap-3 py-12 justify-center">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Loading playlists...</span>
            </div>
          )}

          {!loading && error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {!loading && !error && visible.length === 0 && (
            <p className="text-sm text-gray-400">
              {filter
                ? 'No playlists match your filter. Try a different name.'
                : 'No playlists found on this server. Create a playlist in Jellyfin and sync again.'}
            </p>
          )}

          {!loading && !error && visible.length > 0 && (
            <ul>
              {visible.map((playlist) => (
                // WR-02: <input> is a sibling of <label>, not nested inside <button>.
                // Selection is driven solely by the checkbox onChange — no double-toggle risk.
                <li key={playlist.id} className="flex items-center gap-3 px-4 rounded hover:bg-gray-700">
                  <input
                    type="checkbox"
                    id={`pl-${playlist.id}`}
                    checked={selected.has(playlist.id)}
                    onChange={() => toggleSelect(playlist.id)}
                    className="accent-blue-500 w-4 h-4 flex-shrink-0"
                  />
                  {/* Label covers name + track count so the full row is clickable */}
                  <label
                    htmlFor={`pl-${playlist.id}`}
                    className="flex-1 flex items-center min-h-[44px] cursor-pointer gap-3"
                  >
                    {/* Playlist name */}
                    <span className="text-sm font-semibold flex-1">{playlist.name}</span>
                    {/* Track count (D-SIZE-EST — track count only, no size in MB) */}
                    <span className="text-sm text-gray-400">
                      {playlist.trackCount === 1 ? '1 track' : `${playlist.trackCount} tracks`}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer: selection count + Sync button */}
        <div className="space-y-2">
          <p className="text-sm text-gray-400">{selectionLabel}</p>
          <button
            type="button"
            disabled={selectedCount === 0 || syncing}
            aria-label={selectedCount === 0 ? 'Select at least one playlist to sync' : undefined}
            onClick={handleSyncSelected}
            className={`bg-blue-600 text-white font-semibold py-2 w-full rounded transition-colors ${
              selectedCount === 0 || syncing
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-blue-700'
            }`}
          >
            {syncing ? 'Syncing...' : 'Sync Selected'}
          </button>
          {syncError && (
            <p className="text-red-400 text-sm">{syncError}</p>
          )}
        </div>
      </main>
    </div>
  )
}
