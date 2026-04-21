// tests/lib/m3u8.test.ts
import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { generateM3u8, type M3u8ItemMeta } from '../../src/main/lib/m3u8'
import type { ManifestPlaylist } from '../../src/main/lib/manifest'

const DEST_ROOT = '/music'

const playlist: ManifestPlaylist = {
  id: 'pl-1',
  name: 'My Playlist',
  itemIds: ['item-1', 'item-2', 'item-3'],
}

const itemsMap: Record<string, M3u8ItemMeta> = {
  'item-1': {
    localPath: 'Artist A/Album X/01 - Track One.flac',
    runTimeTicks: 180_000_000_00, // 180 seconds = 3 min
    name: 'Track One',
  },
  'item-2': {
    localPath: 'Artist B/Album Y/02 - Track Two.mp3',
    runTimeTicks: 240_000_000_00, // 240 seconds = 4 min
    name: 'Track Two',
  },
  // item-3 intentionally omitted (simulates failed download)
}

describe('generateM3u8', () => {
  it('starts with #EXTM3U header', () => {
    const result = generateM3u8(playlist, itemsMap, DEST_ROOT)
    expect(result.startsWith('#EXTM3U\n')).toBe(true)
  })

  it('includes #EXTINF line with duration and name', () => {
    const result = generateM3u8(playlist, itemsMap, DEST_ROOT)
    expect(result).toContain('#EXTINF:180,Track One')
    expect(result).toContain('#EXTINF:240,Track Two')
  })

  it('includes relative path with forward slashes after each #EXTINF', () => {
    const result = generateM3u8(playlist, itemsMap, DEST_ROOT)
    expect(result).toContain('Artist A/Album X/01 - Track One.flac')
    expect(result).toContain('Artist B/Album Y/02 - Track Two.mp3')
  })

  it('silently omits tracks missing from itemsMap (failed downloads)', () => {
    const result = generateM3u8(playlist, itemsMap, DEST_ROOT)
    // item-3 is not in itemsMap — should not appear
    expect(result).not.toContain('item-3')
  })

  it('uses forward slashes in paths regardless of OS separator', () => {
    const result = generateM3u8(playlist, itemsMap, DEST_ROOT)
    expect(result).not.toContain('\\')
  })

  it('rounds duration correctly — uses Math.round not Math.floor', () => {
    const pl: ManifestPlaylist = { id: 'pl-x', name: 'X', itemIds: ['item-x'] }
    const items: Record<string, M3u8ItemMeta> = {
      'item-x': {
        localPath: 'A/B/Track.flac',
        runTimeTicks: 185_500_000_0, // 18.55 seconds → rounds to 19
        name: 'Track X',
      },
    }
    const result = generateM3u8(pl, items, DEST_ROOT)
    expect(result).toContain('#EXTINF:19,Track X')
  })

  it('returns output ending with newline', () => {
    const result = generateM3u8(playlist, itemsMap, DEST_ROOT)
    expect(result.endsWith('\n')).toBe(true)
  })

  it('produces empty playlist (header only + newline) when all tracks missing', () => {
    const emptyPlaylist: ManifestPlaylist = {
      id: 'pl-empty',
      name: 'Empty',
      itemIds: ['missing-1', 'missing-2'],
    }
    const result = generateM3u8(emptyPlaylist, {}, DEST_ROOT)
    expect(result).toBe('#EXTM3U\n')
  })
})
