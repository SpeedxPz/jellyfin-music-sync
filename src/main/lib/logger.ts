// src/main/lib/logger.ts
import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// Lazy-initialized: app.getPath('logs') must not be called before app.whenReady().
// The first call to log() or getLogPath() triggers initialization.
let _logPath: string | null = null

function ensureLogPath(): string {
  if (!_logPath) {
    const logDir = app.getPath('logs')
    mkdirSync(logDir, { recursive: true })
    _logPath = join(logDir, 'app.log')
  }
  return _logPath
}

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`
  appendFileSync(ensureLogPath(), line, 'utf-8')
}

export function getLogPath(): string {
  return ensureLogPath()
}
