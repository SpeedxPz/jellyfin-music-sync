// src/main/lib/manifest.ts
import { join } from 'path'
import { existsSync, statSync } from 'fs'
import { atomicWriteJson, safeReadJson } from './fs-utils'

export interface ManifestItem {
  id: string          // Jellyfin item ID
  localPath: string   // relative to destination root, ALWAYS forward slashes
  fileSize: number    // bytes — from statSync after download (not Content-Length)
  syncedAt: string    // ISO 8601 timestamp
}

export interface ManifestPlaylist {
  id: string          // Jellyfin playlist ID
  name: string        // Jellyfin playlist name (display only)
  itemIds: string[]   // ordered list of item IDs in this playlist
}

export interface SyncManifest {
  version: 1
  items: Record<string, ManifestItem>
  playlists: Record<string, ManifestPlaylist>
}

export const EMPTY_MANIFEST: SyncManifest = { version: 1, items: {}, playlists: {} }

const MANIFEST_FILENAME = '_jellyfin-sync.json'

/**
 * Read the sync manifest from the destination root.
 * Returns EMPTY_MANIFEST on any error (missing file, corrupt JSON, wrong version).
 * Corrupt manifest = full re-sync (D-MANIFEST-ATOMIC).
 */
export function readManifest(destRoot: string): SyncManifest {
  const filePath = join(destRoot, MANIFEST_FILENAME)
  const parsed = safeReadJson<unknown>(filePath, null)
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as SyncManifest).version !== 1
  ) {
    return { ...EMPTY_MANIFEST, items: {}, playlists: {} }
  }
  const m = parsed as SyncManifest
  return {
    version: 1,
    items: m.items ?? {},
    playlists: m.playlists ?? {},
  }
}

/**
 * Write the sync manifest atomically to the destination root.
 * Uses atomicWriteJson (tmp → rename) — never writes in-place (D-MANIFEST-ATOMIC).
 */
export function writeManifest(destRoot: string, manifest: SyncManifest): void {
  const filePath = join(destRoot, MANIFEST_FILENAME)
  atomicWriteJson(filePath, manifest)
}

/**
 * Returns true if the track needs to be downloaded.
 * A track can be skipped only when: it has a manifest entry AND the file exists on
 * disk AND the file size matches the manifest entry (SYNC-05).
 */
export function needsDownload(
  manifest: SyncManifest,
  itemId: string,
  destRoot: string
): boolean {
  const entry = manifest.items[itemId]
  if (!entry) return true                              // not in manifest

  // Convert stored forward-slash path back to OS path for stat check
  const absPath = join(destRoot, ...entry.localPath.split('/'))
  if (!existsSync(absPath)) return true                // file missing from disk

  const stat = statSync(absPath)
  return stat.size !== entry.fileSize                  // size mismatch → re-download
}

/**
 * Returns true if any playlist in the manifest (NOT in currentPlaylistIds) references this item.
 * Used to prevent deletion of shared tracks (D-DEL-SCOPE, SYNC-07).
 */
export function isReferencedByOtherPlaylist(
  manifest: SyncManifest,
  itemId: string,
  currentPlaylistIds: string[]
): boolean {
  return Object.values(manifest.playlists)
    .filter((pl) => !currentPlaylistIds.includes(pl.id))
    .some((pl) => pl.itemIds.includes(itemId))
}
