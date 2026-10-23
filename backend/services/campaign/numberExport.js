import { listCdrFiles, listRecordings } from '../asterisk/pbx.js'
import { normalizeIranPhone } from './parseNumbers.js'

export function collectPhoneNumberRows() {
  const rows = []
  for (const cdr of listCdrFiles()) {
    const at = cdr.startedAt || ''
    const d = parseDateParts(at)
    for (const num of [cdr.from, cdr.to]) {
      const phone = normalizeIranPhone(num)
      if (!phone) continue
      rows.push({
        number: phone,
        date: d.date,
        time: d.time,
        source: 'cdr',
        extra: cdr.disposition || '',
      })
    }
  }
  for (const rec of listRecordings()) {
    const d = parseDateParts(rec.modifiedAt)
    for (const num of rec.numbers || []) {
      const phone = normalizeIranPhone(num)
      if (!phone) continue
      rows.push({
        number: phone,
        date: d.date,
        time: d.time,
        source: 'recording',
        extra: rec.name || '',
      })
    }
  }
  const key = (r) => `${r.number}|${r.date}|${r.time}|${r.source}`
  const seen = new Set()
  return rows.filter((r) => {
    const k = key(r)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function parseDateParts(value) {
  const d = value ? new Date(value) : new Date()
  if (Number.isNaN(d.getTime())) {
    const parts = String(value).split(/[,\s]+/)
    return { date: parts[0] || '', time: parts[1] || '' }
  }
  return {
    date: d.toLocaleDateString('fa-IR'),
    time: d.toLocaleTimeString('fa-IR'),
  }
}

export function phoneRowsToCsv(rows) {
  const header = ['شماره', 'تاریخ', 'ساعت', 'منبع', 'توضیح']
  const body = rows.map((r) => [
    r.number,
    r.date,
    r.time,
    r.source,
    r.extra || '',
  ].map((v) => {
    const s = String(v ?? '')
    return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(','))
  return `\uFEFF${header.join(',')}\n${body.join('\n')}\n`
}
