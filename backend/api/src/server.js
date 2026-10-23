import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requestContext, rateLimitLogin } from '../../services/http/security.js'
import { getReadiness } from '../../services/system/health.js'
import { exportDocumentsToFiles } from '../../services/system/exportDocuments.js'
import { createBackupArchive, listBackups, restoreBackupArchive } from '../../services/system/backup.js'
import { reconnectDatastore } from '../../services/store/documentStore.js'
import {
  deleteCollectionItem,
  getOverview,
  getStatus,
  listChannels,
  listCdrFiles,
  listCollection,
  listPjsipEndpoints,
  listQueueStatus,
  listRecordings,
  resolveRecordingFile,
  originateCall,
  hangupChannel,
  softphoneBootstrap,
  regenerateConfigs,
  saveAmiSettings,
  saveCollectionItem,
  saveSipSettings,
  setQueueMemberPause,
} from '../../services/asterisk/pbx.js'
import { loadPbx } from '../../services/store/pbxStore.js'
import {
  applyFirewallDesired,
  applyNetworkDesired,
  getFirewallStatus,
  getNetworkStatus,
  saveFirewallDesired,
  saveNetworkDesired,
} from '../../services/system/host.js'
import { removeFirewallRule, upsertFirewallRule } from '../../services/store/systemStore.js'
import {
  attachUser,
  authDisabled,
  enforceRouteRole,
  requireAuth,
  requireMinRole,
} from '../../services/auth/middleware.js'
import {
  authenticate,
  changePassword,
  deleteUser,
  listUsers,
  sanitizeUser,
  upsertUser,
} from '../../services/auth/authStore.js'
import { createSession, revokeSession } from '../../services/auth/sessions.js'
import { writeAudit, listAudit } from '../../services/audit/auditLog.js'
import {
  applyDatabaseSettings,
  getDatabaseSettings,
  importJsonToDatabase,
  saveDatabaseSettings,
  switchToFileMode,
  testDatabaseSettings,
} from '../../services/system/databaseSettings.js'
import { applyEnvDatabaseBootstrap } from '../../services/store/databaseConfig.js'
import { initDatastore } from '../../services/store/documentStore.js'
import { initSessions } from '../../services/auth/sessions.js'

const app = express()
const port = Number(process.env.CIWA_API_PORT || 8788)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const uiDist = path.join(repoRoot, 'frontend/dist')

if (process.env.CIWA_TRUST_PROXY === '1') {
  app.set('trust proxy', Number(process.env.CIWA_TRUST_PROXY_HOPS || 1))
}

const corsOrigin = process.env.CIWA_CORS_ORIGIN || true
app.use(requestContext)
app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use(attachUser)

const collections = {
  extensions: 'extensions',
  trunks: 'trunks',
  'inbound-routes': 'inboundRoutes',
  'outbound-routes': 'outboundRoutes',
  queues: 'queues',
  ivrs: 'ivrs',
  'ring-groups': 'ringGroups',
  'time-conditions': 'timeConditions',
  conferences: 'conferences',
  voicemail: 'voicemailBoxes',
  moh: 'mohClasses',
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

function audit(req, action, meta = {}) {
  writeAudit({
    action,
    user: req.user?.username || 'anonymous',
    role: req.user?.role || null,
    path: req.path,
    method: req.method,
    ...meta,
  })
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ciwa-telecom-api', auth: !authDisabled(), env: process.env.CIWA_ENV || 'development' })
})

app.get('/api/health/ready', asyncHandler(async (_req, res) => {
  const readiness = await getReadiness()
  res.status(readiness.ok ? 200 : 503).json(readiness)
}))

app.post('/api/auth/login', rateLimitLogin, asyncHandler(async (req, res) => {
  const user = authenticate(req.body?.username, req.body?.password)
  if (!user) {
    res.status(401).json({ error: 'invalid_credentials', message: 'نام کاربری یا رمز نادرست است.' })
    return
  }
  const session = createSession(user)
  audit(req, 'auth.login', { user: user.username })
  res.json({ token: session.token, expiresAt: session.expiresAt, user })
}))

app.post('/api/auth/logout', requireAuth, asyncHandler(async (req, res) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  revokeSession(token)
  res.json({ ok: true })
}))

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user, authDisabled: authDisabled() })
})

app.post('/api/auth/change-password', requireAuth, asyncHandler(async (req, res) => {
  await changePassword(req.user.id, req.body?.currentPassword, req.body?.newPassword)
  audit(req, 'auth.password_changed')
  res.json({ ok: true })
}))

app.get('/api/auth/users', requireAuth, requireMinRole('admin'), (_req, res) => {
  res.json({ items: listUsers() })
})

app.post('/api/auth/users', requireAuth, requireMinRole('admin'), asyncHandler(async (req, res) => {
  const user = upsertUser(req.body || {})
  audit(req, 'auth.user_created', { target: user.username })
  res.json({ user })
}))

app.put('/api/auth/users/:id', requireAuth, requireMinRole('admin'), asyncHandler(async (req, res) => {
  const user = upsertUser({ ...(req.body || {}), id: req.params.id })
  audit(req, 'auth.user_updated', { target: user.username })
  res.json({ user })
}))

app.delete('/api/auth/users/:id', requireAuth, requireMinRole('admin'), asyncHandler(async (req, res) => {
  deleteUser(req.params.id)
  audit(req, 'auth.user_deleted', { target: req.params.id })
  res.json({ ok: true })
}))

app.use('/api', requireAuth, enforceRouteRole)

app.get('/api/audit', requireMinRole('admin'), (_req, res) => {
  res.json({ items: listAudit({ limit: 300 }) })
})

app.get('/api/overview', asyncHandler(async (_req, res) => {
  res.json(await getOverview())
}))

app.get('/api/status', asyncHandler(async (_req, res) => {
  res.json(await getStatus())
}))

app.get('/api/channels', asyncHandler(async (_req, res) => {
  res.json(await listChannels())
}))

app.get('/api/pjsip/endpoints', asyncHandler(async (_req, res) => {
  res.json(await listPjsipEndpoints())
}))

app.get('/api/queues/live', asyncHandler(async (_req, res) => {
  res.json(await listQueueStatus())
}))

app.post('/api/queues/member/pause', asyncHandler(async (req, res) => {
  res.json(await setQueueMemberPause(req.body || {}))
}))

app.get('/api/softphone/bootstrap', asyncHandler(async (_req, res) => {
  res.json(await softphoneBootstrap())
}))

app.post('/api/calls/originate', asyncHandler(async (req, res) => {
  const result = await originateCall(req.body || {})
  audit(req, 'call.originate', { extension: result.extension, destination: result.destination })
  res.json(result)
}))

app.post('/api/calls/hangup', asyncHandler(async (req, res) => {
  const result = await hangupChannel(String(req.body?.channel || ''))
  audit(req, 'call.hangup', { channel: req.body?.channel })
  res.json(result)
}))

app.get('/api/cdr', asyncHandler(async (_req, res) => {
  const ami = await getStatus()
  res.json({ connected: ami.connected, amiError: ami.amiError, items: listCdrFiles() })
}))

app.get('/api/recordings', asyncHandler(async (req, res) => {
  const q = String(req.query.q || req.query.number || '').trim()
  let items = listRecordings()
  if (q) {
    const needle = q.replace(/\D+/g, '')
    items = items.filter((item) => {
      const hay = `${item.name} ${(item.numbers || []).join(' ')}`.replace(/\D+/g, '')
      return !needle || hay.includes(needle) || (item.numbers || []).some((num) => num.includes(needle) || needle.includes(num.slice(-8)))
    })
  }
  res.json({ items })
}))

app.get('/api/recordings/:id/audio', asyncHandler(async (req, res) => {
  const file = resolveRecordingFile(req.params.id)
  if (!file) {
    res.status(404).json({ error: 'not_found', message: 'فایل مکالمه پیدا نشد.' })
    return
  }
  res.setHeader('Content-Type', file.mime)
  res.setHeader('Content-Length', String(file.size))
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'private, max-age=120')
  fs.createReadStream(file.full).pipe(res)
}))

app.post('/api/configs/regenerate', asyncHandler(async (req, res) => {
  const generated = await regenerateConfigs()
  audit(req, 'config.regenerate')
  res.json(generated)
}))

app.get('/api/settings/sip', asyncHandler(async (_req, res) => {
  res.json({ sip: loadPbx().sip })
}))

app.put('/api/settings/sip', asyncHandler(async (req, res) => {
  const result = await saveSipSettings(req.body || {})
  audit(req, 'settings.sip')
  res.json(result)
}))

app.get('/api/settings/ami', asyncHandler(async (_req, res) => {
  const ami = loadPbx().ami
  res.json({ ami: { ...ami, secret: ami.secret ? '********' : '' } })
}))

app.put('/api/settings/ami', asyncHandler(async (req, res) => {
  const result = await saveAmiSettings(req.body || {})
  audit(req, 'settings.ami')
  res.json(result)
}))

app.get('/api/system/network', asyncHandler(async (_req, res) => {
  res.json(await getNetworkStatus())
}))

app.put('/api/system/network', asyncHandler(async (req, res) => {
  res.json(await saveNetworkDesired(req.body || {}))
}))

app.post('/api/system/network/apply', asyncHandler(async (req, res) => {
  const result = await applyNetworkDesired()
  audit(req, 'system.network_apply')
  res.json(result)
}))

app.get('/api/system/firewall', asyncHandler(async (_req, res) => {
  res.json(await getFirewallStatus())
}))

app.put('/api/system/firewall', asyncHandler(async (req, res) => {
  res.json(await saveFirewallDesired(req.body || {}))
}))

app.post('/api/system/firewall/rules', asyncHandler(async (req, res) => {
  const system = await upsertFirewallRule(req.body || {})
  await saveFirewallDesired(system.firewall)
  res.json({ firewall: system.firewall })
}))

app.delete('/api/system/firewall/rules/:id', asyncHandler(async (req, res) => {
  const system = await removeFirewallRule(req.params.id)
  await saveFirewallDesired(system.firewall)
  res.json({ firewall: system.firewall })
}))

app.post('/api/system/firewall/apply', asyncHandler(async (req, res) => {
  const result = await applyFirewallDesired()
  audit(req, 'system.firewall_apply')
  res.json(result)
}))

app.get('/api/system/backups', requireMinRole('admin'), (_req, res) => {
  res.json({ items: listBackups() })
})

app.post('/api/system/backup', requireMinRole('admin'), asyncHandler(async (req, res) => {
  const archive = createBackupArchive()
  audit(req, 'system.backup', { file: archive.name })
  res.json(archive)
}))

app.post('/api/system/restore', requireMinRole('admin'), asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '')
  const result = restoreBackupArchive(name)
  await reconnectDatastore()
  await initSessions()
  audit(req, 'system.restore', { file: name })
  res.json(result)
}))

app.post('/api/system/export-json', requireMinRole('admin'), asyncHandler(async (req, res) => {
  const result = exportDocumentsToFiles()
  audit(req, 'system.export_json')
  res.json(result)
}))

app.get('/api/settings/database', requireMinRole('admin'), asyncHandler(async (_req, res) => {
  res.json(await getDatabaseSettings())
}))

app.put('/api/settings/database', requireMinRole('admin'), asyncHandler(async (req, res) => {
  const result = await saveDatabaseSettings(req.body || {})
  audit(req, 'settings.database')
  res.json(result)
}))

app.post('/api/settings/database/test', requireMinRole('admin'), asyncHandler(async (req, res) => {
  res.json(await testDatabaseSettings(req.body || null))
}))

app.post('/api/settings/database/apply', requireMinRole('admin'), asyncHandler(async (req, res) => {
  const result = await applyDatabaseSettings(req.body || {})
  audit(req, 'settings.database_apply')
  res.json(result)
}))

app.post('/api/settings/database/import', requireMinRole('admin'), asyncHandler(async (req, res) => {
  const result = await importJsonToDatabase()
  audit(req, 'settings.database_import')
  res.json(result)
}))

app.post('/api/settings/database/use-file', requireMinRole('admin'), asyncHandler(async (req, res) => {
  const result = await switchToFileMode()
  audit(req, 'settings.database_file_mode')
  res.json(result)
}))

for (const [route, key] of Object.entries(collections)) {
  app.get(`/api/${route}`, asyncHandler(async (_req, res) => {
    res.json(await listCollection(key))
  }))

  app.post(`/api/${route}`, asyncHandler(async (req, res) => {
    const body = req.body || {}
    if (key === 'extensions') {
      if (!body.number) return res.status(400).json({ error: 'number_required', message: 'شماره داخلی لازم است.' })
      body.id = body.id || body.number
    }
    const result = await saveCollectionItem(key, body)
    audit(req, 'pbx.create', { collection: key, id: result.item?.id || result.item?.number })
    res.json(result)
  }))

  app.put(`/api/${route}/:id`, asyncHandler(async (req, res) => {
    const body = { ...(req.body || {}), id: req.params.id }
    if (key === 'extensions') {
      if (!body.number) body.number = req.params.id
      body.id = body.number
    }
    const result = await saveCollectionItem(key, body)
    audit(req, 'pbx.update', { collection: key, id: req.params.id })
    res.json(result)
  }))

  app.delete(`/api/${route}/:id`, asyncHandler(async (req, res) => {
    const result = await deleteCollectionItem(key, req.params.id)
    audit(req, 'pbx.delete', { collection: key, id: req.params.id })
    res.json(result)
  }))
}

if (process.env.CIWA_SERVE_UI === '1' && fs.existsSync(uiDist)) {
  app.use(express.static(uiDist, { index: 'index.html', maxAge: process.env.CIWA_ENV === 'production' ? '1h' : 0 }))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(uiDist, 'index.html'))
  })
}

app.use((error, _req, res, _next) => {
  console.error(error)
  const status = Number(error?.status) || 500
  res.status(status).json({
    error: status === 503 ? 'ami_unavailable' : 'internal_error',
    message: error instanceof Error ? error.message : 'Unknown error',
  })
})

async function start() {
  try {
    applyEnvDatabaseBootstrap()
    const store = await initDatastore()
    await initSessions()
    console.log(`[CIWA] datastore: ${store.driver}`)
  } catch (error) {
    console.error('[CIWA] datastore init failed:', error instanceof Error ? error.message : error)
  }
  app.listen(port, '0.0.0.0', () => {
    console.log(`CIWA Telecom API on http://127.0.0.1:${port}${authDisabled() ? ' (auth disabled)' : ''}`)
  })
}

void start()
