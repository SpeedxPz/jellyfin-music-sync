// src/main/lib/logger.ts
import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const logDir = app.getPath('logs')
const logPath = join(logDir, 'app.log')

mkdirSync(logDir, { recursive: true })

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`
  appendFileSync(logPath, line, 'utf-8')
}

export function getLogPath(): string {
  return logPath
}
