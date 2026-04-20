// src/renderer/src/store/authStore.ts
// Zustand auth store — renderer-side auth state.
// NEVER store the raw accessToken here. Main process manages the token.
// This store holds auth metadata for UI rendering and screen routing only.
import { create } from 'zustand'
import type { AuthResult } from '../../../../shared/ipc-types'

interface AuthState {
  // Auth metadata (no raw token — token lives in main process electron-conf)
  authenticated: boolean
  userId: string | null
  serverName: string | null
  displayName: string | null
  linuxPlaintextWarning: boolean

  // Actions
  setAuthenticated: (result: Pick<AuthResult, 'userId' | 'serverName' | 'displayName' | 'linuxPlaintextWarning'>) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  authenticated: false,
  userId: null,
  serverName: null,
  displayName: null,
  linuxPlaintextWarning: false,

  setAuthenticated: (result) =>
    set({
      authenticated: true,
      userId: result.userId,
      serverName: result.serverName,
      displayName: result.displayName,
      linuxPlaintextWarning: result.linuxPlaintextWarning ?? false,
    }),

  clearAuth: () =>
    set({
      authenticated: false,
      userId: null,
      serverName: null,
      displayName: null,
      linuxPlaintextWarning: false,
    }),
}))
