// src/main/lib/sync-engine.ts
// Pure sync orchestration layer — no ipcMain dependency, fully testable.
// Coordinates: orphan scan → manifest read → track fetch → download plan
//              → concurrent downloads → M3U8 write → manifest write → summary.
import { readdirSync, unlinkSync, writeFileSync } from 'fs'
import { join, relative, sep } from 'path'
import type { WebContents } from 'electron'
import pLimit from 'p-limit'
import { getPlaylistsApi } from '@jellyfin/sdk/lib/utils/api/playlists-api'
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getApi } from './jellyfin'
import {
  readManifest,
  writeManifest,
  needsDownload,
  isReferencedByOtherPlaylist,
} from './manifest'
import type { SyncManifest } from './manifest'
import { buildDownloadUrl, buildLocalPath, downloadTrack } from './downloader'
import { generateM3u8 } from './m3u8'
import type { M3u8ItemMeta } from './m3u8'
import { sanitizePathSegment } from './fs-utils'
import { store } from './store'
import type { SyncProgress, SyncSummary } from '../../../shared/ipc-types'

export interface SyncEngineOpts {
  playlistIds: string[]
  /** Optional map of playlistId → display name for M3U8 filenames and manifest storage. */
  playlistNames?: Record<string, string>
  destination: string
  concurrentDownloads: number
}

// ---------------------------------------------------------------------------
// Internal: Orphan .part file cleanup (D-ERR-ORPHANS)
// ---------------------------------------------------------------------------

/**
 * Recursively delete all *.part files in the destination root.
 * These are leftover from a previously interrupted sync run.
 * Ignores all errors (root may not exist yet on first run).
 */
function deleteOrphanedPartFiles(root: string): void {
  try {
    const entries = readdirSync(root, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(root, entry.name)
      if (entry.isDirectory()) {
        deleteOrphanedPartFiles(fullPath)
      } else if (entry.name.endsWith('.part')) {
        try {
          unlinkSync(fullPath)
        } catch {
          // ignore — file may have been deleted by another process
        }
      }
    }
  } catch {
    // ignore — root doesn't exist yet on first sync
  }
}

// ---------------------------------------------------------------------------
// Internal: Track metadata fetch from Jellyfin (paginated)
// ---------------------------------------------------------------------------

/**
 * Fetch all tracks in a playlist from Jellyfin.
 * Paginates with limit=500 and startIndex loop (Pitfall 2: default cap is 100).
 * Terminates on empty page (D-API-PAGINATION pattern from playlists.ts).
 */
async function fetchPlaylistTracks(
  playlistId: string,
  userId: string
): Promise<BaseItemDto[]> {
  const api = getApi()
  if (!api) throw new Error('Not authenticated. Please log in first.')

  const PAGE_SIZE = 500
  const results: BaseItemDto[] = []
  let startIndex = 0

  while (true) {
    const resp = await getPlaylistsApi(api).getPlaylistItems({
      playlistId,
      userId,
      startIndex,
      limit: PAGE_SIZE,
      fields: [ItemFields.MediaSources],
    })

    const items = resp.data.Items ?? []
    for (const item of items) {
      if (item.Id) results.push(item)
    }

    // Terminate on empty page — not on items.length < PAGE_SIZE (D-API-PAGINATION)
    if (items.length === 0) break
    startIndex += PAGE_SIZE
  }

  return results
}

// ---------------------------------------------------------------------------
// Internal: Progress event emission
// ---------------------------------------------------------------------------

/**
 * Safely send a progress event to the renderer.
 * Guards against destroyed webContents (window closed during sync).
 */
function emitProgress(webContents: WebContents, payload: SyncProgress): void {
  if (!webContents.isDestroyed()) {
    webContents.send('sync:progress', payload)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a full sync pipeline for the given playlist IDs to the destination folder.
 *
 * Pipeline:
 *   1. Delete orphaned *.part files from prior interrupted run (D-ERR-ORPHANS)
 *   2. Read sync manifest (corrupt/missing = EMPTY_MANIFEST = full re-sync)
 *   3. Fetch all tracks from Jellyfin for each playlist (paginated, limit=500)
 *   4. Build unified allTracksMeta map: itemId → BaseItemDto
 *   5. Build toDownload list: items where needsDownload() is true
 *   6. Build toDelete list: items removed from Jellyfin AND not referenced elsewhere
 *   7. Delete toDelete items from disk and manifest
 *   8. Concurrent downloads via p-limit; update manifest on success; emit progress
 *   9. Update manifest.playlists for each playlist with current itemIds
 *  10. Write M3U8 per playlist (sanitized filename, forward-slash paths)
 *  11. Write manifest atomically
 *  12. Return SyncSummary
 *
 * @param opts            Playlist IDs, destination path, concurrency level
 * @param webContents     Renderer webContents for pushing progress events
 * @param signal          AbortSignal for cancellation
 * @returns               SyncSummary with counts and failure log
 */
export async function runSync(
  opts: SyncEngineOpts,
  webContents: WebContents,
  signal: AbortSignal
): Promise<SyncSummary> {
  const { playlistIds, destination, concurrentDownloads, playlistNames = {} } = opts

  const summary: SyncSummary = {
    added: 0,
    removed: 0,
    unchanged: 0,
    failed: 0,
    failures: [],
    destination,  // resolved sync destination; surfaced in summary screen (POST-03)
  }

  // ── Step 1: Orphan scan ──────────────────────────────────────────────────
  deleteOrphanedPartFiles(destination)

  // ── Step 2: Read manifest ────────────────────────────────────────────────
  const manifest: SyncManifest = readManifest(destination)

  // ── Step 3: Fetch all track metadata from Jellyfin ───────────────────────
  const userId = store.get('userId')
  if (!userId) throw new Error('User ID not found. Please log in again.')

  // Map: playlistId → ordered list of BaseItemDto
  const playlistTracksMap = new Map<string, BaseItemDto[]>()
  // Map: playlistId → playlist name (for M3U8 filename)
  const playlistNameMap = new Map<string, string>()

  for (const playlistId of playlistIds) {
    const tracks = await fetchPlaylistTracks(playlistId, userId)
    playlistTracksMap.set(playlistId, tracks)

    // Resolve playlist name: caller-supplied name > existing manifest name > raw UUID fallback.
    // playlistNames is passed from the IPC layer which has access to the display names
    // returned by getPlaylists(). This prevents the UUID-as-name bug on first sync.
    const resolvedName =
      playlistNames[playlistId] ??
      manifest.playlists[playlistId]?.name ??
      playlistId
    playlistNameMap.set(playlistId, resolvedName)
  }

  // ── Step 4: Build unified track map ─────────────────────────────────────
  // Deduplication: if a track appears in multiple playlists, keep one entry.
  // allTracksMeta is the source of truth for downloads and M3U8 metadata.
  const allTracksMeta = new Map<string, BaseItemDto>()
  for (const tracks of playlistTracksMap.values()) {
    for (const item of tracks) {
      if (item.Id && !allTracksMeta.has(item.Id)) {
        allTracksMeta.set(item.Id, item)
      }
    }
  }

  // Keep in-memory map of { runTimeTicks, name } for M3U8 generation (step 10).
  // These come from Jellyfin metadata — not stored in manifest.
  const trackMetaForM3u8 = new Map<string, { runTimeTicks: number; name: string }>()
  for (const [id, item] of allTracksMeta) {
    trackMetaForM3u8.set(id, {
      runTimeTicks: item.RunTimeTicks ?? 0,
      name: item.Name ?? id,
    })
  }

  // ── Step 5: Build toDownload list ────────────────────────────────────────
  const toDownload: BaseItemDto[] = []
  for (const item of allTracksMeta.values()) {
    if (!item.Id) continue
    if (needsDownload(manifest, item.Id, destination)) {
      toDownload.push(item)
    } else {
      summary.unchanged++
    }
  }

  // ── Step 6: Build toDelete list ──────────────────────────────────────────
  // Only inspect playlists currently being synced (D-DEL-ABANDONED).
  // For each playlist's prior itemIds, check if the item was removed from Jellyfin.
  // Guard: isReferencedByOtherPlaylist checks ALL manifest playlists (D-DEL-SCOPE).
  const currentItemIdsByPlaylist = new Map<string, Set<string>>()
  for (const [playlistId, tracks] of playlistTracksMap) {
    currentItemIdsByPlaylist.set(playlistId, new Set(tracks.map((t) => t.Id!).filter(Boolean)))
  }

  const toDelete: string[] = []  // item IDs to delete
  for (const playlistId of playlistIds) {
    const priorItemIds = manifest.playlists[playlistId]?.itemIds ?? []
    const currentIds = currentItemIdsByPlaylist.get(playlistId) ?? new Set()
    for (const itemId of priorItemIds) {
      if (!currentIds.has(itemId)) {
        // Item removed from Jellyfin — check cross-playlist safety before queuing for deletion
        if (!isReferencedByOtherPlaylist(manifest, itemId, playlistIds)) {
          if (!toDelete.includes(itemId)) {
            toDelete.push(itemId)
          }
        }
      }
    }
  }

  // ── Step 7: Delete removed tracks ────────────────────────────────────────
  for (const itemId of toDelete) {
    const entry = manifest.items[itemId]
    if (!entry) continue

    // Reconstruct absolute path from forward-slash relative path (Pitfall 4)
    const absPath = join(destination, ...entry.localPath.split('/'))
    try {
      unlinkSync(absPath)
    } catch {
      // ignore — file may already be gone
    }
    delete manifest.items[itemId]
    summary.removed++
  }

  // ── Step 8: Download queue ───────────────────────────────────────────────
  // Determine which playlist each track belongs to for progress events.
  // A track may be in multiple playlists; use the first one found.
  const trackToPlaylistId = new Map<string, string>()
  for (const playlistId of playlistIds) {
    for (const track of (playlistTracksMap.get(playlistId) ?? [])) {
      if (track.Id && !trackToPlaylistId.has(track.Id)) {
        trackToPlaylistId.set(track.Id, playlistId)
      }
    }
  }

  const api = getApi()
  if (!api) throw new Error('Not authenticated. Please log in first.')
  // Always use the SDK's authorizationHeader — it includes all required Jellyfin fields:
  // MediaBrowser Client="...", Device="...", DeviceId="...", Version="...", Token="..."
  // The manual `MediaBrowser Token="..."` branch omitted required fields and was dead code.
  const authHeader = (api as unknown as { authorizationHeader: string }).authorizationHeader

  const totalTracks = toDownload.length
  let completedTracks = 0

  const limit = pLimit(Math.max(1, Math.min(5, concurrentDownloads)))

  /**
   * Download a single track, update manifest on success, emit progress.
   * On AbortError: re-throw to stop the queue.
   * On other errors: record failure, continue (D-ERR-SKIP).
   */
  async function downloadOne(item: BaseItemDto): Promise<void> {
    if (signal.aborted) return

    const itemId = item.Id!
    const artist = item.AlbumArtist || 'Unknown Artist'
    const album = item.Album || 'Unknown Album'
    const name = item.Name || itemId
    const container = item.Container ?? 'mp3'
    const mediaSourceId = item.MediaSources?.[0]?.Id ?? undefined

    const playlistId = trackToPlaylistId.get(itemId) ?? playlistIds[0]

    const destPath = buildLocalPath(destination, artist, album, name, container)
    const downloadUrl = buildDownloadUrl(api!.basePath, itemId, mediaSourceId)

    const baseProgress: Omit<SyncProgress, 'bytesDownloaded' | 'bytesTotal' | 'status'> = {
      playlistId,
      trackId: itemId,
      trackName: name,
      current: completedTracks + 1,
      total: totalTracks,
    }

    try {
      const fileSize = await downloadTrack(
        downloadUrl,
        authHeader,
        destPath,
        signal,
        (bytesReceived, total) => {
          emitProgress(webContents, {
            ...baseProgress,
            current: completedTracks + 1,
            bytesDownloaded: bytesReceived,
            bytesTotal: total,
            status: 'downloading',
          })
        }
      )

      // Store localPath as forward-slash relative path (Pitfall 4)
      const absPath = destPath
      const relPath = relative(destination, absPath).split(sep).join('/')

      manifest.items[itemId] = {
        id: itemId,
        localPath: relPath,
        fileSize,
        syncedAt: new Date().toISOString(),
      }

      completedTracks++
      summary.added++

      emitProgress(webContents, {
        ...baseProgress,
        current: completedTracks,
        bytesDownloaded: fileSize,
        bytesTotal: fileSize,
        status: 'complete',
      })
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string }
      // Cancellation: re-throw so Promise.allSettled records it but doesn't count as failure
      if (
        error.name === 'CanceledError' ||
        error.name === 'AbortError' ||
        signal.aborted
      ) {
        throw err
      }

      // Other errors: skip track, record failure (D-ERR-SKIP)
      const reason = error.message ?? String(err)
      summary.failed++
      summary.failures.push({ name, reason })

      completedTracks++
      emitProgress(webContents, {
        ...baseProgress,
        current: completedTracks,
        bytesDownloaded: 0,
        bytesTotal: 0,
        status: 'error',
        error: reason,
      })
    }
  }

  const downloadTasks = toDownload.map((item) => limit(() => downloadOne(item)))
  await Promise.allSettled(downloadTasks)

  // If sync was cancelled, skip writing manifest and M3U8 to avoid persisting
  // partial state. Orphaned .part files are already cleaned up by downloadOne's catch block.
  if (signal.aborted) {
    return { ...summary }
  }

  // ── Step 9: Update manifest.playlists ────────────────────────────────────
  for (const playlistId of playlistIds) {
    const tracks = playlistTracksMap.get(playlistId) ?? []
    const currentItemIds = tracks.map((t) => t.Id!).filter(Boolean)

    // Use the resolved name from playlistNameMap (caller-supplied > manifest > UUID fallback).
    // This ensures the display name is persisted on first sync instead of the raw UUID.
    const resolvedName = playlistNameMap.get(playlistId) ?? playlistId
    manifest.playlists[playlistId] = {
      id: playlistId,
      name: resolvedName,
      itemIds: currentItemIds,
    }
  }

  // ── Step 10: Write M3U8 files ─────────────────────────────────────────────
  for (const playlistId of playlistIds) {
    const manifestPlaylist = manifest.playlists[playlistId]
    if (!manifestPlaylist) continue

    // Build itemsMap from manifest entries filtered to this playlist's current itemIds.
    // runTimeTicks and name come from in-memory Jellyfin metadata (not stored in manifest).
    const itemsMap: Record<string, M3u8ItemMeta> = {}
    for (const itemId of manifestPlaylist.itemIds) {
      const manifestEntry = manifest.items[itemId]
      const meta = trackMetaForM3u8.get(itemId)
      if (manifestEntry && meta) {
        itemsMap[itemId] = {
          localPath: manifestEntry.localPath,
          runTimeTicks: meta.runTimeTicks,
          name: meta.name,
        }
      }
    }

    const m3u8Content = generateM3u8(manifestPlaylist, itemsMap, destination)
    // M3U8 filename: sanitized playlist name (T-03-03-05: prevents directory traversal)
    const safePlaylistName = sanitizePathSegment(manifestPlaylist.name)
    const m3u8Path = join(destination, `${safePlaylistName}.m3u8`)
    writeFileSync(m3u8Path, m3u8Content, 'utf-8')
  }

  // ── Step 11: Write manifest ───────────────────────────────────────────────
  // Atomic write (Pitfall 7: race with cancel) — always last operation.
  writeManifest(destination, manifest)

  // ── Step 12: Return summary ───────────────────────────────────────────────
  return summary
}
