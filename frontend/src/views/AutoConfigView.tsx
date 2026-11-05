import { useEffect, useState, type FormEvent } from 'react'
import { Search, Phone, PenLine, RefreshCw, Router } from 'lucide-react'
import { api, ApiError } from '../api/client'

type FoundPhone = {
  ip: string
  mac?: string | null
  model?: string | null
  phoneType?: string
  source?: string
  httpOpen?: boolean
}

type ExtensionOption = {
  number: string
  name?: string
  phoneType?: string
  mac?: string
}

type FormState = {
  ip: string
  number: string
  mac: string
  phoneType: 'cisco-7942' | 'cisco-7962'
}

const emptyForm: FormState = {
  ip: '',
  number: '',
  mac: '',
  phoneType: 'cisco-7962',
}

export function AutoConfigView() {
  const [scanning, setScanning] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  const [phones, setPhones] = useState<FoundPhone[]>([])
  const [extensions, setExtensions] = useState<ExtensionOption[]>([])
  const [subnet, setSubnet] = useState('')
  const [scanMeta, setScanMeta] = useState<{ subnet?: string; scanned?: number } | null>(null)
  const [notFoundOpen, setNotFoundOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<any>(null)
  const [tftp, setTftp] = useState<any>(null)

  async function reloadTftp() {
    try {
      setTftp(await api.phoneTftpStatus())
    } catch {
      setTftp(null)
    }
  }

  async function reloadExtensions() {
    try {
      const payload = await api.list('extensions')
      setExtensions((payload.items || []).map((item: any) => ({
        number: String(item.number),
        name: item.name,
        phoneType: item.phoneType,
        mac: item.mac,
      })))
    } catch {
      setExtensions([])
    }
  }

  useEffect(() => {
    void reloadTftp()
    void reloadExtensions()
  }, [])

  function openManual(seed?: Partial<FormState>) {
    setNotFoundOpen(false)
    setManualOpen(true)
    setSuccess(null)
    setError('')
    setMessage('')
    void reloadExtensions()
    setForm((current) => ({ ...current, ...emptyForm, ...seed }))
  }

  function pickPhone(phone: FoundPhone) {
    openManual({
      ip: phone.ip,
      mac: phone.mac || '',
      phoneType: phone.phoneType === 'cisco-7942' ? 'cisco-7942' : 'cisco-7962',
    })
  }

  async function runScan() {
    setScanning(true)
    setError('')
    setMessage('')
    setSuccess(null)
    setPhones([])
    try {
      const result = await api.discoverPhones(subnet.trim() || undefined)
      setPhones(result.phones || [])
      setScanMeta({ subnet: result.subnet, scanned: result.scanned })
      if (!result.phones?.length) {
        setNotFoundOpen(true)
        setMessage('تلفن پیدا نشد')
      } else {
        setMessage(`${result.count} تلفن پیدا شد.`)
      }
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'اسکن ناموفق بود.')
      setNotFoundOpen(true)
    } finally {
      setScanning(false)
      void reloadTftp()
    }
  }

  async function startTftp() {
    setError('')
    try {
      const status = await api.startPhoneTftp()
      setTftp(status)
      setMessage(status.note || 'سرویس TFTP بررسی شد.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'راه‌اندازی TFTP ناموفق بود.')
    }
  }

  async function submitConfig(event: FormEvent) {
    event.preventDefault()
    if (!form.number) {
      setError('یک داخلی از لیست انتخاب کنید.')
      return
    }
    setConfiguring(true)
    setError('')
    setSuccess(null)
    try {
      const result = await api.autoConfigPhone({
        ip: form.ip.trim(),
        number: form.number.trim(),
        mac: form.mac.trim() || undefined,
        phoneType: form.phoneType,
      })
      setSuccess(result)
      setMessage(result.message)
      setManualOpen(false)
      void reloadTftp()
      void reloadExtensions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'کانفیگ ناموفق بود.')
    } finally {
      setConfiguring(false)
    }
  }

  const selectedExt = extensions.find((item) => item.number === form.number)

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">کانفیگ خودکار</h1>
          <p className="text-xs text-slate-400 mt-1">
            جست‌وجوی گوشی سیسکو، اتصال به داخلی آماده‌شده، و ساخت فایل TFTP
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold inline-flex items-center gap-2"
            disabled={scanning}
            onClick={() => void runScan()}
          >
            <Search size={15} />
            {scanning ? 'در حال جستجو...' : 'جستجو'}
          </button>
          <button
            type="button"
            className="rounded-2xl px-4 py-2.5 text-xs font-semibold bg-white/10 inline-flex items-center gap-2"
            onClick={() => openManual()}
          >
            <PenLine size={15} />
            وارد کردن دستی
          </button>
        </div>
      </header>

      <div className="glass-card rounded-[28px] p-5 grid gap-3 md:grid-cols-[1fr_auto] items-end">
        <label className="flex flex-col gap-1.5 text-xs text-slate-400">
          رنج شبکه برای اسکن (اختیاری)
          <input
            className="glass-input rounded-xl px-3 py-2.5 text-sm"
            placeholder="مثلاً 192.168.1.0/24 — خالی = تشخیص خودکار"
            value={subnet}
            onChange={(e) => setSubnet(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded-2xl px-4 py-2.5 text-xs font-semibold bg-white/10 inline-flex items-center gap-2 justify-center"
          onClick={() => void startTftp()}
        >
          <Router size={15} />
          فعال‌سازی TFTP
        </button>
      </div>

      {tftp && (
        <div className="glass-card rounded-[22px] px-4 py-3 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>TFTP: {tftp.running ? `فعال · پورت ${tftp.port}` : 'غیرفعال'}</span>
          <span>فایل‌ها: {(tftp.files || []).length}</span>
          <span>برچسب بالای گوشی: telecom.aisis.ir</span>
          {tftp.error && <span className="text-rose-400">{tftp.error}</span>}
        </div>
      )}

      {message && !success && (
        <p className="glass-card rounded-2xl px-4 py-3 text-sm text-slate-600">{message}</p>
      )}
      {error && !manualOpen && (
        <p className="glass-card rounded-2xl px-4 py-3 text-sm text-rose-500">{error}</p>
      )}

      {success && (
        <div className={`rounded-[28px] p-5 border text-slate-800 ${(success.blockers || []).length ? 'border-amber-500/50 bg-amber-50' : 'border-emerald-500/40 bg-emerald-50'}`}>
          <p className={`text-base font-semibold mb-2 ${(success.blockers || []).length ? 'text-amber-900' : 'text-emerald-800'}`}>
            {(success.blockers || []).length ? 'کانفیگ روی سرور هست، ولی گوشی هنوز فایل را نمی‌گیرد' : 'کانفیگ آماده شد'}
          </p>
          <p className="text-sm text-slate-700 mb-3">{success.message}</p>
          <ul className="text-xs text-slate-600 grid gap-1.5">
            <li>داخلی: {success.extension?.number}</li>
            <li>آی‌پی گوشی: {success.phone?.ip}</li>
            <li>مک: {success.phone?.mac}</li>
            <li>فایل: {success.sepFile}</li>
            <li>آدرس SIP/TFTP سرور: {success.provisionHost}</li>
            <li>متن بالای گوشی: {success.phoneLabel || 'telecom.aisis.ir'}</li>
            <li>وضعیت TFTP سرور: {success.tftp?.running ? `فعال (${success.tftp.port})` : 'غیرفعال'}</li>
            {success.ciscoState?.phoneDn && <li>داخلی فعلی روی گوشی: {success.ciscoState.phoneDn}</li>}
            {success.ciscoState && <li>TFTP Server روی گوشی: {success.ciscoState.tftpServer1 || 'خالی'}</li>}
            {success.dhcpOption150 && <li>DHCP option 150 برای این سرور: {success.dhcpOption150}</li>}
          </ul>
          {(success.blockers || []).length > 0 && (
            <div className="mt-4 rounded-2xl bg-white/70 border border-amber-500/20 p-3 text-xs text-amber-950 leading-6">
              <p className="font-semibold mb-1">برای 7962G دقیقاً این کار را بکن:</p>
              <p>۱) روی روتر/میکروتیک DHCP option 150 را IP سرور بگذار ({success.provisionHost}).</p>
              <p>یا روی گوشی: Settings → Network Configuration → قفل **# → Alternate TFTP = Yes → TFTP Server 1 = {success.provisionHost}</p>
              <p>۲) بعد گوشی را ری‌استارت کن. تا وقتی TFTP Server روی گوشی خالی باشد، SEP جدید را نمی‌گیرد و روی داخلی قدیمی می‌ماند.</p>
            </div>
          )}
          {!(success.blockers || []).length && (
            <p className="mt-4 text-sm font-medium text-amber-800">گوشی تلفن خود را یک‌بار ری‌استارت کنید.</p>
          )}
        </div>
      )}

      <div className="glass-card rounded-[28px] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">نتیجه جستجو</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {scanMeta?.subnet
                ? `${scanMeta.subnet} · ${scanMeta.scanned} آدرس بررسی شد`
                : 'هنوز جستجو انجام نشده'}
            </p>
          </div>
          <button
            type="button"
            className="text-xs text-slate-400 inline-flex items-center gap-1"
            disabled={scanning}
            onClick={() => void runScan()}
          >
            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
            دوباره
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="text-right px-5 py-3">آی‌پی</th>
                <th className="text-right px-5 py-3">مک</th>
                <th className="text-right px-5 py-3">مدل</th>
                <th className="text-right px-5 py-3">منبع</th>
                <th className="text-right px-5 py-3">عمل</th>
              </tr>
            </thead>
            <tbody>
              {phones.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                    {scanning ? 'در حال جستجو در شبکه...' : 'تلفنی در لیست نیست.'}
                  </td>
                </tr>
              ) : phones.map((phone) => (
                <tr key={phone.ip} className="border-t border-white/10">
                  <td className="px-5 py-3 font-mono text-xs">{phone.ip}</td>
                  <td className="px-5 py-3 font-mono text-xs">{phone.mac || '—'}</td>
                  <td className="px-5 py-3">{phone.model || 'Cisco'}</td>
                  <td className="px-5 py-3 text-xs text-slate-400">{phone.source || '—'}</td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      className="text-xs text-sky-500 font-medium inline-flex items-center gap-1"
                      onClick={() => pickPhone(phone)}
                    >
                      <Phone size={14} />
                      کانفیگ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {notFoundOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/75" aria-label="بستن" onClick={() => setNotFoundOpen(false)} />
          <div className="relative rounded-[28px] p-6 w-full max-w-md shadow-2xl bg-[#14121c] text-white border border-white/10">
            <h2 className="text-lg font-bold mb-2 text-white">تلفن پیدا نشد</h2>
            <p className="text-sm text-white/70 mb-5 leading-7">
              در این رنج شبکه‌ای گوشی سیسکو دیده نشد. می‌توانید آی‌پی را دستی وارد کنید و یک داخلی آماده‌شده را انتخاب کنید.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" className="rounded-2xl px-4 py-2.5 text-xs bg-white/10 text-white hover:bg-white/15" onClick={() => setNotFoundOpen(false)}>
                بستن
              </button>
              <button
                type="button"
                className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold"
                onClick={() => openManual()}
              >
                وارد کردن دستی
              </button>
            </div>
          </div>
        </div>
      )}

      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/75" aria-label="بستن" onClick={() => setManualOpen(false)} />
          <form
            onSubmit={(event) => void submitConfig(event)}
            className="relative rounded-[28px] p-6 w-full max-w-lg shadow-2xl grid gap-3 bg-[#14121c] text-white border border-white/10"
          >
            <h2 className="text-lg font-bold text-white">اتصال گوشی به داخلی</h2>
            <p className="text-xs text-white/55 -mt-1 mb-1">
              داخلی و رمز از لیست داخلی‌های ساخته‌شده می‌آید. بعد از کانفیگ گوشی را ری‌استارت کنید.
            </p>
            <label className="flex flex-col gap-1.5 text-xs text-white/70">
              آی‌پی تلفن
              <input required className="rounded-xl px-3 py-2.5 text-sm bg-[#1e1b28] text-white border border-white/15 placeholder:text-white/35" value={form.ip} onChange={(e) => setForm((c) => ({ ...c, ip: e.target.value }))} placeholder="192.168.1.107" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-white/70">
              داخلی
              <select
                required
                className="rounded-xl px-3 py-2.5 text-sm bg-[#1e1b28] text-white border border-white/15"
                value={form.number}
                onChange={(e) => setForm((c) => ({ ...c, number: e.target.value }))}
              >
                <option value="">انتخاب داخلی...</option>
                {extensions.map((item) => (
                  <option key={item.number} value={item.number}>
                    {item.number}{item.name ? ` — ${item.name}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {selectedExt && (
              <p className="text-xs text-white/50">رمز SIP همین داخلی از قبل در سامانه ذخیره شده و دوباره پرسیده نمی‌شود.</p>
            )}
            {!extensions.length && (
              <p className="text-xs text-rose-300">هنوز داخلی‌ای نساخته‌اید. اول از منوی «داخلی‌ها» یکی بسازید.</p>
            )}
            <label className="flex flex-col gap-1.5 text-xs text-white/70">
              مک‌آدرس (اگر پیدا نشد اجباری است)
              <input className="rounded-xl px-3 py-2.5 text-sm bg-[#1e1b28] text-white border border-white/15 placeholder:text-white/35" value={form.mac} onChange={(e) => setForm((c) => ({ ...c, mac: e.target.value }))} placeholder="ECC88211FC8B" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-white/70">
              مدل
              <select className="rounded-xl px-3 py-2.5 text-sm bg-[#1e1b28] text-white border border-white/15" value={form.phoneType} onChange={(e) => setForm((c) => ({ ...c, phoneType: e.target.value as FormState['phoneType'] }))}>
                <option value="cisco-7962">Cisco 7962</option>
                <option value="cisco-7942">Cisco 7942</option>
              </select>
            </label>
            {error && <p className="text-xs text-rose-300">{error}</p>}
            <div className="flex flex-wrap gap-2 justify-end mt-2">
              <button type="button" className="rounded-2xl px-4 py-2.5 text-xs bg-white/10 text-white hover:bg-white/15" onClick={() => setManualOpen(false)}>
                انصراف
              </button>
              <button type="submit" disabled={configuring || !extensions.length} className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold">
                {configuring ? 'در حال کانفیگ...' : 'کانفیگ'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
