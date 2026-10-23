import fs from 'node:fs'

const PHONE_RE = /(?:\+98|0098|98|0)?9\d{9}|0\d{10,11}|\d{8,15}/g

export function normalizeIranPhone(raw) {
  const digits = String(raw || '').replace(/\D+/g, '')
  if (!digits) return null
  if (digits.length === 10 && digits.startsWith('9')) return `0${digits}`
  if (digits.length === 12 && digits.startsWith('98')) return `0${digits.slice(2)}`
  if (digits.length >= 8 && digits.length <= 15) return digits
  return null
}

export function extractPhonesFromText(text) {
  const found = new Set()
  const matches = String(text).match(PHONE_RE) || []
  for (const m of matches) {
    const n = normalizeIranPhone(m)
    if (n) found.add(n)
  }
  return [...found]
}

export function parseTxt(buffer) {
  return extractPhonesFromText(buffer.toString('utf8'))
}

export function parseCsv(buffer) {
  const text = buffer.toString('utf8')
  const lines = text.split(/\r?\n/).filter(Boolean)
  const numbers = new Set()
  for (const line of lines) {
    for (const part of line.split(/[,;\t]/)) {
      const n = normalizeIranPhone(part)
      if (n) numbers.add(n)
    }
    extractPhonesFromText(line).forEach((n) => numbers.add(n))
  }
  return [...numbers]
}

export async function parseXlsx(buffer) {
  const { createRequire } = await import('node:module')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../api/package.json'))
  const XLSX = require('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const numbers = new Set()
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    for (const row of rows) {
      for (const cell of row) {
        const n = normalizeIranPhone(cell)
        if (n) numbers.add(n)
        extractPhonesFromText(String(cell)).forEach((x) => numbers.add(x))
      }
    }
  }
  return [...numbers]
}

export async function parseUpload({ filename, buffer }) {
  const lower = String(filename || '').toLowerCase()
  if (lower.endsWith('.txt')) return parseTxt(buffer)
  if (lower.endsWith('.csv')) return parseCsv(buffer)
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return parseXlsx(buffer)
  const error = new Error('فرمت فایل پشتیبانی نمی‌شود. txt، csv یا xlsx مجاز است.')
  error.status = 400
  throw error
}

export function readFileBuffer(path) {
  return fs.readFileSync(path)
}
