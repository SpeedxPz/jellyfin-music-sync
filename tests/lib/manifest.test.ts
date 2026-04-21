// tests/lib/manifest.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  EMPTY_MANIFEST,
  readManifest,
  writeManifest,
  needsDownload,
  isReferencedByOtherPlaylist,
  type ManifestItem,
  type ManifestPlaylist,
  type SyncManifest,
} from '../../src/main/lib/manifest'

describe('EMPTY_MANIFEST', () => {
  it('has version 1', () => {
    expect(EMPTY_MANIFEST.version).toBe(1)
  })

  it('has empty items and playlists', () => {
    expect(EMPTY_MANIFEST.items).toEqual({})
    expect(EMPTY_MANIFEST.playlists).toEqual({})
  })
})

describe('readManifest', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'jms-manifest-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns EMPTY_MANIFEST when file does not exist', () => {
    const result = readManifest(tmpDir)
    expect(result.version).toBe(1)
    expect(result.items).toEqual({})
    expect(result.playlists).toEqual({})
  })

  it('returns EMPTY_MANIFEST for corrupt JSON', () => {
    writeFileSync(join(tmpDir, '_jellyfin-sync.json'), '{bad json', 'utf-8')
    const result = readManifest(tmpDir)
    expect(result.version).toBe(1)
    expect(result.items).toEqual({})
  })

  it('returns EMPTY_MANIFEST for wrong version', () => {
    writeFileSync(
      join(tmpDir, '_jellyfin-sync.json'),
      JSON.stringify({ version: 2, items: {}, playlists: {} }),
      'utf-8'
    )
    const result = readManifest(tmpDir)
    expect(result.items).toEqual({})
  })

  it('round-trips a valid manifest', () => {
    const manifest: SyncManifest = {
      version: 1,
      items: {
        'item-1': {
          id: 'item-1',
          localPath: 'Artist/Album/Track.flac',
          fileSize: 1234,
          syncedAt: '2024-01-01T00:00:00.000Z',
        },
      },
      playlists: {
        'pl-1': { id: 'pl-1', name: 'My Playlist', itemIds: ['item-1'] },
      },
    }
    writeManifest(tmpDir, manifest)
    const result = readManifest(tmpDir)
    expect(result.version).toBe(1)
    expect(result.items['item-1'].localPath).toBe('Artist/Album/Track.flac')
    expect(result.playlists['pl-1'].name).toBe('My Playlist')
  })
})

describe('writeManifest', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'jms-manifest-write-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes _jellyfin-sync.json to destRoot', () => {
    writeManifest(tmpDir, EMPTY_MANIFEST)
    const { existsSync } = require('fs')
    expect(existsSync(join(tmpDir, '_jellyfin-sync.json'))).toBe(true)
  })

  it('does not leave .tmp file after successful write', () => {
    writeManifest(tmpDir, EMPTY_MANIFEST)
    const { existsSync } = require('fs')
    expect(existsSync(join(tmpDir, '_jellyfin-sync.json.tmp'))).toBe(false)
  })
})

describe('needsDownload', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'jms-needs-dl-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns true when item not in manifest', () => {
    expect(needsDownload(EMPTY_MANIFEST, 'item-1', tmpDir)).toBe(true)
  })

  it('returns true when file missing from disk', () => {
    const manifest: SyncManifest = {
      version: 1,
      items: {
        'item-1': {
          id: 'item-1',
          localPath: 'Artist/Album/Track.flac',
          fileSize: 100,
          syncedAt: '2024-01-01T00:00:00.000Z',
        },
      },
      playlists: {},
    }
    expect(needsDownload(manifest, 'item-1', tmpDir)).toBe(true)
  })

  it('returns true when file size does not match manifest', () => {
    const relPath = 'Artist/Album/Track.flac'
    const absPath = join(tmpDir, 'Artist', 'Album', 'Track.flac')
    mkdirSync(join(tmpDir, 'Artist', 'Album'), { recursive: true })
    writeFileSync(absPath, Buffer.alloc(50)) // 50 bytes on disk
    const manifest: SyncManifest = {
      version: 1,
      items: {
        'item-1': {
          id: 'item-1',
          localPath: relPath,
          fileSize: 100, // manifest says 100 bytes
          syncedAt: '2024-01-01T00:00:00.000Z',
        },
      },
      playlists: {},
    }
    expect(needsDownload(manifest, 'item-1', tmpDir)).toBe(true)
  })

  it('returns false when file exists with correct size', () => {
    const absPath = join(tmpDir, 'Artist', 'Album', 'Track.flac')
    mkdirSync(join(tmpDir, 'Artist', 'Album'), { recursive: true })
    writeFileSync(absPath, Buffer.alloc(100)) // 100 bytes
    const manifest: SyncManifest = {
      version: 1,
      items: {
        'item-1': {
          id: 'item-1',
          localPath: 'Artist/Album/Track.flac',
          fileSize: 100,
          syncedAt: '2024-01-01T00:00:00.000Z',
        },
      },
      playlists: {},
    }
    expect(needsDownload(manifest, 'item-1', tmpDir)).toBe(false)
  })
})

describe('isReferencedByOtherPlaylist', () => {
  const manifest: SyncManifest = {
    version: 1,
    items: {},
    playlists: {
      'pl-1': { id: 'pl-1', name: 'Playlist 1', itemIds: ['item-1', 'item-2'] },
      'pl-2': { id: 'pl-2', name: 'Playlist 2', itemIds: ['item-2', 'item-3'] },
      'pl-3': { id: 'pl-3', name: 'Playlist 3', itemIds: ['item-4'] },
    },
  }

  it('returns false when item is only in the current playlist', () => {
    // item-1 is only in pl-1; we are syncing pl-1 => not referenced by other
    expect(isReferencedByOtherPlaylist(manifest, 'item-1', ['pl-1'])).toBe(false)
  })

  it('returns true when item is in another playlist not being synced', () => {
    // item-2 is in pl-1 and pl-2; we are syncing only pl-1 => pl-2 still references it
    expect(isReferencedByOtherPlaylist(manifest, 'item-2', ['pl-1'])).toBe(true)
  })

  it('returns false when all playlists referencing item are in currentPlaylistIds', () => {
    // item-2 is in pl-1 and pl-2; we are syncing both => no other playlist references it
    expect(isReferencedByOtherPlaylist(manifest, 'item-2', ['pl-1', 'pl-2'])).toBe(false)
  })

  it('returns false when item is not referenced anywhere', () => {
    expect(isReferencedByOtherPlaylist(manifest, 'item-99', ['pl-1'])).toBe(false)
  })

  it('returns true when item is in a completely separate playlist', () => {
    // item-4 is only in pl-3; we are syncing pl-1 => pl-3 references it
    expect(isReferencedByOtherPlaylist(manifest, 'item-4', ['pl-1'])).toBe(true)
  })
})
