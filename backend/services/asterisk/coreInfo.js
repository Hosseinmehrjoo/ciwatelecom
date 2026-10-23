import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../..')

export function resolveAsteriskSourceDir() {
  const configured = process.env.ASTERISK_SOURCE_DIR
  if (configured) return path.resolve(repoRoot, configured)
  return path.join(repoRoot, 'core', 'asterisk')
}

export function readCoreInfo() {
  const sourceDir = resolveAsteriskSourceDir()
  const present = fs.existsSync(path.join(sourceDir, 'main', 'asterisk.c'))
  let version = 'unknown'
  let branch = null

  const configureAc = path.join(sourceDir, 'configure.ac')
  if (fs.existsSync(configureAc)) {
    const text = fs.readFileSync(configureAc, 'utf8')
    const match = text.match(/AC_INIT\(\[asterisk\],\s*\[([^\]]+)\]/)
    if (match) version = match[1]
  }

  const versionFile = path.join(sourceDir, '.version')
  if (fs.existsSync(versionFile)) {
    version = fs.readFileSync(versionFile, 'utf8').trim() || version
  }

  try {
    const head = fs.readFileSync(path.join(sourceDir, '.git', 'HEAD'), 'utf8').trim()
    if (head.startsWith('ref:')) branch = head.replace('ref: refs/heads/', '').trim()
    else branch = head.slice(0, 12)
  } catch {
    branch = null
  }

  const sampleManager = path.join(sourceDir, 'configs', 'samples', 'manager.conf.sample')
  const samplePjsip = path.join(sourceDir, 'configs', 'samples', 'pjsip.conf.sample')

  return {
    present,
    sourceDir: path.relative(repoRoot, sourceDir),
    version,
    branch,
    hasMakefile: fs.existsSync(path.join(sourceDir, 'Makefile')),
    samples: {
      manager: fs.existsSync(sampleManager),
      pjsip: fs.existsSync(samplePjsip),
    },
    touched: false,
  }
}
