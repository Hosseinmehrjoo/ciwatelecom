import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Activity, Phone, PhoneCall, Radio, Server, Layers,
} from 'lucide-react'
import { api, type Overview } from '../api/client'
import { LoadingMark } from '../ui/LoadingMark'

export function DashboardView({ onOpen }: { onOpen: (id: string) => void }) {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api.overview()
      .then((payload) => { if (active) setData(payload) })
      .catch((caught: Error) => { if (active) setError(caught.message || 'خطا در دریافت داشبورد') })
    return () => { active = false }
  }, [])

  const traffic = useMemo(() => {
    if (!data?.recentCalls?.length) return []
    const buckets = new Map<string, number>()
    for (const call of data.recentCalls) {
      const key = String(call.startedAt || '').slice(0, 13) || '—'
      buckets.set(key, (buckets.get(key) || 0) + 1)
    }
    return [...buckets.entries()].map(([hour, calls]) => ({ hour, calls }))
  }, [data])

  if (error) return <div className="glass-card rounded-[28px] p-6 text-sm text-rose-500">{error}</div>
  if (!data) {
    return (
      <div className="glass-card rounded-[28px] p-10 grid place-items-center">
        <LoadingMark label="در حال اتصال به هسته..." large />
      </div>
    )
  }

  const kpis = [
    { title: 'داخلی‌ها', value: data.kpis.extensions || 0, icon: Phone, id: 'extensions' },
    { title: 'ترانک‌ها', value: data.kpis.trunks || 0, icon: Radio, id: 'trunks' },
    { title: 'صف‌ها', value: data.kpis.queues || 0, icon: Layers, id: 'queues' },
    { title: 'تماس فعال', value: data.kpis.activeCalls || 0, icon: PhoneCall, id: 'live' },
    { title: 'مسیر ورودی', value: data.kpis.inboundRoutes || 0, icon: Activity, id: 'inbound-routes' },
    { title: 'مسیر خروجی', value: data.kpis.outboundRoutes || 0, icon: Server, id: 'outbound-routes' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <section className="glass-card theme-banner rounded-[28px] p-6 sm:p-8 overflow-hidden relative">
        <div className="hero-blob absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-white/80 mb-2">مرکز تلفن اختصاصی سیوا</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">مدیریت واقعی روی هسته Asterisk</h1>
            <p className="text-sm text-white/85 max-w-xl leading-7">
              داخلی، ترانک، صف، IVR، مسیر تماس، شبکه و فایروال — بدون داده جعلی و بدون دست‌کاری core/asterisk.
            </p>
          </div>
          <div className="glass-chip rounded-2xl px-4 py-3 text-xs text-white/90 min-w-[12rem]">
            <p className="font-semibold mb-1">هسته Asterisk</p>
            <p>نسخه: {data.core.version}</p>
            <p>شاخه: {data.core.branch || '—'}</p>
            <p className="mt-1">AMI: {data.connected ? 'متصل' : 'قطع'}</p>
          </div>
        </div>
      </section>

      {!data.connected && (
        <p className="text-sm text-slate-500 glass-card rounded-2xl px-4 py-3">
          AMI در دسترس نیست{data.amiError ? ` (${data.amiError})` : ''}.
          پیکربندی‌ها در <span className="font-mono text-xs">config/ciwa</span> و
          <span className="font-mono text-xs"> config/asterisk</span> ذخیره می‌شوند؛ هسته در
          <span className="font-mono text-xs"> {data.core.sourceDir}</span> فقط خوانده می‌شود.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <button key={kpi.id} type="button" onClick={() => onOpen(kpi.id)} className="kpi-card glass-card rounded-[24px] p-4 text-right">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-slate-400">{kpi.title}</span>
              <span className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: 'rgba(232,121,249,0.16)' }}>
                <kpi.icon size={16} className="ciwa-accent" />
              </span>
            </div>
            <p className="text-3xl font-bold text-slate-800">{kpi.value}</p>
          </button>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="glass-card rounded-[28px] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">ترافیک از CDR واقعی</h2>
              <p className="text-xs text-slate-400 mt-1">فقط از فایل‌های storage/cdr خوانده می‌شود</p>
            </div>
          </div>
          {traffic.length === 0 ? (
            <p className="text-sm text-slate-400 py-16 text-center">هنوز CDR ثبت نشده است.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={traffic}>
                  <defs>
                    <linearGradient id="calls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e879f9" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" stroke="var(--ciwa-chart)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--ciwa-chart)" fontSize={11} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={{ background: 'var(--ciwa-tooltip-bg)', border: '1px solid var(--ciwa-tooltip-border)', borderRadius: 14, color: 'var(--ciwa-text)' }} />
                  <Area type="monotone" dataKey="calls" stroke="#a78bfa" fill="url(#calls)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="glass-card rounded-[28px] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">آخرین تماس‌ها</h2>
            <button type="button" className="text-xs ciwa-accent" onClick={() => onOpen('cdr')}>گزارش تماس</button>
          </div>
          {data.recentCalls.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">تماسی ثبت نشده است.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.recentCalls.map((call) => (
                <div key={call.id} className="activity-item rounded-2xl px-3 py-3">
                  <p className="text-sm font-medium text-slate-800 truncate">{call.from} → {call.to}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{call.startedAt} · {call.duration} · {call.disposition}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
