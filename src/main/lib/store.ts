// src/main/lib/store.ts
import { Conf } from 'electron-conf/main'
import type { Settings } from '../../../shared/ipc-types'

// Schema cast avoids the strict ajv JSONSchemaType `required` constraint — per D-01 (01-04),
// adding `required` to the schema causes init errors on fresh config before defaults apply.
// Defaults alone ensure field presence; schema is used for type validation only.
const schema = {
  type: 'object',
  properties: {
    lastDestination: { type: 'string' },
    concurrentDownloads: { type: 'number', minimum: 1, maximum: 5 },
    serverUrl: { type: 'string' },
    userId: { type: 'string' },
    encryptedToken: { type: 'string' },
    displayName: { type: 'string' },
    serverName: { type: 'string' },
  },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const defaults: Settings = {
  lastDestination: '',
  concurrentDownloads: 3, // D-04: default is 3
  serverUrl: '',
  userId: '',
  encryptedToken: '',
  displayName: '',
  serverName: '',
}

export const store = new Conf<Settings>({ schema, defaults })
