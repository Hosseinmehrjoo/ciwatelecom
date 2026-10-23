import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../api/package.json'))
const multer = require('multer')
import {
  createCampaign,
  listCampaigns,
  loadCampaign,
  loadLogs,
  logsToCsv,
  setCampaignNumbers,
} from './campaignStore.js'
import { parseUpload } from './parseNumbers.js'
import { collectPhoneNumberRows, phoneRowsToCsv } from './numberExport.js'
import {
  pauseCampaign,
  startCampaign,
  stopCampaign,
} from './runner.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
})

export const campaignUpload = upload.single('file')

export function registerCampaignRoutes(app, { asyncHandler, requireMinRole, audit, requireAuth, enforceRouteRole }) {
  app.get('/api/exports/phone-numbers', requireAuth, enforceRouteRole, requireMinRole('operator'), asyncHandler(async (_req, res) => {
    const rows = collectPhoneNumberRows()
    const csv = phoneRowsToCsv(rows)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="ciwa-phone-numbers.csv"')
    res.send(csv)
  }))

  app.get('/api/campaigns', requireAuth, enforceRouteRole, requireMinRole('operator'), asyncHandler(async (_req, res) => {
    res.json({ items: listCampaigns() })
  }))

  app.post('/api/campaigns', requireAuth, enforceRouteRole, requireMinRole('operator'), asyncHandler(async (req, res) => {
    const campaign = createCampaign(req.body || {})
    audit(req, 'campaign.create', { id: campaign.id })
    res.json({ campaign })
  }))

  app.get('/api/campaigns/:id', requireAuth, enforceRouteRole, requireMinRole('operator'), asyncHandler(async (req, res) => {
    const campaign = loadCampaign(req.params.id)
    const logs = loadLogs(req.params.id)
    res.json({ campaign, logs: logs.entries })
  }))

  app.post('/api/campaigns/:id/upload', requireAuth, enforceRouteRole, requireMinRole('operator'), campaignUpload, asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'file_required', message: 'فایل انتخاب نشده است.' })
      return
    }
    const numbers = await parseUpload({ filename: req.file.originalname, buffer: req.file.buffer })
    const campaign = setCampaignNumbers(req.params.id, numbers)
    audit(req, 'campaign.upload', { id: campaign.id, count: numbers.length })
    res.json({ campaign, count: numbers.length })
  }))

  app.post('/api/campaigns/:id/start', requireAuth, enforceRouteRole, requireMinRole('operator'), asyncHandler(async (req, res) => {
    const campaign = await startCampaign(req.params.id)
    audit(req, 'campaign.start', { id: campaign.id })
    res.json({ campaign })
  }))

  app.post('/api/campaigns/:id/stop', requireAuth, enforceRouteRole, requireMinRole('operator'), asyncHandler(async (req, res) => {
    const campaign = stopCampaign(req.params.id)
    audit(req, 'campaign.stop', { id: campaign.id })
    res.json({ campaign })
  }))

  app.post('/api/campaigns/:id/pause', requireAuth, enforceRouteRole, requireMinRole('operator'), asyncHandler(async (req, res) => {
    const campaign = pauseCampaign(req.params.id)
    audit(req, 'campaign.pause', { id: campaign.id })
    res.json({ campaign })
  }))

  app.get('/api/campaigns/:id/logs.csv', requireAuth, enforceRouteRole, requireMinRole('operator'), asyncHandler(async (req, res) => {
    const logs = loadLogs(req.params.id)
    const csv = logsToCsv(logs.entries)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.params.id}.csv"`)
    res.send(`\uFEFF${csv}`)
  }))
}
