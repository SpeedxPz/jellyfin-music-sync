// src/main/lib/downloader.ts
import { createWriteStream, unlinkSync, statSync, mkdirSync, renameSync } from 'fs'
import { dirname, join } from 'path'
import { pipeline } from 'stream/promises'
import { PassThrough } from 'stream'
import axios from 'axios'
import { sanitizePathSegment } from './fs-utils'

/**
 * Build the Jellyfin static audio stream URL.
 * ?static=true forces original format with no transcoding (SYNC-02).
 * mediaSourceId selects the default media source when multi-version items exist.
 */
export function buildDownloadUrl(
  basePath: string,
  itemId: string,
  mediaSourceId?: string
): string {
  const url = new URL(`${basePath}/Audio/${encodeURIComponent(itemId)}/stream`)
  url.searchParams.set('static', 'true')
  if (mediaSourceId) {
    url.searchParams.set('mediaSourceId', mediaSourceId)
  }
  return url.toString()
}

/**
 * Build the local destination path for a track.
 * Each segment is sanitized independently for FAT32 (SYNC-04).
 * NEVER call sanitizePathSegment on the full path — only per-segment.
 */
export function buildLocalPath(
  destRoot: string,
  artist: string,
  album: string,
  name: string,
  container: string
): string {
  const safeArtist = sanitizePathSegment(artist || 'Unknown Artist')
  const safeAlbum = sanitizePathSegment(album || 'Unknown Album')
  // trimEnd() before sanitization prevents trailing-space replacement with '_'
  const safeFile = sanitizePathSegment(`${name.trimEnd()}.${container}`)
  return join(destRoot, safeArtist, safeAlbum, safeFile)
}

/**
 * Download a single track to destPath.
 * - Writes to destPath + '.part' during download
 * - Renames to destPath on success
 * - Deletes .part file on any error (D-ERR-CLEANUP)
 * - Returns final file size from statSync (not Content-Length — avoids Pitfall 5)
 * - Uses PassThrough transform for chunk counting (avoids double-consuming the readable)
 *
 * @param url         Full download URL including ?static=true
 * @param authHeader  api.authorizationHeader value
 * @param destPath    Final file path (not .part)
 * @param signal      AbortSignal from AbortController (cancellation)
 * @param onChunk     Called on each chunk: (bytesReceived, totalBytes)
 * @returns           Final file size in bytes
 */
export async function downloadTrack(
  url: string,
  authHeader: string,
  destPath: string,
  signal: AbortSignal,
  onChunk: (bytesReceived: number, total: number) => void
): Promise<number> {
  const partPath = `${destPath}.part`
  mkdirSync(dirname(destPath), { recursive: true })

  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: { Authorization: authHeader },
      signal,
    })

    const total = parseInt(String(response.headers['content-length'] ?? '0'), 10)
    let bytesReceived = 0

    // PassThrough transform: count bytes without double-consuming the readable
    const counter = new PassThrough()
    counter.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length
      onChunk(bytesReceived, total)
    })

    const writeStream = createWriteStream(partPath)
    await pipeline(response.data, counter, writeStream)

    // Rename .part → final only on full success (static import — not dynamic)
    renameSync(partPath, destPath)

    // Use statSync for fileSize — Content-Length unreliable for chunked transfers
    return statSync(destPath).size
  } catch (err) {
    // D-ERR-CLEANUP: always delete .part on error, even if it doesn't exist yet
    try { unlinkSync(partPath) } catch { /* ignore */ }
    throw err
  }
}
