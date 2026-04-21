// src/renderer/src/store/syncStore.ts
// Drives the 3-state App.tsx router (D-SCREEN, D-ROUTER).
import { create } from 'zustand'
import type { SyncProgress, SyncSummary } from '../../../../shared/ipc-types'

export type SyncPhase = 'idle' | 'syncing' | 'summary'

interface SyncState {
  syncPhase: SyncPhase
  canceled: boolean
  progress: SyncProgress | null
  summary: SyncSummary | null
  destination: string          // cached when sync starts; surfaced in summary (D-SUMMARY-DESTINATION)

  startSync: (destination: string) => void
  updateProgress: (p: SyncProgress) => void
  setSummary: (s: SyncSummary) => void
  cancel: () => void            // sets canceled=true; used to choose "Sync Canceled" vs "Sync Complete" (D-CANCEL-STATE)
  reset: () => void             // returns to idle; called by "Back to playlists" button
}

export const useSyncStore = create<SyncState>()((set) => ({
  syncPhase: 'idle',
  canceled: false,
  progress: null,
  summary: null,
  destination: '',

  startSync: (destination) =>
    set({ syncPhase: 'syncing', canceled: false, progress: null, summary: null, destination }),
  updateProgress: (p) => set({ progress: p }),
  setSummary: (s) => set({ syncPhase: 'summary', summary: s }),
  cancel: () => set({ canceled: true }),
  reset: () => set({ syncPhase: 'idle', canceled: false, progress: null, summary: null }),
}))
