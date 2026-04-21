// src/renderer/src/App.tsx
// Phase 4: 3-state router (D-SCREEN, D-ROUTER).
// LoginScreen shown when not authenticated (D-UI-LAYOUT).
// SyncScreen shown when syncPhase='syncing'.
// SyncSummaryScreen shown when syncPhase='summary'.
// PlaylistBrowserScreen shown when authenticated and idle.
// Auth state hydrated from auth:getStatus IPC on mount (AUTH-03 session restore).
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { useSyncStore } from './store/syncStore'
import LoginScreen from './screens/LoginScreen'
import PlaylistBrowserScreen from './screens/PlaylistBrowserScreen'
import SyncScreen from './screens/SyncScreen'
import SyncSummaryScreen from './screens/SyncSummaryScreen'

export default function App() {
  const { authenticated, setAuthenticated } = useAuthStore()
  const syncPhase = useSyncStore((s) => s.syncPhase)

  useEffect(() => {
    // Restore session from persisted credentials on startup (AUTH-03).
    // auth:getStatus decrypts stored token and reconstructs the Api instance.
    window.electronAPI.auth
      .getStatus()
      .then((status) => {
        if (status.connected) {
          setAuthenticated({
            userId: status.userId ?? '',
            serverName: status.serverName ?? '',
            displayName: status.displayName ?? '',
            linuxPlaintextWarning: status.linuxPlaintextWarning ?? false,
          })
        }
      })
      .catch(() => {
        // WR-03: Non-fatal — IPC failure on startup shows Login screen for re-auth.
        // No console.error in renderer; main process logger is the right channel.
      })
  }, [])

  if (!authenticated) return <LoginScreen />
  if (syncPhase === 'syncing') return <SyncScreen />
  if (syncPhase === 'summary') return <SyncSummaryScreen />
  return <PlaylistBrowserScreen />
}
