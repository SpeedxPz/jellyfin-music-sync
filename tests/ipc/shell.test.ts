// tests/ipc/shell.test.ts
// Wave 0 stubs — production file: src/main/ipc/shell.ts
// Run: npm test -- tests/ipc/shell.test.ts
import { describe, it } from 'vitest'

describe('registerShellHandlers', () => {
  it.todo('registers shell:openPath ipcMain handler')
  it.todo('shell:openPath with valid path: calls shell.openPath(path) and resolves')
  it.todo('shell:openPath with empty string: returns without calling shell.openPath')
  it.todo('shell:openPath when shell.openPath returns error string: rejects with Error(errorString)')
})
