// src/main/lib/fs-utils.ts
import sanitize from 'sanitize-filename'
import { writeFileSync, renameSync, readFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

/**
 * Sanitize a single path segment for FAT32 compatibility.
 *
 * APPLY PER SEGMENT — never to full paths containing slashes.
 * Correct: path.join(sanitizePathSegment(artist), sanitizePathSegment(album), sanitizePathSegment(file))
 * Wrong:   sanitizePathSegment(`${artist}/${album}/${file}`)
 *
 * Handles:
 * - Illegal chars: \ / : * ? " < > | and control chars 0x00–0x1F
 * - Windows reserved names: CON, PRN, AUX, NUL, COM0–9, LPT0–9 (with or without extension)
 * - Trailing dots and trailing spaces
 * - 255-byte length limit
 *
 * Returns '_' for empty or whitespace-only input.
 */
export function sanitizePathSegment(segment: string): string {
  // Pre-trim trailing whitespace: FAT32 forbids trailing spaces, and
  // sanitize-filename replaces them with '_' rather than stripping them.
  // Trimming before sanitization avoids spurious trailing underscores.
  const sanitized = sanitize(segment.trimEnd(), { replacement: '_' })
  if (!sanitized || sanitized.trim() === '') {
    return '_'
  }
  return sanitized
}

/**
 * Write JSON atomically: write to <path>.tmp, then rename to final path.
 *
 * The .tmp file is always in the same directory as the target — never in
 * os.tmpdir() — to guarantee same-volume placement and avoid EXDEV errors.
 */
export function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  // renameSync is atomic on same-volume writes.
  // .tmp is co-located with target — EXDEV cannot occur.
  renameSync(tmpPath, filePath)
}

/**
 * Read and parse a JSON file, returning fallback on any error.
 * Handles missing files, corrupt JSON, and permission errors.
 */
export function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
