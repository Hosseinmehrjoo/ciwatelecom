import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { LoadingMark } from '../ui/LoadingMark'

export function CallsView() {
  const [extension, setExtension] = useState('101')
  const [destination, setDestination] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function originate() {
    setBusy(true)
    setMessage('')
    try {
      await api.originate({ extension, destination })
      setMessage('تماس در صف برقراری است.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'خطا')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-slate-800">برقراری تماس</h1>
        <p className="text-xs text-slate-400 mt-1">Click-to-call از طریق AMI — ابتدا داخلی زنگ می‌خورد سپس مقصد</p>
      </header>
      <div className="glass-card rounded-[28px] p-5 grid gap-3 md:grid-cols-2 max-w-2xl">
        <label className="flex flex-col gap-1.5 text-xs text-slate-400">
          داخلی مبدأ
          <input className="glass-input rounded-xl px-3 py-2.5 text-sm" value={extension} onChange={(e) => setExtension(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-slate-400">
          مقصد (شماره یا داخلی)
          <input className="glass-input rounded-xl px-3 py-2.5 text-sm" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </label>
        <div className="md:col-span-2 flex items-center gap-3">
          <button type="button" disabled={busy} className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold" onClick={() => void originate()}>
            برقراری تماس
          </button>
          {message && <p className="text-xs text-slate-400">{message}</p>}
        </div>
      </div>
    </div>
  )
}

export function SoftphoneView() {
  const [bootstrap, setBootstrap] = useState<any>(null)
  const [selected, setSelected] = useState('')
  useEffect(() => {
    void api.softphoneBootstrap().then((payload) => {
      setBootstrap(payload)
      setSelected(payload.extensions?.[0]?.number || '')
    })
  }, [])
  if (!bootstrap) return <LoadingMark label="بارگذاری softphone..." large />
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-slate-800">Softphone / WebRTC</h1>
        <p className="text-xs text-slate-400 mt-1">اطلاعات اتصال SIP برای کلاینت WebRTC یا تلفن سازمانی</p>
      </header>
      <div className="glass-card rounded-[28px] p-5 grid gap-2 text-sm max-w-2xl">
        <p><span className="text-slate-400">SIP Host:</span> {bootstrap.sip?.host}:{bootstrap.sip?.sipPort}</p>
        <p><span className="text-slate-400">WSS:</span> {bootstrap.sip?.wssEnabled ? `wss://${bootstrap.sip.host}:${bootstrap.sip.wssPort}` : 'غیرفعال'}</p>
        <p><span className="text-slate-400">AMI:</span> {bootstrap.connected ? 'متصل' : bootstrap.amiError || 'قطع'}</p>
      </div>
      <label className="flex flex-col gap-1.5 text-xs text-slate-400 max-w-sm">
        داخلی برای click-to-call
        <select className="glass-input rounded-xl px-3 py-2.5 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {(bootstrap.extensions || []).map((ext: any) => (
            <option key={ext.number} value={ext.number}>{ext.name} ({ext.number})</option>
          ))}
        </select>
      </label>
      <CallsViewEmbedded extension={selected} />
    </div>
  )
}

function CallsViewEmbedded({ extension }: { extension: string }) {
  const [destination, setDestination] = useState('')
  const [message, setMessage] = useState('')
  return (
    <div className="glass-card rounded-[28px] p-5 flex flex-col gap-3 max-w-md">
      <input className="glass-input rounded-xl px-3 py-2.5 text-sm" placeholder="مقصد" value={destination} onChange={(e) => setDestination(e.target.value)} />
      <button
        type="button"
        className="btn-primary rounded-2xl py-2.5 text-xs font-semibold"
        onClick={() => void api.originate({ extension, destination }).then(() => setMessage('درخواست ارسال شد.')).catch((e) => setMessage(e.message))}
      >
        تماس از {extension}
      </button>
      {message && <p className="text-xs text-slate-400">{message}</p>}
    </div>
  )
}

export function QueueMonitorView() {
  const [items, setItems] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [member, setMember] = useState('101')

  async function reload() {
    const payload = await api.queuesLive()
    setItems(payload.items || [])
    setError(payload.connected ? null : payload.amiError)
  }

  useEffect(() => {
    void reload()
    const timer = window.setInterval(() => { void reload() }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-slate-800">وضعیت صف‌ها</h1>
        <p className="text-xs text-slate-400 mt-1">زنده از AMI QueueStatus</p>
      </header>
      {error && <p className="text-xs text-slate-400">{error}</p>}
      <div className="glass-card rounded-[28px] p-4 flex flex-wrap gap-2 items-end">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          داخلی اپراتور
          <input className="glass-input rounded-xl px-3 py-2 text-sm w-28" value={member} onChange={(e) => setMember(e.target.value)} />
        </label>
        <button type="button" className="rounded-2xl px-3 py-2 text-xs bg-white/10" onClick={() => void api.queuePause(member, true).then(reload)}>توقف</button>
        <button type="button" className="rounded-2xl px-3 py-2 text-xs bg-white/10" onClick={() => void api.queuePause(member, false).then(reload)}>آماده</button>
      </div>
      <div className="glass-card rounded-[28px] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="text-right px-4 py-2">Event</th>
              <th className="text-right px-4 py-2">Queue</th>
              <th className="text-right px-4 py-2">Member</th>
              <th className="text-right px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Calls</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">داده صف موجود نیست.</td></tr>
            ) : items.map((row, i) => (
              <tr key={i} className="border-t border-white/10">
                <td className="px-4 py-2 text-xs">{row.Event}</td>
                <td className="px-4 py-2">{row.Queue || '—'}</td>
                <td className="px-4 py-2">{row.Name || row.MemberName || '—'}</td>
                <td className="px-4 py-2">{row.Status || row.Paused || '—'}</td>
                <td className="px-4 py-2">{row.Calls || row.Callers || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
