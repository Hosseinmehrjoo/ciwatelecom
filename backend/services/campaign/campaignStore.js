import fs from 'node:fs'
import path from 'node:path'
import { ensureDir, readJson, resolvePath, uid, writeJson } from '../store/fsutil.js'

const ROOT = resolvePath('storage/campaigns')
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/

export function assertCampaignId(id) {
  const safe = String(id || '')
  if (!ID_RE.test(safe)) {
    const error = new Error('شناسه کمپین نامعتبر است.')
    error.status = 400
    throw error
  }
  return safe
}

function campaignPath(id) {
  const safe = assertCampaignId(id)
  const full = path.resolve(ROOT, `${safe}.json`)
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) {
    const error = new Error('شناسه کمپین نامعتبر است.')
    error.status = 400
    throw error
  }
  return full
}

function logsPath(id) {
  const safe = assertCampaignId(id)
  return path.resolve(ROOT, `${safe}.logs.json`)
}

export function listCampaigns() {
  ensureDir(ROOT)
  const items = []
  for (const file of fs.readdirSync(ROOT)) {
    if (!file.endsWith('.json') || file.endsWith('.logs.json')) continue
    const data = readJson(path.join(ROOT, file), null)
    if (data?.id) items.push(summarize(data))
  }
  return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

function summarize(c) {
  return {
    id: c.id,
    name: c.name,
    extension: c.extension,
    intervalSec: c.intervalSec,
    status: c.status,
    totalNumbers: (c.numbers || []).length,
    currentIndex: c.currentIndex || 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    startedAt: c.startedAt,
    finishedAt: c.finishedAt,
  }
}

export function loadCampaign(id) {
  const data = readJson(campaignPath(id), null)
  if (!data) {
    const error = new Error('کمپین پیدا نشد.')
    error.status = 404
    throw error
  }
  return data
}

export function saveCampaign(campaign) {
  ensureDir(ROOT)
  campaign.updatedAt = new Date().toISOString()
  writeJson(campaignPath(campaign.id), campaign)
  return campaign
}

export function createCampaign({ name, extension, intervalSec }) {
  const campaign = {
    id: uid('camp'),
    name: name || 'کمپین تماس تبلیغاتی',
    extension: String(extension || '').trim(),
    intervalSec: Math.max(3, Number(intervalSec) || 10),
    status: 'idle',
    numbers: [],
    currentIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  }
  if (!campaign.extension) {
    const error = new Error('داخلی مبدأ لازم است.')
    error.status = 400
    throw error
  }
  saveCampaign(campaign)
  writeJson(logsPath(campaign.id), { campaignId: campaign.id, entries: [] })
  return campaign
}

export function setCampaignNumbers(id, numbers) {
  const campaign = loadCampaign(id)
  campaign.numbers = [...new Set(numbers.map((n) => String(n).trim()).filter(Boolean))]
  campaign.currentIndex = 0
  saveCampaign(campaign)
  return campaign
}

export function loadLogs(id) {
  return readJson(logsPath(id), { campaignId: id, entries: [] })
}

export function appendLog(id, entry) {
  const logs = loadLogs(id)
  const record = {
    id: uid('clog'),
    at: new Date().toISOString(),
    ...entry,
  }
  logs.entries.unshift(record)
  writeJson(logsPath(id), logs)
  return record
}

export function updateCampaignStatus(id, status, extra = {}) {
  const campaign = loadCampaign(id)
  campaign.status = status
  Object.assign(campaign, extra)
  saveCampaign(campaign)
  return campaign
}

export function logsToCsv(entries) {
  const header = [
    'تاریخ',
    'ساعت',
    'شماره',
    'موفقیت',
    'نتیجه',
    'مدت_انتظار_پاسخ_ثانیه',
    'مدت_تماس_ثانیه',
    'فایل_ضبط',
    'داخلی',
    'شناسه_لاگ',
  ]
  const rows = entries.map((e) => {
    const d = new Date(e.at)
    const date = d.toLocaleDateString('fa-IR')
    const time = d.toLocaleTimeString('fa-IR')
    return [
      date,
      time,
      e.number || '',
      e.success ? 'بله' : 'خیر',
      e.disposition || '',
      String(e.ringSec ?? ''),
      String(e.talkSec ?? ''),
      e.recordingFile || '',
      e.extension || '',
      e.id || '',
    ].map(csvEscape).join(',')
  })
  return `${header.join(',')}\n${rows.join('\n')}\n`
}

function csvEscape(value) {
  let s = String(value ?? '')
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
