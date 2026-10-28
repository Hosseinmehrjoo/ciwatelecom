import fs from 'node:fs'
import path from 'node:path'
import { readCoreInfo } from './coreInfo.js'
import { generateAsteriskConfigs } from './generateConf.js'
import { probeAmi } from './ami.js'
import { loadPbx, removeItem, savePbx, upsertItem, collectionIdField } from '../store/pbxStore.js'
import { normalizeCollectionItem, validateCollectionItem } from './pbxNormalize.js'
import { assertChannel, assertDialToken } from './confSafe.js'
import { resolvePath } from '../store/fsutil.js'

function withLive(meta = {}) {
  return async function attach() {
    const ami = await probeAmi()
    return {
      connected: ami.connected,
      amiError: ami.error,
      core: readCoreInfo(),
      live: ami.live,
      ...meta,
      amiProbe: ami,
    }
  }
}

export async function getOverview() {
  const pbx = loadPbx()
  const ami = await probeAmi()
  const cdr = listCdrFiles().slice(0, 5)
  return {
    product: 'CIWA Telecom',
    connected: ami.connected,
    amiError: ami.error,
    core: readCoreInfo(),
    live: ami.live,
    kpis: {
      extensions: pbx.extensions.length,
      trunks: pbx.trunks.length,
      queues: pbx.queues.length,
      activeCalls: ami.live?.channels ?? 0,
      todaysCalls: cdr.length,
      inboundRoutes: pbx.inboundRoutes.length,
      outboundRoutes: pbx.outboundRoutes.length,
    },
    recentCalls: cdr,
    generatedAt: new Date().toISOString(),
  }
}

export async function getStatus() {
  const pbx = loadPbx()
  const ami = await probeAmi()
  return {
    connected: ami.connected,
    amiError: ami.error,
    core: readCoreInfo(),
    live: ami.live,
    ami: {
      host: process.env.AMI_HOST || pbx.ami.bindIp,
      port: Number(process.env.AMI_PORT || pbx.ami.port),
      username: process.env.AMI_USERNAME || pbx.ami.username,
      enabled: pbx.ami.enabled,
    },
    sip: pbx.sip,
    configDir: 'config/asterisk',
  }
}

export async function listCollection(key) {
  const pbx = loadPbx()
  const ami = await probeAmi()
  return {
    connected: ami.connected,
    amiError: ami.error,
    items: (pbx[key] || []).map(maskSecrets),
  }
}

async function reloadAsteriskIfConnected() {
  const ami = await probeAmi()
  if (ami.connected) {
    try { await ami.client.reload() } catch { /* config written; reload may need CLI path */ }
  }
  return ami
}

export async function saveCollectionItem(key, item) {
  const normalized = validateCollectionItem(key, normalizeCollectionItem(key, item))
  const idField = collectionIdField(key)
  const existing = loadPbx()
  const list = existing[key] || []
  const id = normalized[idField] || normalized.id || normalized.number
  const prev = list.find((row) => String(row[idField]) === String(id) || String(row.id) === String(id))
  if (!normalized.secret || normalized.secret === '********') {
    if (prev?.secret) normalized.secret = prev.secret
    else delete normalized.secret
  }
  if (!normalized.pin || normalized.pin === '********') {
    if (prev?.pin) normalized.pin = prev.pin
    else delete normalized.pin
  }
  const pbx = await upsertItem(key, normalized, idField)
  const generated = generateAsteriskConfigs(pbx)
  const ami = await reloadAsteriskIfConnected()
  const saved = (pbx[key] || []).find((row) => String(row[idField]) === String(normalized[idField])) || normalized
  return { item: maskSecrets(saved), generated, connected: ami.connected }
}

export async function deleteCollectionItem(key, id) {
  const pbx = await removeItem(key, id)
  const generated = generateAsteriskConfigs(pbx)
  const ami = await reloadAsteriskIfConnected()
  return { ok: true, generated, count: (pbx[key] || []).length, connected: ami.connected }
}

export async function saveSipSettings(sip) {
  const pbx = loadPbx()
  pbx.sip = { ...pbx.sip, ...sip }
  await savePbx(pbx)
  return { sip: pbx.sip, generated: generateAsteriskConfigs(pbx) }
}

export async function saveAmiSettings(amiSettings) {
  const pbx = loadPbx()
  const next = { ...amiSettings }
  if (!next.secret || next.secret === '********') delete next.secret
  pbx.ami = { ...pbx.ami, ...next }
  await savePbx(pbx)
  return { ami: { ...pbx.ami, secret: pbx.ami.secret ? '********' : '' }, generated: generateAsteriskConfigs(pbx) }
}

export async function regenerateConfigs() {
  return generateAsteriskConfigs(loadPbx())
}

export async function listChannels() {
  const ami = await probeAmi()
  if (!ami.connected) return { connected: false, amiError: ami.error, items: [] }
  try {
    const result = await ami.client.showChannels()
    const items = (result.events || [])
      .filter((event) => event.Event === 'CoreShowChannel')
      .map((event) => ({
        channel: event.Channel,
        callerId: event.CallerIDNum,
        connectedLine: event.ConnectedLineNum,
        state: event.ChannelStateDesc,
        application: event.Application,
        duration: event.Duration,
      }))
    return { connected: true, amiError: null, items }
  } catch (error) {
    return { connected: false, amiError: error instanceof Error ? error.message : 'channel list failed', items: [] }
  }
}

export async function originateCall({ extension, destination, callerId }) {
  const ext = assertDialToken(extension, 'داخلی')
  const dest = assertDialToken(destination, 'مقصد')
  const ami = await probeAmi()
  if (!ami.connected) {
    const error = new Error(ami.error || 'مرکز تلفن به هسته وصل نیست.')
    error.status = 503
    throw error
  }
  const response = await ami.client.originate({
    extension: ext,
    destination: dest,
    callerId: callerId || `${ext} <${ext}>`,
  })
  return { ok: true, response, extension: ext, destination: dest }
}

export async function hangupChannel(channel) {
  const safeChannel = assertChannel(channel)
  const ami = await probeAmi()
  if (!ami.connected) {
    const error = new Error(ami.error || 'مرکز تلفن به هسته وصل نیست.')
    error.status = 503
    throw error
  }
  const response = await ami.client.hangup(safeChannel)
  return { ok: true, response }
}

export async function softphoneBootstrap() {
  const pbx = loadPbx()
  const status = await getStatus()
  return {
    product: 'CIWA Telecom',
    connected: status.connected,
    amiError: status.amiError,
    sip: {
      host: pbx.sip.externalIp || '127.0.0.1',
      sipPort: pbx.sip.sipPort,
      wssPort: pbx.sip.wssPort || 8089,
      udpEnabled: pbx.sip.udpEnabled,
      wssEnabled: Boolean(pbx.sip.wssEnabled),
    },
    extensions: (pbx.extensions || []).map((item) => ({
      id: item.id || item.number,
      number: item.number,
      name: item.name || item.number,
      voicemail: Boolean(item.voicemail),
    })),
  }
}

export function listCdrFiles() {
  const dir = resolvePath('storage/cdr')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.csv') || name.endsWith('.json'))
  const rows = []
  for (const file of files) {
    const full = path.join(dir, file)
    const text = fs.readFileSync(full, 'utf8').trim()
    if (!text) continue
    if (file.endsWith('.json')) {
      try {
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) rows.push(...parsed)
      } catch { /* skip */ }
      continue
    }
    const lines = text.split(/\r?\n/).filter(Boolean)
    const start = lines[0].toLowerCase().includes('calldate') || lines[0].toLowerCase().includes('src') ? 1 : 0
    for (const line of lines.slice(start)) {
      const parts = line.split(',')
      if (parts.length < 5) continue
      rows.push({
        id: `${file}-${rows.length + 1}`,
        startedAt: parts[0],
        from: parts[1],
        to: parts[2],
        disposition: parts[4] || parts[3] || '',
        duration: parts[3] || '',
        direction: 'unknown',
        sourceFile: file,
      })
    }
  }
  return rows.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
}

export async function listPjsipEndpoints() {
  const ami = await probeAmi()
  if (!ami.connected) return { connected: false, amiError: ami.error, items: [] }
  try {
    const result = await ami.client.pjsipEndpoints()
    const items = (result.events || [])
      .filter((event) => event.Event === 'EndpointList')
      .map((event) => ({
        objectName: event.ObjectName,
        transport: event.Transport,
        deviceState: event.DeviceState,
        contacts: event.Contacts,
      }))
    return { connected: true, amiError: null, items }
  } catch (error) {
    return { connected: false, amiError: error instanceof Error ? error.message : 'endpoint list failed', items: [] }
  }
}

export async function listQueueStatus() {
  const ami = await probeAmi()
  if (!ami.connected) return { connected: false, amiError: ami.error, items: [] }
  try {
    const result = await ami.client.queueStatus()
    const items = (result.events || [])
      .filter((event) => event.Event === 'QueueParams' || event.Event === 'QueueMember')
      .map((event) => ({ ...event }))
    return { connected: true, amiError: null, items }
  } catch (error) {
    return { connected: false, amiError: error instanceof Error ? error.message : 'queue status failed', items: [] }
  }
}

export async function setQueueMemberPause({ member, paused, reason }) {
  const ami = await probeAmi()
  if (!ami.connected) {
    const error = new Error(ami.error || 'AMI unavailable')
    error.status = 503
    throw error
  }
  const rawMember = assertDialToken(String(member || '').split('/').pop(), 'عضو صف')
  const iface = String(member || '').includes('/') ? `${assertDialToken(String(member).split('/')[0], 'رابط')}/${rawMember}` : `PJSIP/${rawMember}`
  const response = await ami.client.queuePause({ interfaceName: iface, paused: Boolean(paused), reason: reason || '' })
  return { ok: true, response, member: iface, paused: Boolean(paused) }
}

export function listRecordings() {
  const roots = [
    resolvePath('storage/recordings/inbound'),
    resolvePath('storage/recordings/outbound'),
    resolvePath('storage/recordings/archived'),
    resolvePath('runtime/asterisk-var/spool/monitor'),
  ]
  const items = []
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const name of fs.readdirSync(root)) {
      if (name === '.gitkeep') continue
      const full = path.join(root, name)
      const stat = fs.statSync(full)
      if (!stat.isFile() || !mimeForRecording(name).startsWith('audio/')) continue
      const numbers = extractPhoneTokens(name)
      items.push({
        id: name,
        name,
        folder: path.basename(path.dirname(full)),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        path: path.relative(resolvePath('.'), full),
        numbers,
        direction: path.basename(path.dirname(full)) === 'inbound' ? 'in' : path.basename(path.dirname(full)) === 'outbound' ? 'out' : 'unknown',
        mime: mimeForRecording(name),
      })
    }
  }
  return items.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

export function resolveRecordingFile(id) {
  const safe = String(id || '').trim()
  if (!safe || safe.includes('..') || safe.includes('/') || safe.includes('\\')) return null
  const roots = [
    resolvePath('storage/recordings/inbound'),
    resolvePath('storage/recordings/outbound'),
    resolvePath('storage/recordings/archived'),
    resolvePath('runtime/asterisk-var/spool/monitor'),
    resolvePath('storage/recordings'),
  ]
  for (const root of roots) {
    const full = path.join(root, safe)
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue
    if (!mimeForRecording(safe).startsWith('audio/')) continue
    const resolvedRoot = path.resolve(root)
    const resolvedFile = path.resolve(full)
    if (!resolvedFile.startsWith(resolvedRoot + path.sep)) continue
    return {
      id: safe,
      full,
      folder: path.basename(root),
      mime: mimeForRecording(safe),
      size: fs.statSync(full).size,
    }
  }
  return null
}

function extractPhoneTokens(name) {
  const matches = String(name).match(/\d{8,15}/g) || []
  return [...new Set(matches)]
}

function mimeForRecording(name) {
  const lower = String(name).toLowerCase()
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.webm')) return 'audio/webm'
  if (lower.endsWith('.gsm')) return 'audio/gsm'
  return 'application/octet-stream'
}

function maskSecrets(item) {
  if (!item || typeof item !== 'object') return item
  const copy = { ...item }
  for (const key of ['secret', 'pin', 'vmPin']) {
    if (copy[key]) copy[key] = '********'
  }
  return copy
}

export { withLive }
