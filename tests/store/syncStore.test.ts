// tests/store/syncStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useSyncStore } from '../../src/renderer/src/store/syncStore'
import type { SyncProgress, SyncSummary } from '../../shared/ipc-types'

const mockProgress: SyncProgress = {
  playlistId: 'pl-1', trackId: 'tr-1', trackName: 'Test Track',
  current: 5, total: 10, bytesDownloaded: 1024, bytesTotal: 4096,
  status: 'downloading',
}

const mockSummary: SyncSummary = {
  added: 3, removed: 1, unchanged: 10, failed: 0, failures: [], destination: '/tmp/dest',
}

beforeEach(() => {
  useSyncStore.setState({ syncPhase: 'idle', canceled: false, progress: null, summary: null, destination: '' })
})

describe('useSyncStore', () => {
  it('initial state: syncPhase=idle, canceled=false, progress=null, summary=null, destination=""', () => {
    const state = useSyncStore.getState()
    expect(state.syncPhase).toBe('idle')
    expect(state.canceled).toBe(false)
    expect(state.progress).toBeNull()
    expect(state.summary).toBeNull()
    expect(state.destination).toBe('')
  })

  it('startSync(dest): sets syncPhase=syncing, canceled=false, destination=dest, progress=null, summary=null', () => {
    useSyncStore.getState().startSync('/media/usb')
    const state = useSyncStore.getState()
    expect(state.syncPhase).toBe('syncing')
    expect(state.canceled).toBe(false)
    expect(state.destination).toBe('/media/usb')
    expect(state.progress).toBeNull()
    expect(state.summary).toBeNull()
  })

  it('updateProgress(p): sets progress to provided SyncProgress object', () => {
    useSyncStore.getState().updateProgress(mockProgress)
    expect(useSyncStore.getState().progress).toEqual(mockProgress)
  })

  it('setSummary(s): sets syncPhase=summary and summary to provided SyncSummary object', () => {
    useSyncStore.getState().setSummary(mockSummary)
    const state = useSyncStore.getState()
    expect(state.syncPhase).toBe('summary')
    expect(state.summary).toEqual(mockSummary)
  })

  it('cancel(): sets canceled=true, syncPhase unchanged', () => {
    useSyncStore.getState().startSync('/media/usb')
    useSyncStore.getState().cancel()
    const state = useSyncStore.getState()
    expect(state.canceled).toBe(true)
    expect(state.syncPhase).toBe('syncing')  // syncPhase not changed by cancel alone
  })

  it('reset(): sets syncPhase=idle, canceled=false, progress=null, summary=null', () => {
    useSyncStore.getState().startSync('/media/usb')
    useSyncStore.getState().cancel()
    useSyncStore.getState().setSummary(mockSummary)
    useSyncStore.getState().reset()
    const state = useSyncStore.getState()
    expect(state.syncPhase).toBe('idle')
    expect(state.canceled).toBe(false)
    expect(state.progress).toBeNull()
    expect(state.summary).toBeNull()
  })
})
