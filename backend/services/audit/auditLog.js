import fs from 'node:fs'
import { ensureDir, resolvePath } from '../store/fsutil.js'

const AUDIT_DIR = resolvePath('logs/audit')

export function writeAudit(entry) {
  ensureDir(AUDIT_DIR)
  const line = JSON.stringify({
    at: new Date().toISOString(),
    ...entry,
  })
  fs.appendFileSync(`${AUDIT_DIR}/audit.jsonl`, `${line}\n`, 'utf8')
}

export function listAudit({ limit = 200 } = {}) {
  const file = `${AUDIT_DIR}/audit.jsonl`
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  return lines
    .slice(-limit)
    .reverse()
    .map((line) => {
      try { return JSON.parse(line) } catch { return { at: null, raw: line } }
    })
}
