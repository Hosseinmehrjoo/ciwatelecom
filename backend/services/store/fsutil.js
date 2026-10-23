import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(__dirname, '../../..')

export function resolvePath(...parts) {
  return path.join(repoRoot, ...parts)
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return structuredClone(fallback)
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return structuredClone(fallback)
  }
}

export function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath))
  const temp = `${filePath}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  fs.renameSync(temp, filePath)
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
