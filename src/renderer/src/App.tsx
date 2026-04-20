// src/renderer/src/App.tsx
// Phase 2: Two-screen auth router.
// LoginScreen shown when not authenticated (D-UI-LAYOUT).
// PlaylistBrowserScreen shown when authenticated.
// Auth state hydrated from auth:getStatus IPC on mount (AUTH-03 session restore).
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import LoginScreen from './screens/LoginScreen'
import PlaylistBrowserScreen from './screens/PlaylistBrowserScreen'

export default function App() {
  const { authenticated, setAuthenticated } = useAuthStore()

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

  return authenticated ? <PlaylistBrowserScreen /> : <LoginScreen />
}
