// src/main/lib/m3u8.ts
import { join, relative, sep } from 'path'
import type { ManifestPlaylist } from './manifest'

export interface M3u8ItemMeta {
  localPath: string       // relative to destRoot, forward slashes (from manifest)
  runTimeTicks: number    // Jellyfin 100-ns ticks
  name: string            // track display name
}

/**
 * Generate M3U8 playlist file content.
 * Tracks missing from itemsMap (failed downloads) are omitted.
 * Paths use forward slashes for cross-platform portability (M3U8-02).
 * Duration derived from RunTimeTicks / 10_000_000 (M3U8-03).
 */
export function generateM3u8(
  playlist: ManifestPlaylist,
  itemsMap: Record<string, M3u8ItemMeta>,
  destRoot: string
): string {
  const lines: string[] = ['#EXTM3U']
  for (const itemId of playlist.itemIds) {
    const item = itemsMap[itemId]
    if (!item) continue  // failed download — omit from M3U8

    const durationSec = Math.round(item.runTimeTicks / 10_000_000)
    // Reconstruct absolute path from forward-slash relative path, then re-relativize
    const absPath = join(destRoot, ...item.localPath.split('/'))
    const relPath = relative(destRoot, absPath).split(sep).join('/')
    lines.push(`#EXTINF:${durationSec},${item.name}`)
    lines.push(relPath)
  }
  return lines.join('\n') + '\n'
}
