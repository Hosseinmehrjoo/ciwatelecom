import { useEffect, useState } from 'react'
import { api, setAuthToken } from '../api/client'

const SORTER_URL = 'https://shomaredar.ir/tools/morattab-saz-shomare'

async function downloadLogsCsv(id: string) {
  const token = localStorage.getItem('ciwa_telecom_token')
  const response = await fetch(api.campaignLogsCsvUrl(id), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error('دانلود لاگ ناموفق بود')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `campaign-${id}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function PromotionalCallsView() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [name, setName] = useState('کمپین تبلیغاتی')
  const [extension, setExtension] = useState('101')
  const [intervalSec, setIntervalSec] = useState(10)
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [showSorterModal, setShowSorterModal] = useState(false)

  async function reloadList() {
    const payload = await api.listCampaigns()
    setCampaigns(payload.items || [])
  }

  async function reloadDetail(id: string) {
    if (!id) return
    const payload = await api.getCampaign(id)
    setDetail(payload.campaign)
    setLogs(payload.logs || [])
  }

  useEffect(() => {
    void reloadList()
  }, [])

  useEffect(() => {
    if (!selectedId && campaigns[0]) setSelectedId(campaigns[0].id)
  }, [campaigns, selectedId])

  useEffect(() => {
    if (selectedId) void reloadDetail(selectedId)
    const timer = window.setInterval(() => {
      if (selectedId) void reloadDetail(selectedId)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [selectedId])

  async function exportNumbers() {
    const token = localStorage.getItem('ciwa_telecom_token')
    setAuthToken(token)
    const response = await fetch('/api/exports/phone-numbers', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) throw new Error('خطا در استخراج')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ciwa-phone-numbers.csv'
    a.click()
    URL.revokeObjectURL(url)
    setShowSorterModal(true)
  }

  async function createCampaign() {
    const payload = await api.createCampaign({ name, extension, intervalSec })
    setSelectedId(payload.campaign.id)
    await reloadList()
    setMessage('کمپین ساخته شد.')
  }

  async function uploadNumbers() {
    if (!selectedId || !file) return
    const result = await api.uploadCampaignFile(selectedId, file)
    await reloadDetail(selectedId)
    setMessage(`${result.count} شماره بارگذاری شد.`)
    setFile(null)
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold text-slate-800">تماس تبلیغاتی</h1>
        <p className="text-xs text-slate-400 mt-1">آپلود لیست شماره، فاصله بین تماس‌ها، اجرای کمپین و لاگ قابل دانلود</p>
      </header>

      <section className="glass-card rounded-[28px] p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold">استخراج شماره از CDR و ضبط‌ها</h2>
        <p className="text-xs text-slate-400">خروجی CSV شامل شماره، تاریخ و ساعت</p>
        <button type="button" className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold self-start" onClick={() => void exportNumbers().catch((e) => setMessage(e.message))}>
          دانلود CSV شماره‌ها
        </button>
      </section>

      <section className="glass-card rounded-[28px] p-5 grid gap-3 md:grid-cols-2">
        <h2 className="md:col-span-2 text-sm font-semibold">کمپین جدید</h2>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          نام کمپین
          <input className="glass-input rounded-xl px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          داخلی مبدأ (اپراتور)
          <input className="glass-input rounded-xl px-3 py-2 text-sm" value={extension} onChange={(e) => setExtension(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          فاصله بین تماس‌ها (ثانیه)
          <input type="number" min={3} className="glass-input rounded-xl px-3 py-2 text-sm" value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} />
        </label>
        <div className="md:col-span-2 flex gap-2">
          <button type="button" className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold" onClick={() => void createCampaign()}>
            ایجاد کمپین
          </button>
        </div>
      </section>

      <section className="glass-card rounded-[28px] p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold">بارگذاری شماره‌ها (txt, csv, xlsx)</h2>
        <select className="glass-input rounded-xl px-3 py-2 text-sm max-w-md" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">انتخاب کمپین</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
          ))}
        </select>
        <input type="file" accept=".txt,.csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-2xl px-4 py-2.5 text-xs bg-white/10" disabled={!selectedId || !file} onClick={() => void uploadNumbers()}>
            آپلود فایل
          </button>
          <button type="button" className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold" disabled={!selectedId} onClick={() => void api.startCampaign(selectedId).then(() => reloadDetail(selectedId))}>
            شروع تماس‌ها
          </button>
          <button type="button" className="rounded-2xl px-4 py-2.5 text-xs bg-white/10" disabled={!selectedId} onClick={() => void api.pauseCampaign(selectedId).then(() => reloadDetail(selectedId))}>
            توقف موقت
          </button>
          <button type="button" className="rounded-2xl px-4 py-2.5 text-xs bg-white/10" disabled={!selectedId} onClick={() => void api.stopCampaign(selectedId).then(() => reloadDetail(selectedId))}>
            پایان کمپین
          </button>
          <button
            type="button"
            className="rounded-2xl px-4 py-2.5 text-xs bg-white/10"
            disabled={!selectedId}
            onClick={() => void downloadLogsCsv(selectedId)}
          >
            دانلود لاگ CSV
          </button>
        </div>
        {detail && (
          <p className="text-xs text-slate-400">
            وضعیت: {detail.status} — پیشرفت: {detail.currentIndex}/{detail.numbers?.length || detail.totalNumbers}
          </p>
        )}
        {message && <p className="text-xs text-slate-400">{message}</p>}
      </section>

      <section className="glass-card rounded-[28px] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 text-sm font-semibold">لاگ کمپین</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="text-right px-3 py-2">زمان</th>
                <th className="text-right px-3 py-2">شماره</th>
                <th className="text-right px-3 py-2">موفق</th>
                <th className="text-right px-3 py-2">نتیجه</th>
                <th className="text-right px-3 py-2">انتظار</th>
                <th className="text-right px-3 py-2">مدت تماس</th>
                <th className="text-right px-3 py-2">ضبط</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">لاگی نیست.</td></tr>
              ) : logs.map((row) => (
                <tr key={row.id} className="border-t border-white/10">
                  <td className="px-3 py-2 text-xs">{new Date(row.at).toLocaleString('fa-IR')}</td>
                  <td className="px-3 py-2">{row.number}</td>
                  <td className="px-3 py-2">{row.success ? 'بله' : 'خیر'}</td>
                  <td className="px-3 py-2 text-xs">{row.disposition}</td>
                  <td className="px-3 py-2">{row.ringSec ?? '—'}s</td>
                  <td className="px-3 py-2">{row.talkSec ?? '—'}s</td>
                  <td className="px-3 py-2 text-xs">
                    {row.recordingId ? (
                      <a className="text-sky-400" href={api.recordingUrl(row.recordingId)} target="_blank" rel="noreferrer">پخش</a>
                    ) : row.recordingFile || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showSorterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass-card max-w-md w-full rounded-[28px] p-6 flex flex-col gap-4">
            <p className="text-sm text-slate-700 leading-7">
              اگر نیاز به مرتب کردن شماره‌ها دارید از مرتب‌ساز شماره استفاده کنید.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" className="rounded-2xl px-4 py-2 text-xs bg-white/10" onClick={() => setShowSorterModal(false)}>بستن</button>
              <a href={SORTER_URL} target="_blank" rel="noreferrer" className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold">
                ورود به برنامه مرتب‌ساز
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
