// tests/store/syncStore.test.ts
// Wave 0 stubs — production file: src/renderer/src/store/syncStore.ts
// Run: npm test -- tests/store/syncStore.test.ts
import { describe, it } from 'vitest'

describe('useSyncStore', () => {
  it.todo('initial state: syncPhase=idle, canceled=false, progress=null, summary=null, destination=""')
  it.todo('startSync(dest): sets syncPhase=syncing, canceled=false, destination=dest, progress=null, summary=null')
  it.todo('updateProgress(p): sets progress to provided SyncProgress object')
  it.todo('setSummary(s): sets syncPhase=summary and summary to provided SyncSummary object')
  it.todo('cancel(): sets canceled=true, syncPhase unchanged')
  it.todo('reset(): sets syncPhase=idle, canceled=false, progress=null, summary=null')
})
