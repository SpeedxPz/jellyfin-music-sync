// src/renderer/src/screens/LoginScreen.tsx
import { useState } from 'react'
import { useAuthStore } from '../store/authStore'

export default function LoginScreen() {
  const { setAuthenticated } = useAuthStore()

  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // reachableText shown below Connect in blue after ping succeeds
  const [reachableText, setReachableText] = useState<string | null>(null)

  const handleConnect = async () => {
    setError(null)
    setReachableText(null)
    // WR-04: Validate fields before hitting the network so the error message is accurate.
    if (!url.trim()) { setError('Server URL is required.'); return }
    if (!username.trim()) { setError('Username is required.'); return }
    if (!password) { setError('Password is required.'); return }
    setLoading(true)
    try {
      const result = await window.electronAPI.auth.login(url.trim(), username.trim(), password)
      // Ping was successful (otherwise auth:login would have thrown)
      // Show reachability briefly then transition — or just transition directly
      setAuthenticated({
        userId: result.userId,
        serverName: result.serverName,
        displayName: result.displayName,
        linuxPlaintextWarning: result.linuxPlaintextWarning,
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg border border-gray-600 p-6 max-w-sm w-full space-y-4">
        {/* App name — Display size */}
        <h1 className="text-2xl font-semibold text-center">Jellyfin Music Sync</h1>

        {/* Screen heading — Heading size */}
        <h2 className="text-xl font-semibold text-center text-gray-300">Connect to Jellyfin</h2>

        {/* Server URL */}
        <div className="space-y-1">
          <label htmlFor="server-url" className="text-sm font-semibold block">
            Server URL
          </label>
          <input
            id="server-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://jellyfin.example.com"
            disabled={loading}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 w-full placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
        </div>

        {/* Username */}
        <div className="space-y-1">
          <label htmlFor="username" className="text-sm font-semibold block">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 w-full placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
        </div>

        {/* Password with show/hide toggle */}
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-semibold block">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 w-full pr-10 placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-200"
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        {/* Connect button */}
        <button
          type="button"
          onClick={handleConnect}
          disabled={loading}
          className={`bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 w-full rounded transition-colors ${loading ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>

        {/* Inline feedback: reachability success OR error (mutually exclusive, same slot) */}
        {reachableText && !error && (
          <p className="text-blue-400 text-sm">{reachableText}</p>
        )}
        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
      </div>
    </div>
  )
}
