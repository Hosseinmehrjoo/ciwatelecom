import fs from 'node:fs'
import dgram from 'node:dgram'
import { resolvePath, ensureDir } from '../store/fsutil.js'
import { startTftpServer } from './tftpServer.js'

let managedSocket = null
let managedMeta = { running: false, port: null, root: null, error: null, startedAt: null }

export function tftpRoot() {
  const root = resolvePath('tftp')
  ensureDir(root)
  return root
}

export function getTftpStatus() {
  return {
    running: Boolean(managedSocket),
    port: managedMeta.port || Number(process.env.CIWA_TFTP_PORT || 69),
    root: 'tftp',
    absoluteRoot: tftpRoot(),
    error: managedMeta.error,
    startedAt: managedMeta.startedAt,
    files: listProvisioningFiles(),
  }
}

export function listProvisioningFiles() {
  const root = tftpRoot()
  try {
    return fs.readdirSync(root)
      .filter((name) => name.endsWith('.cnf.xml') || name === 'dialplan.xml' || name.endsWith('.loads') || name.endsWith('.sbn') || name.endsWith('.zz'))
      .sort()
  } catch {
    return []
  }
}

function portLikelyBusy(error) {
  const code = error?.code || ''
  return code === 'EADDRINUSE' || code === 'EACCES'
}

async function udpPortFree(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4')
    socket.once('error', () => {
      try { socket.close() } catch { /* ignore */ }
      resolve(false)
    })
    socket.bind(port, host, () => {
      socket.close(() => resolve(true))
    })
  })
}

export async function ensureTftpServer() {
  if (managedSocket) return getTftpStatus()
  const root = tftpRoot()
  const preferred = Number(process.env.CIWA_TFTP_PORT || 69)
  const candidates = preferred === 69 ? [69, 6969] : [preferred]
  let lastError = null
  for (const port of candidates) {
    try {
      const free = await udpPortFree(port)
      if (!free && port === preferred) {
        // Another process may already serve TFTP (systemd). Treat as available externally.
        managedMeta = {
          running: true,
          port,
          root,
          error: null,
          startedAt: managedMeta.startedAt || new Date().toISOString(),
          external: true,
        }
        return {
          ...getTftpStatus(),
          running: true,
          note: `پورت UDP ${port} از قبل در حال استفاده است؛ فرض بر این است که TFTP سیستم فعال است.`,
        }
      }
      const socket = await startTftpServer({ root, port, host: process.env.CIWA_TFTP_BIND || '0.0.0.0' })
      managedSocket = socket
      managedMeta = {
        running: true,
        port,
        root,
        error: null,
        startedAt: new Date().toISOString(),
        external: false,
      }
      socket.on('error', (error) => {
        managedMeta.error = error instanceof Error ? error.message : String(error)
      })
      socket.on('close', () => {
        managedSocket = null
        managedMeta.running = false
      })
      return {
        ...getTftpStatus(),
        note: port === 69
          ? 'سرویس TFTP داخلی روی پورت ۶۹ فعال شد.'
          : `سرویس TFTP داخلی روی پورت ${port} فعال شد. برای گوشی سیسکو معمولاً پورت ۶۹ لازم است؛ واحد systemd را ترجیح دهید.`,
      }
    } catch (error) {
      lastError = error
      if (!portLikelyBusy(error)) break
    }
  }
  const message = lastError instanceof Error ? lastError.message : 'راه‌اندازی TFTP ناموفق بود.'
  managedMeta.error = message
  const hint = /EACCES|permission/i.test(message)
    ? ' برای پورت ۶۹ دسترسی root لازم است. روی سرور: sudo ./scripts/install/start-cisco-tftp.sh یا واحد systemd ciwa-tftp.'
    : ''
  const error = new Error(`TFTP بالا نیامد: ${message}.${hint}`)
  error.status = 503
  throw error
}

export async function stopManagedTftp() {
  if (!managedSocket) return getTftpStatus()
  await new Promise((resolve) => {
    try {
      managedSocket.close(() => resolve())
    } catch {
      resolve()
    }
  })
  managedSocket = null
  managedMeta = { running: false, port: null, root: null, error: null, startedAt: null }
  return getTftpStatus()
}
