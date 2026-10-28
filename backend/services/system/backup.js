import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { ensureDir, resolvePath } from '../store/fsutil.js'

const BACKUP_DIR = resolvePath('database/backups')

export function createBackupArchive() {
  ensureDir(BACKUP_DIR)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `ciwa-telecom-${stamp}.tar.gz`
  const target = path.join(BACKUP_DIR, name)
  const root = resolvePath('.')
  const includes = ['config/ciwa', 'config/asterisk'].filter((rel) => fs.existsSync(path.join(root, rel)))
  if (!includes.length) {
    const error = new Error('چیزی برای پشتیبان‌گیری پیدا نشد.')
    error.status = 404
    throw error
  }
  execFileSync('tar', ['-czf', target, ...includes], { cwd: root })
  return {
    ok: true,
    file: path.relative(root, target),
    name,
    size: fs.statSync(target).size,
    createdAt: new Date().toISOString(),
  }
}

export function resolveBackupFile(name) {
  const safe = String(name || '').trim()
  if (!safe || safe.includes('..') || safe.includes('/') || !safe.endsWith('.tar.gz')) {
    const error = new Error('نام فایل پشتیبان نامعتبر است.')
    error.status = 400
    throw error
  }
  const full = path.join(BACKUP_DIR, safe)
  if (!fs.existsSync(full)) {
    const error = new Error('فایل پشتیبان پیدا نشد.')
    error.status = 404
    throw error
  }
  return full
}

const ALLOWED_PREFIXES = ['config/ciwa/', 'config/asterisk/']

export function assertBackupMembers(listing) {
  const names = String(listing || '').split('\n').map((line) => line.trim()).filter(Boolean)
  if (!names.length) {
    const error = new Error('بایگانی پشتیبان خالی است.')
    error.status = 400
    throw error
  }
  for (const name of names) {
    const normalized = name.replace(/\\/g, '/')
    if (normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').includes('..')) {
      const error = new Error('بایگانی پشتیبان مسیر غیرمجاز دارد.')
      error.status = 400
      throw error
    }
    if (!ALLOWED_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) {
      const error = new Error('بایگانی پشتیبان فقط می‌تواند config/ciwa و config/asterisk را داشته باشد.')
      error.status = 400
      throw error
    }
  }
  return names
}

export function restoreBackupArchive(name) {
  const archive = resolveBackupFile(name)
  const root = resolvePath('.')
  const listing = execFileSync('tar', ['-tzf', archive], { cwd: root, encoding: 'utf8' })
  assertBackupMembers(listing)
  execFileSync('tar', ['-xzf', archive, '-C', root, '--no-absolute-names'], { cwd: root })
  return { ok: true, restored: name, at: new Date().toISOString() }
}

export function listBackups() {
  ensureDir(BACKUP_DIR)
  return fs.readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.tar.gz'))
    .map((name) => {
      const full = path.join(BACKUP_DIR, name)
      const stat = fs.statSync(full)
      return { name, size: stat.size, modifiedAt: stat.mtime.toISOString() }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}
