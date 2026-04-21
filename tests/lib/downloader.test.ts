// tests/lib/downloader.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildDownloadUrl, buildLocalPath, downloadTrack } from '../../src/main/lib/downloader'

describe('buildDownloadUrl', () => {
  it('builds correct URL with ?static=true', () => {
    const url = buildDownloadUrl('https://jellyfin.example.com', 'abc123')
    expect(url).toBe('https://jellyfin.example.com/Audio/abc123/stream?static=true')
  })

  it('encodes special characters in itemId', () => {
    const url = buildDownloadUrl('https://jellyfin.example.com', 'id with spaces')
    expect(url).toContain('id%20with%20spaces')
    expect(url).toContain('static=true')
  })

  it('appends mediaSourceId when provided', () => {
    const url = buildDownloadUrl('https://jellyfin.example.com', 'abc123', 'src-456')
    expect(url).toContain('mediaSourceId=src-456')
    expect(url).toContain('static=true')
  })

  it('omits mediaSourceId when not provided', () => {
    const url = buildDownloadUrl('https://jellyfin.example.com', 'abc123')
    expect(url).not.toContain('mediaSourceId')
  })
})

describe('buildLocalPath', () => {
  const destRoot = '/music'

  it('constructs path with sanitized artist/album/filename segments', () => {
    const result = buildLocalPath(destRoot, 'AC/DC', 'Back in Black', 'Highway to Hell', 'flac')
    // AC/DC sanitized to AC_DC; path segments joined with OS sep
    expect(result).toContain('AC_DC')
    expect(result).toContain('Back in Black')
    expect(result).toContain('Highway to Hell.flac')
  })

  it('uses Unknown Artist for empty artist', () => {
    const result = buildLocalPath(destRoot, '', 'Album', 'Track', 'mp3')
    expect(result).toContain('Unknown Artist')
  })

  it('uses Unknown Album for empty album', () => {
    const result = buildLocalPath(destRoot, 'Artist', '', 'Track', 'mp3')
    expect(result).toContain('Unknown Album')
  })

  it('trims trailing spaces from name before adding extension', () => {
    const result = buildLocalPath(destRoot, 'Artist', 'Album', 'Track   ', 'flac')
    // Should not contain trailing spaces before .flac
    expect(result).toContain('Track.flac')
    expect(result).not.toContain('Track   .flac')
  })

  it('root path is always destRoot', () => {
    const result = buildLocalPath(destRoot, 'Artist', 'Album', 'Track', 'mp3')
    expect(result.startsWith(destRoot)).toBe(true)
  })
})

describe('downloadTrack', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'jms-dl-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('downloads file to destPath and returns file size', async () => {
    // Mock axios to return a simple readable stream
    const { Readable } = await import('stream')
    const content = Buffer.from('fake audio content here')
    const mockStream = Readable.from([content])

    vi.mock('axios', () => ({
      default: vi.fn().mockResolvedValue({
        data: mockStream,
        headers: { 'content-length': String(content.length) },
      }),
    }))

    const axios = (await import('axios')).default as ReturnType<typeof vi.fn>

    const destPath = join(tmpDir, 'Artist', 'Album', 'Track.flac')
    const signal = new AbortController().signal
    const chunks: Array<{ received: number; total: number }> = []

    const { downloadTrack: dl } = await import('../../src/main/lib/downloader')
    const size = await dl(
      'https://jellyfin.example.com/Audio/abc/stream?static=true',
      'MediaBrowser Token="abc"',
      destPath,
      signal,
      (received, total) => chunks.push({ received, total })
    )

    expect(existsSync(destPath)).toBe(true)
    expect(size).toBe(content.length)
    expect(chunks.length).toBeGreaterThan(0)
    expect(existsSync(`${destPath}.part`)).toBe(false)
  })

  it('deletes .part file on download error', async () => {
    const { Readable } = await import('stream')

    // Stream that errors mid-way
    const errorStream = new Readable({
      read() {
        this.emit('error', new Error('network error'))
      },
    })

    vi.mock('axios', () => ({
      default: vi.fn().mockResolvedValue({
        data: errorStream,
        headers: {},
      }),
    }))

    const destPath = join(tmpDir, 'Artist', 'Album', 'Track.flac')
    const signal = new AbortController().signal

    const { downloadTrack: dl } = await import('../../src/main/lib/downloader')
    await expect(
      dl('https://example.com', 'Token="x"', destPath, signal, () => {})
    ).rejects.toThrow()

    // .part file must be cleaned up
    expect(existsSync(`${destPath}.part`)).toBe(false)
  })
})
