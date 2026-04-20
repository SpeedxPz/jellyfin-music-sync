// src/main/ipc/auth.ts
import { ipcMain, safeStorage } from 'electron'
import { store } from '../lib/store'
import { log } from '../lib/logger'
import {
  createJellyfinApi,
  getApi,
  clearApi,
  getSystemApi,
  getUserApi,
  getSessionApi,
} from '../lib/jellyfin'
import type { AuthResult } from '../../../shared/ipc-types'

// axios is bundled with @jellyfin/sdk — detect Axios errors via err?.response?.status
function isAxiosError(err: unknown): err is { response?: { status: number }; code?: string } {
  return typeof err === 'object' && err !== null && ('response' in err || 'code' in err)
}

export function registerAuthHandlers(): void {
  // ── auth:login ────────────────────────────────────────────────────────────
  // AUTH-01, AUTH-02, AUTH-03
  // 1. Ping server (AUTH-02): GET /System/Info/Public — no auth required
  // 2. Authenticate with username+password (AUTH-01)
  // 3. Encrypt and persist token (AUTH-03) + return AuthResult
  ipcMain.handle(
    'auth:login',
    async (_evt, url: string, username: string, password: string): Promise<AuthResult> => {
      // Step 1 — Server reachability (D-SERVER-VALIDATE, T-02-02-01)
      const api = createJellyfinApi(url)
      let serverName = 'Jellyfin'

      try {
        const sysInfo = await getSystemApi(api).getPublicSystemInfo()
        serverName = sysInfo.data.ServerName ?? 'Jellyfin'
      } catch (err) {
        // No HTTP response = network error (ECONNREFUSED, ETIMEDOUT, DNS)
        if (isAxiosError(err) && !err.response) {
          throw new Error('Could not reach server. Check the URL and try again.')
        }
        // Got an HTTP response but it's not a valid Jellyfin /System/Info/Public reply
        throw new Error('URL reached but not a Jellyfin server. Is the URL correct?')
      }

      // Step 2 — Authenticate (AUTH-01)
      let accessToken: string
      let userId: string
      let serverId: string
      let displayName: string

      try {
        const resp = await getUserApi(api).authenticateUserByName({
          authenticateUserByName: { Username: username, Pw: password },
        })
        accessToken = resp.data.AccessToken ?? ''
        userId = resp.data.User?.Id ?? ''
        serverId = resp.data.ServerId ?? ''
        displayName = resp.data.User?.Name ?? ''
        // Attach token to API instance for subsequent calls this session
        api.accessToken = accessToken
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 401) {
          throw new Error('Login failed. Check your username and password.')
        }
        throw err
      }

      // Step 3 — Persist token (AUTH-03, D-AUTH-STORAGE, D-AUTH-LINUX, T-02-02-02)
      const canEncrypt = safeStorage.isEncryptionAvailable()
      const linuxPlaintextWarning = !canEncrypt
      let storedToken: string

      if (canEncrypt) {
        storedToken = safeStorage.encryptString(accessToken).toString('base64')
      } else {
        // D-AUTH-LINUX: plaintext fallback on Linux without libsecret/kwallet
        storedToken = accessToken
        log('WARN', 'safeStorage unavailable — storing token as plaintext (Linux fallback)')
      }

      store.set({
        serverUrl: url,
        userId,
        encryptedToken: storedToken,
        displayName,
        serverName,
      })
      log('INFO', `Login success: user=${displayName}, server=${serverName}`)

      return {
        userId,
        accessToken,
        serverId,
        serverName,
        displayName,
        linuxPlaintextWarning,
      }
    }
  )

  // ── auth:getStatus ────────────────────────────────────────────────────────
  // AUTH-03: Restore session on app startup from persisted credentials.
  // Returns { connected: true, serverName } if stored token found.
  // Returns { connected: false } if no token (fresh install or after logout).
  ipcMain.handle(
    'auth:getStatus',
    async (): Promise<{
      connected: boolean
      serverName?: string
      displayName?: string
      userId?: string
      linuxPlaintextWarning?: boolean
    }> => {
      const encryptedToken = store.get('encryptedToken')
      if (!encryptedToken) return { connected: false }

      try {
        const canEncrypt = safeStorage.isEncryptionAvailable()
        const token = canEncrypt
          ? safeStorage.decryptString(Buffer.from(encryptedToken, 'base64'))
          : encryptedToken // Linux plaintext fallback

        const serverUrl = store.get('serverUrl')
        if (!serverUrl) return { connected: false }

        const api = createJellyfinApi(serverUrl)
        api.accessToken = token

        return {
          connected: true,
          serverName: store.get('serverName'),
          displayName: store.get('displayName'),
          userId: store.get('userId'),
          linuxPlaintextWarning: !canEncrypt,
        }
      } catch {
        // Decryption failure or corrupt stored data — treat as not connected
        log('WARN', 'auth:getStatus failed to restore session — clearing stored credentials')
        store.set({
          serverUrl: '',
          userId: '',
          encryptedToken: '',
          displayName: '',
          serverName: '',
        })
        return { connected: false }
      }
    }
  )

  // ── auth:logout ───────────────────────────────────────────────────────────
  // AUTH-04: Revoke server session and clear all stored credentials.
  ipcMain.handle('auth:logout', async (): Promise<void> => {
    const api = getApi()
    if (api) {
      try {
        await getSessionApi(api).reportSessionEnded()
      } catch {
        // Best-effort: clear local credentials even if server call fails
      }
    }
    store.set({
      serverUrl: '',
      userId: '',
      encryptedToken: '',
      displayName: '',
      serverName: '',
    })
    clearApi()
    log('INFO', 'User logged out')
  })
}
