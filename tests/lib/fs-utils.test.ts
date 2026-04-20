// tests/lib/fs-utils.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { sanitizePathSegment, atomicWriteJson, safeReadJson } from '../../src/main/lib/fs-utils'

describe('sanitizePathSegment', () => {
  it('strips forward slash in AC/DC', () => {
    expect(sanitizePathSegment('AC/DC')).toBe('AC_DC')
  })

  it('does not return CON for reserved name CON', () => {
    expect(sanitizePathSegment('CON')).not.toBe('CON')
  })

  it('does not return NUL.flac for reserved name with extension', () => {
    expect(sanitizePathSegment('NUL.flac')).not.toBe('NUL.flac')
  })

  it('does not return CON.mp3 for reserved name with extension', () => {
    expect(sanitizePathSegment('CON.mp3')).not.toBe('CON.mp3')
  })

  it('preserves leading dots in ...And Justice For All', () => {
    const result = sanitizePathSegment('...And Justice For All')
    expect(result).toMatch(/^\.\.\./)
  })

  it('strips trailing spaces', () => {
    expect(sanitizePathSegment('track   ')).toBe('track')
  })

  it('returns _ for empty string', () => {
    expect(sanitizePathSegment('')).toBe('_')
  })

  it('returns _ for whitespace-only string', () => {
    expect(sanitizePathSegment('   ')).toBe('_')
  })
})

describe('atomicWriteJson / safeReadJson', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'jms-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('round-trips JSON data', () => {
    const filePath = join(tmpDir, 'data.json')
    const data = { foo: 'bar', n: 42 }
    atomicWriteJson(filePath, data)
    expect(safeReadJson(filePath, null)).toEqual(data)
  })

  it('returns fallback for missing file', () => {
    expect(safeReadJson(join(tmpDir, 'missing.json'), 'fallback')).toBe('fallback')
  })

  it('returns fallback for corrupt JSON', () => {
    const filePath = join(tmpDir, 'corrupt.json')
    atomicWriteJson(filePath, 'not-json-then-corrupted')
    // overwrite with corrupt content
    writeFileSync(filePath, '{bad json', 'utf-8')
    expect(safeReadJson(filePath, null)).toBeNull()
  })

  it('creates intermediate directories', () => {
    const filePath = join(tmpDir, 'a', 'b', 'c', 'data.json')
    atomicWriteJson(filePath, { ok: true })
    expect(safeReadJson(filePath, null)).toEqual({ ok: true })
  })

  it('does not leave .tmp file after successful write', () => {
    const { existsSync } = require('fs')
    const filePath = join(tmpDir, 'data.json')
    atomicWriteJson(filePath, { x: 1 })
    expect(existsSync(`${filePath}.tmp`)).toBe(false)
  })
})
