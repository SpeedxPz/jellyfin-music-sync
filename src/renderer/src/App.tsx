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
      .catch((err) => {
        // Non-fatal: if getStatus fails, show Login screen so user can re-authenticate
        console.error('auth:getStatus failed on startup', err)
      })
  }, [])

  return authenticated ? <PlaylistBrowserScreen /> : <LoginScreen />
}
