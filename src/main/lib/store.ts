// src/main/lib/store.ts
import { Conf } from 'electron-conf/main'
import type { Settings } from '../../../shared/ipc-types'

const schema = {
  type: 'object',
  properties: {
    lastDestination: { type: 'string' },
    concurrentDownloads: { type: 'number', minimum: 1, maximum: 5 },
  },
  required: ['lastDestination', 'concurrentDownloads'],
} as const

const defaults: Settings = {
  lastDestination: '',
  concurrentDownloads: 3, // D-04: default is 3
}

export const store = new Conf<Settings>({ schema, defaults })
