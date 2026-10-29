import { useEffect, useState } from 'react'
import { api, type ResourceKey } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { LoadingMark } from '../ui/LoadingMark'

type Field = {
  key: string
  label: string
  placeholder?: string
  type?: 'text' | 'number' | 'password' | 'checkbox' | 'select'
  required?: boolean
  options?: { value: string; label: string }[]
}

const catalogs: Record<string, {
  key: ResourceKey
  title: string
  subtitle: string
  idField: string
  columns: { key: string; label: string }[]
  fields: Field[]
  defaults: Record<string, unknown>
}> = {
  extensions: {
    key: 'extensions',
    title: 'داخلی‌ها',
    subtitle: 'endpointهای PJSIP روی پیکربندی CIWA',
    idField: 'number',
    columns: [
      { key: 'number', label: 'شماره' },
      { key: 'name', label: 'نام' },
      { key: 'phoneType', label: 'نوع گوشی' },
      { key: 'secret', label: 'رمز' },
      { key: 'voicemail', label: 'صندوق صوتی' },
    ],
    fields: [
      { key: 'number', label: 'شماره داخلی', required: true },
      { key: 'name', label: 'نام نمایشی', required: true },
      {
        key: 'phoneType',
        label: 'نوع گوشی',
        type: 'select',
        options: [
          { value: 'webrtc', label: 'سافت‌فون / WebRTC' },
          { value: 'sip', label: 'تلفن SIP معمولی' },
          { value: 'cisco-7942', label: 'Cisco 7942' },
          { value: 'cisco-7962', label: 'Cisco 7962' },
        ],
      },
      { key: 'mac', label: 'مک‌آدرس سیسکو', placeholder: '001122334455' },
      { key: 'secret', label: 'رمز SIP', type: 'password', required: true },
      { key: 'ringTimeout', label: 'مهلت زنگ', type: 'number' },
      { key: 'voicemail', label: 'صندوق صوتی', type: 'checkbox' },
      { key: 'recordCalls', label: 'ضبط مکالمه', type: 'checkbox' },
    ],
    defaults: { ringTimeout: 30, voicemail: true, maxContacts: 3, recordCalls: false, phoneType: 'webrtc' },
  },
  trunks: {
    key: 'trunks',
    title: 'ترانک‌ها',
    subtitle: 'اتصال SIP به مخابرات / ارائه‌دهنده',
    idField: 'id',
    columns: [
      { key: 'name', label: 'نام' },
      { key: 'host', label: 'میزبان' },
      { key: 'username', label: 'کاربر' },
      { key: 'port', label: 'پورت' },
    ],
    fields: [
      { key: 'id', label: 'شناسه', required: true },
      { key: 'name', label: 'نام', required: true },
      { key: 'host', label: 'میزبان', required: true },
      { key: 'port', label: 'پورت', type: 'number' },
      { key: 'username', label: 'نام کاربری' },
      { key: 'secret', label: 'رمز', type: 'password' },
      { key: 'outboundCallerId', label: 'Caller ID خروجی' },
      { key: 'register', label: 'ثبت‌نام SIP', type: 'checkbox' },
    ],
    defaults: { port: 5060, register: false },
  },
  'inbound-routes': {
    key: 'inbound-routes',
    title: 'مسیرهای ورودی',
    subtitle: 'DID به داخلی / صف / IVR',
    idField: 'id',
    columns: [
      { key: 'name', label: 'نام' },
      { key: 'did', label: 'DID' },
      { key: 'destinationType', label: 'نوع مقصد' },
      { key: 'destination', label: 'مقصد' },
    ],
    fields: [
      { key: 'id', label: 'شناسه', required: true },
      { key: 'name', label: 'نام', required: true },
      { key: 'did', label: 'شماره DID', required: true },
      { key: 'destinationType', label: 'نوع مقصد (extension|queue|ivr|time-condition|hangup)', required: true },
      { key: 'destination', label: 'مقصد' },
    ],
    defaults: { destinationType: 'extension' },
  },
  'outbound-routes': {
    key: 'outbound-routes',
    title: 'مسیرهای خروجی',
    subtitle: 'الگوی شماره‌گیری و ترانک',
    idField: 'id',
    columns: [
      { key: 'name', label: 'نام' },
      { key: 'pattern', label: 'الگو' },
      { key: 'trunkId', label: 'ترانک' },
      { key: 'callerId', label: 'Caller ID' },
    ],
    fields: [
      { key: 'id', label: 'شناسه', required: true },
      { key: 'name', label: 'نام', required: true },
      { key: 'pattern', label: 'الگو مثل _9X.', required: true },
      { key: 'trunkId', label: 'شناسه ترانک', required: true },
      { key: 'callerId', label: 'Caller ID' },
      { key: 'timeout', label: 'مهلت', type: 'number' },
    ],
    defaults: { pattern: '_X.', timeout: 60 },
  },
  queues: {
    key: 'queues',
    title: 'صف‌های تماس',
    subtitle: 'صف پشتیبانی و فروش',
    idField: 'id',
    columns: [
      { key: 'number', label: 'شماره' },
      { key: 'name', label: 'نام' },
      { key: 'strategy', label: 'استراتژی' },
      { key: 'members', label: 'اعضا' },
    ],
    fields: [
      { key: 'id', label: 'شناسه', required: true },
      { key: 'number', label: 'شماره ورود به صف', required: true },
      { key: 'name', label: 'نام', required: true },
      { key: 'strategy', label: 'استراتژی (ringall|leastrecent|wrandom)' },
      { key: 'members', label: 'اعضا با ویرگول (1001,1002)' },
      { key: 'timeout', label: 'مهلت', type: 'number' },
    ],
    defaults: { strategy: 'ringall', timeout: 20, members: '' },
  },
  ivrs: {
    key: 'ivrs',
    title: 'IVR',
    subtitle: 'منوی صوتی پاسخگو',
    idField: 'id',
    columns: [
      { key: 'id', label: 'شناسه' },
      { key: 'name', label: 'نام' },
      { key: 'greeting', label: 'پیام' },
    ],
    fields: [
      { key: 'id', label: 'شناسه', required: true },
      { key: 'name', label: 'نام', required: true },
      { key: 'greeting', label: 'فایل پیام' },
      { key: 'options', label: 'گزینه‌ها JSON مثل [{"digit":"1","destination":"1001"}]' },
    ],
    defaults: { greeting: 'demo-congrats', options: '[]' },
  },
  'ring-groups': {
    key: 'ring-groups',
    title: 'گروه زنگ',
    subtitle: 'زنگ همزمان چند داخلی',
    idField: 'id',
    columns: [
      { key: 'number', label: 'شماره' },
      { key: 'name', label: 'نام' },
      { key: 'members', label: 'اعضا' },
      { key: 'timeout', label: 'مهلت' },
    ],
    fields: [
      { key: 'id', label: 'شناسه', required: true },
      { key: 'number', label: 'شماره', required: true },
      { key: 'name', label: 'نام', required: true },
      { key: 'members', label: 'اعضا با ویرگول' },
      { key: 'timeout', label: 'مهلت', type: 'number' },
    ],
    defaults: { strategy: 'ringall', timeout: 25, members: '' },
  },
  'time-conditions': {
    key: 'time-conditions',
    title: 'شرایط زمانی',
    subtitle: 'ساعات اداری و مسیر جایگزین',
    idField: 'id',
    columns: [
      { key: 'name', label: 'نام' },
      { key: 'timeRange', label: 'بازه' },
      { key: 'matchDestination', label: 'در بازه' },
      { key: 'missDestination', label: 'خارج بازه' },
    ],
    fields: [
      { key: 'id', label: 'شناسه', required: true },
      { key: 'name', label: 'نام', required: true },
      { key: 'timeRange', label: 'بازه مثل 09:00-17:00', required: true },
      { key: 'weekdays', label: 'روزها مثل sat-wed' },
      { key: 'matchDestination', label: 'مقصد داخل بازه' },
      { key: 'missDestination', label: 'مقصد خارج بازه' },
    ],
    defaults: { weekdays: 'sat-wed' },
  },
  conferences: {
    key: 'conferences',
    title: 'اتاق کنفرانس',
    subtitle: 'ConfBridge',
    idField: 'id',
    columns: [
      { key: 'number', label: 'شماره' },
      { key: 'name', label: 'نام' },
      { key: 'pin', label: 'پین' },
      { key: 'maxMembers', label: 'ظرفیت' },
    ],
    fields: [
      { key: 'id', label: 'شناسه', required: true },
      { key: 'number', label: 'شماره ورود', required: true },
      { key: 'name', label: 'نام', required: true },
      { key: 'pin', label: 'پین' },
      { key: 'maxMembers', label: 'حداکثر اعضا', type: 'number' },
    ],
    defaults: { maxMembers: 20 },
  },
  voicemail: {
    key: 'voicemail',
    title: 'صندوق صوتی',
    subtitle: 'صندوق‌های VoiceMail',
    idField: 'number',
    columns: [
      { key: 'number', label: 'شماره' },
      { key: 'name', label: 'نام' },
      { key: 'email', label: 'ایمیل' },
    ],
    fields: [
      { key: 'number', label: 'شماره', required: true },
      { key: 'name', label: 'نام', required: true },
      { key: 'pin', label: 'پین', required: true },
      { key: 'email', label: 'ایمیل' },
    ],
    defaults: { pin: '0000' },
  },
  moh: {
    key: 'moh',
    title: 'موزیک انتظار',
    subtitle: 'کلاس‌های Music on Hold',
    idField: 'id',
    columns: [
      { key: 'id', label: 'شناسه' },
      { key: 'name', label: 'نام' },
      { key: 'directory', label: 'پوشه' },
    ],
    fields: [
      { key: 'id', label: 'شناسه', required: true },
      { key: 'name', label: 'نام', required: true },
      { key: 'directory', label: 'مسیر فایل‌ها' },
    ],
    defaults: { directory: 'moh/default' },
  },
}

function normalize(body: Record<string, any>, catalogKey: string) {
  const next = { ...body }
  if (typeof next.members === 'string') {
    next.members = next.members.split(',').map((part: string) => part.trim()).filter(Boolean)
  }
  if (catalogKey === 'ivrs' && typeof next.options === 'string') {
    try { next.options = JSON.parse(next.options || '[]') } catch { next.options = [] }
  }
  if (next.voicemail === 'on' || next.voicemail === true) next.voicemail = true
  if (next.voicemail === 'off' || next.voicemail === false || next.voicemail === '') next.voicemail = false
  if (catalogKey === 'extensions' || catalogKey === 'voicemail') {
    next.id = next.id || next.number
  }
  return next
}

function displayCell(key: string, value: unknown) {
  if (key === 'secret' || key === 'pin') return value ? '••••••' : '—'
  if (Array.isArray(value)) return value.join(', ')
  return String(value ?? '—')
}

function itemToForm(item: Record<string, any>, catalogKey: string) {
  const next = { ...item }
  if (Array.isArray(next.members)) next.members = next.members.join(', ')
  if (catalogKey === 'ivrs' && Array.isArray(next.options)) next.options = JSON.stringify(next.options, null, 2)
  if (next.secret) next.secret = ''
  return next
}

export function ResourceView({ catalogKey }: { catalogKey: keyof typeof catalogs }) {
  const { user } = useAuth()
  const readOnly = user?.role === 'viewer'
  const catalog = catalogs[catalogKey]
  const [items, setItems] = useState<any[]>([])
  const [connected, setConnected] = useState(false)
  const [amiError, setAmiError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Record<string, any>>({ ...catalog.defaults })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function reload() {
    setLoading(true)
    const payload = await api.list(catalog.key)
    setItems(payload.items || [])
    setConnected(payload.connected)
    setAmiError(payload.amiError)
    setLoading(false)
  }

  useEffect(() => {
    void reload().catch((error: Error) => {
      setMessage(error.message)
      setLoading(false)
    })
  }, [catalogKey])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const body = normalize(form, catalogKey)
      if (editingId) {
        await api.update(catalog.key, editingId, body)
        setEditingId(null)
      } else {
        await api.create(catalog.key, body)
      }
      setForm({ ...catalog.defaults })
      await reload()
      setMessage('ذخیره شد و پیکربندی Asterisk در config/asterisk بازتولید شد.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'خطا در ذخیره')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(id: string) {
    setBusy(true)
    try {
      await api.remove(catalog.key, id)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingMark label="بارگذاری..." large />

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{catalog.title}</h1>
          <p className="text-xs text-slate-400 mt-1">{catalog.subtitle}</p>
        </div>
        <p className="text-xs text-slate-400">AMI: {connected ? 'متصل' : `قطع${amiError ? ` — ${amiError}` : ''}`}</p>
      </header>

      {!readOnly && (
      <form onSubmit={onSubmit} className="glass-card rounded-[28px] p-5 grid gap-3 md:grid-cols-2">
        {catalog.fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-1.5 text-xs text-slate-400">
            {field.label}
            {field.type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={Boolean(form[field.key])}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.checked }))}
                className="h-4 w-4"
              />
            ) : field.type === 'select' ? (
              <select
                className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none"
                value={String(form[field.key] ?? field.options?.[0]?.value ?? '')}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              >
                {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input
                className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none"
                type={field.type || 'text'}
                required={(field.required && !(editingId && (field.key === 'secret' || field.key === 'pin'))) || (field.key === 'mac' && String(form.phoneType || '').startsWith('cisco'))}
                placeholder={field.placeholder}
                value={form[field.key] ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            )}
          </label>
        ))}
        <div className="md:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={busy} className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold">
            {editingId ? 'به‌روزرسانی' : 'ذخیره در هسته پیکربندی'}
          </button>
          {editingId && (
            <button type="button" className="rounded-2xl px-4 py-2.5 text-xs bg-white/10" onClick={() => { setEditingId(null); setForm({ ...catalog.defaults }) }}>
              انصراف
            </button>
          )}
          {message && <p className="text-xs text-slate-400">{message}</p>}
        </div>
      </form>
      )}

      <div className="glass-card rounded-[28px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                {catalog.columns.map((column) => (
                  <th key={column.key} className="text-right px-5 py-3 font-medium">{column.label}</th>
                ))}
                <th className="text-right px-5 py-3 font-medium">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-slate-400" colSpan={catalog.columns.length + 1}>
                    هنوز موردی ثبت نشده است.
                  </td>
                </tr>
              ) : items.map((item) => {
                const id = String(item[catalog.idField] || item.id)
                return (
                  <tr key={id} className="border-t border-white/10">
                    {catalog.columns.map((column) => (
                      <td key={column.key} className="px-5 py-3">
                        {displayCell(column.key, item[column.key])}
                      </td>
                    ))}
                    <td className="px-5 py-3 flex gap-2">
                      {!readOnly && (
                        <>
                          <button type="button" className="text-xs text-sky-400" disabled={busy} onClick={() => { setEditingId(id); setForm(itemToForm(item, catalogKey)) }}>
                            ویرایش
                          </button>
                          <button type="button" className="text-xs text-rose-400" disabled={busy} onClick={() => void onDelete(id)}>
                            حذف
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function CdrView() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    void api.cdr().then((payload) => {
      setItems(payload.items || [])
      setLoading(false)
    })
  }, [])
  if (loading) return <LoadingMark label="بارگذاری CDR..." large />
  return (
    <ListPage title="گزارش تماس‌ها" subtitle="خوانده‌شده از storage/cdr" columns={['startedAt', 'from', 'to', 'duration', 'disposition']} items={items} empty="فایل CDR موجود نیست." />
  )
}

export function RecordingsView() {
  const [items, setItems] = useState<any[]>([])
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => {
    void api.recordings().then((payload) => setItems(payload.items || []))
  }, [])
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-slate-800">ضبط مکالمات</h1>
        <p className="text-xs text-slate-400 mt-1">storage/recordings و monitor</p>
      </header>
      <div className="glass-card rounded-[28px] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="text-right px-5 py-3">نام</th>
              <th className="text-right px-5 py-3">پوشه</th>
              <th className="text-right px-5 py-3">پخش</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-10 text-center text-slate-400">فایل ضبطی موجود نیست.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="border-t border-white/10">
                <td className="px-5 py-3">{item.name}</td>
                <td className="px-5 py-3">{item.folder}</td>
                <td className="px-5 py-3">
                  <button type="button" className="text-xs text-sky-400" onClick={() => setPlaying(item.id)}>پخش</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {playing && (
        <audio controls autoPlay className="w-full max-w-xl" src={api.recordingUrl(playing)}>
          مرورگر از پخش صدا پشتیبانی نمی‌کند.
        </audio>
      )}
    </div>
  )
}

export function LiveView() {
  const [items, setItems] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  async function tick() {
    const payload = await api.channels()
    setItems(payload.items || [])
    setError(payload.connected ? null : payload.amiError)
  }
  useEffect(() => {
    let active = true
    const run = async () => {
      if (!active) return
      await tick()
    }
    void run()
    const timer = window.setInterval(() => { void run() }, 4000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-slate-800">مانیتور زنده</h1>
        <p className="text-xs text-slate-400 mt-1">کانال‌های فعال از AMI</p>
      </header>
      {error && <p className="glass-card rounded-2xl px-4 py-3 text-sm text-slate-400">{error}</p>}
      <div className="glass-card rounded-[28px] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              {['channel', 'callerId', 'connectedLine', 'state', 'duration'].map((col) => (
                <th key={col} className="text-right px-5 py-3">{col}</th>
              ))}
              <th className="text-right px-5 py-3">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">کانال فعالی نیست.</td></tr>
            ) : items.map((item) => (
              <tr key={item.channel} className="border-t border-white/10">
                {['channel', 'callerId', 'connectedLine', 'state', 'duration'].map((col) => (
                  <td key={col} className="px-5 py-3 text-xs">{String(item[col] ?? '—')}</td>
                ))}
                <td className="px-5 py-3">
                  <button type="button" className="text-xs text-rose-400" onClick={() => void api.hangup(item.channel).then(tick)}>
                    قطع
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ListPage({
  title,
  subtitle,
  columns,
  items,
  empty,
}: {
  title: string
  subtitle: string
  columns: string[]
  items: any[]
  empty: string
}) {
  return (
    <div className="flex flex-col gap-4">
      {(title || subtitle) && (
        <header>
          {title && <h1 className="text-xl font-bold text-slate-800">{title}</h1>}
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </header>
      )}
      <div className="glass-card rounded-[28px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                {columns.map((column) => <th key={column} className="text-right px-5 py-3 font-medium">{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td className="px-5 py-10 text-center text-slate-400" colSpan={columns.length}>{empty}</td></tr>
              ) : items.map((item, index) => (
                <tr key={item.id || index} className="border-t border-white/10">
                  {columns.map((column) => <td key={column} className="px-5 py-3">{String(item[column] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
