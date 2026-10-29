import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { LoadingMark } from '../ui/LoadingMark'

export function StatusView() {
  const [data, setData] = useState<any>(null)
  const [endpoints, setEndpoints] = useState<any[]>([])
  useEffect(() => {
    void api.status().then(setData)
    void api.pjsipEndpoints().then((payload) => setEndpoints(payload.items || []))
  }, [])
  if (!data) return <LoadingMark label="بررسی وضعیت هسته..." large />
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-slate-800">وضعیت هسته</h1>
        <p className="text-xs text-slate-400 mt-1">خواندن فقط از core/asterisk و AMI</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard title="منبع هسته" rows={[
          ['مسیر', data.core.sourceDir],
          ['نسخه', data.core.version],
          ['شاخه', data.core.branch || '—'],
          ['دست‌خورده', data.core.touched ? 'بله' : 'خیر'],
          ['پیکربندی خروجی', data.configDir],
        ]} />
        <InfoCard title="AMI" rows={[
          ['وضعیت', data.connected ? 'متصل' : 'قطع'],
          ['میزبان', `${data.ami.host}:${data.ami.port}`],
          ['کاربر', data.ami.username],
          ['خطا', data.amiError || '—'],
          ['تماس فعال', String(data.live?.channels ?? 0)],
        ]} />
      </div>
      <button
        type="button"
        className="btn-primary self-start rounded-2xl px-4 py-2.5 text-xs font-semibold"
        onClick={() => void api.regenerate().then(() => api.status().then(setData))}
      >
        بازتولید فایل‌های config/asterisk
      </button>
      {endpoints.length > 0 && (
        <div className="glass-card rounded-[28px] overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 text-sm font-semibold">PJSIP Endpoints (زنده)</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="text-right px-5 py-2">نام</th>
                <th className="text-right px-5 py-2">وضعیت</th>
                <th className="text-right px-5 py-2">Contacts</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((ep) => (
                <tr key={ep.objectName} className="border-t border-white/10">
                  <td className="px-5 py-2">{ep.objectName}</td>
                  <td className="px-5 py-2">{ep.deviceState}</td>
                  <td className="px-5 py-2 text-xs">{ep.contacts || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function AdminView() {
  const [users, setUsers] = useState<any[]>([])
  const [audit, setAudit] = useState<any[]>([])
  const [backups, setBackups] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ username: '', displayName: '', role: 'operator', password: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' })

  async function reload() {
    const [u, a, b] = await Promise.all([api.listUsers(), api.audit(), api.backups()])
    setUsers(u.items || [])
    setAudit(a.items || [])
    setBackups(b.items || [])
  }

  useEffect(() => { void reload() }, [])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold text-slate-800">مدیریت سامانه</h1>
        <p className="text-xs text-slate-400 mt-1">کاربران، ممیزی، پشتیبان</p>
      </header>

      <form
        className="glass-card rounded-[28px] p-5 grid gap-3 md:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault()
          await api.saveUser(form)
          setForm({ username: '', displayName: '', role: 'operator', password: '' })
          setMessage('کاربر ایجاد شد.')
          await reload()
        }}
      >
        <h2 className="md:col-span-2 text-sm font-semibold">کاربر جدید</h2>
        <Field label="نام کاربری" value={form.username} onChange={(v) => setForm((c) => ({ ...c, username: v }))} />
        <Field label="نام نمایشی" value={form.displayName} onChange={(v) => setForm((c) => ({ ...c, displayName: v }))} />
        <Field label="نقش (admin|operator|viewer)" value={form.role} onChange={(v) => setForm((c) => ({ ...c, role: v }))} />
        <Field label="رمز" value={form.password} onChange={(v) => setForm((c) => ({ ...c, password: v }))} />
        <div className="md:col-span-2">
          <button type="submit" className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold">افزودن کاربر</button>
        </div>
      </form>

      <div className="glass-card rounded-[28px] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="text-right px-4 py-2">کاربر</th>
              <th className="text-right px-4 py-2">نقش</th>
              <th className="text-right px-4 py-2">حذف</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-white/10">
                <td className="px-4 py-2">{user.displayName} ({user.username})</td>
                <td className="px-4 py-2">{user.role}</td>
                <td className="px-4 py-2">
                  {user.id !== 'admin' && (
                    <button type="button" className="text-xs text-rose-400" onClick={() => void api.deleteUser(user.id).then(reload)}>حذف</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        className="glass-card rounded-[28px] p-5 grid gap-3 md:grid-cols-2 max-w-2xl"
        onSubmit={async (event) => {
          event.preventDefault()
          await api.changePassword(passwordForm.currentPassword, passwordForm.newPassword)
          setPasswordForm({ currentPassword: '', newPassword: '' })
          setMessage('رمز شما تغییر کرد.')
        }}
      >
        <h2 className="md:col-span-2 text-sm font-semibold">تغییر رمز خود</h2>
        <Field label="رمز فعلی" value={passwordForm.currentPassword} onChange={(v) => setPasswordForm((c) => ({ ...c, currentPassword: v }))} />
        <Field label="رمز جدید" value={passwordForm.newPassword} onChange={(v) => setPasswordForm((c) => ({ ...c, newPassword: v }))} />
        <button type="submit" className="md:col-span-2 btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold w-fit">ذخیره رمز</button>
      </form>

      <div className="flex gap-3 items-center">
        <button type="button" className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold" onClick={() => void api.createBackup().then((r) => { setMessage(`پشتیبان: ${r.name}`); return reload() })}>
          ایجاد پشتیبان
        </button>
        {message && <p className="text-xs text-slate-400">{message}</p>}
      </div>
      <div className="glass-card rounded-[28px] overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 text-sm font-semibold">فایل‌های پشتیبان</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="text-right px-4 py-2">نام</th>
              <th className="text-right px-4 py-2">حجم</th>
              <th className="text-right px-4 py-2">تاریخ</th>
              <th className="text-right px-4 py-2">بازیابی</th>
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">پشتیبانی نیست.</td></tr>
            ) : backups.map((item) => (
              <tr key={item.name} className="border-t border-white/10">
                <td className="px-4 py-2 text-xs">{item.name}</td>
                <td className="px-4 py-2">{item.size}</td>
                <td className="px-4 py-2 text-xs">{item.modifiedAt}</td>
                <td className="px-4 py-2">
                  <button type="button" className="text-xs text-amber-400" onClick={() => void api.restoreBackup(item.name).then(() => setMessage(`بازیابی شد: ${item.name}`))}>
                    بازیابی
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="rounded-2xl px-4 py-2.5 text-xs bg-white/10 self-start" onClick={() => void api.exportJson().then((r) => setMessage(`خروجی JSON: ${r.exported.join(', ')}`))}>
        خروجی JSON از دیتابیس به فایل
      </button>
      <ListTable title="گزارش ممیزی (آخرین رویدادها)" columns={['at', 'action', 'user', 'path']} items={audit} />
    </div>
  )
}

function ListTable({ title, columns, items }: { title: string; columns: string[]; items: any[] }) {
  return (
    <div className="glass-card rounded-[28px] overflow-hidden">
      <div className="px-5 py-3 border-b border-white/10 text-sm font-semibold">{title}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400">
            {columns.map((col) => <th key={col} className="text-right px-4 py-2">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">موردی نیست.</td></tr>
          ) : items.map((item, index) => (
            <tr key={item.id || index} className="border-t border-white/10">
              {columns.map((col) => <td key={col} className="px-4 py-2 text-xs">{String(item[col] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SipSettingsView() {
  const [sip, setSip] = useState<any>(null)
  const [message, setMessage] = useState('')
  useEffect(() => { void api.getSip().then((payload) => setSip(payload.sip)) }, [])
  if (!sip) return <LoadingMark label="بارگذاری SIP/RTP..." large />
  return (
    <SettingsForm
      title="تنظیمات SIP و RTP"
      subtitle="آدرس bind، پورت‌ها، IP خارجی و شبکه محلی"
      message={message}
      onSave={async () => {
        await api.saveSip(sip)
        setMessage('ذخیره و تولید پیکربندی انجام شد.')
      }}
    >
      {([
        ['bindIp', 'IP گوش‌دادن'],
        ['sipPort', 'پورت SIP'],
        ['rtpStart', 'شروع RTP'],
        ['rtpEnd', 'پایان RTP'],
        ['externalIp', 'IP خارجی (NAT)'],
        ['provisionHost', 'آدرس سرور برای گوشی سیسکو'],
        ['ciscoLoad', 'نام فریم‌ور SIP42'],
        ['localNets', 'شبکه‌های محلی (با ویرگول)'],
      ] as const).map(([key, label]) => (
        <Field
          key={key}
          label={label}
          value={Array.isArray(sip[key]) ? sip[key].join(', ') : sip[key] ?? ''}
          onChange={(value) => setSip((current: any) => ({
            ...current,
            [key]: key === 'localNets' ? value.split(',').map((part) => part.trim()).filter(Boolean) : key.includes('Port') || key.includes('rtp') || key.includes('End') || key.includes('Start') ? Number(value) || value : value,
          }))}
        />
      ))}
      <label className="flex items-center gap-2 text-sm text-slate-400">
        <input type="checkbox" checked={Boolean(sip.udpEnabled)} onChange={(e) => setSip((c: any) => ({ ...c, udpEnabled: e.target.checked }))} />
        UDP
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-400">
        <input type="checkbox" checked={Boolean(sip.tcpEnabled)} onChange={(e) => setSip((c: any) => ({ ...c, tcpEnabled: e.target.checked }))} />
        TCP
      </label>
    </SettingsForm>
  )
}

export function AmiSettingsView() {
  const [ami, setAmi] = useState<any>(null)
  const [message, setMessage] = useState('')
  useEffect(() => { void api.getAmi().then((payload) => setAmi({ ...payload.ami, secret: '' })) }, [])
  if (!ami) return <LoadingMark label="بارگذاری AMI..." large />
  return (
    <SettingsForm
      title="تنظیمات AMI"
      subtitle="رابط مدیریت Asterisk برای اتصال UI"
      message={message}
      onSave={async () => {
        const payload = { ...ami }
        if (!payload.secret) delete payload.secret
        await api.saveAmi(payload)
        setMessage('AMI ذخیره شد.')
      }}
    >
      <Field label="Bind IP" value={ami.bindIp || ''} onChange={(value) => setAmi((c: any) => ({ ...c, bindIp: value }))} />
      <Field label="پورت" value={ami.port || ''} onChange={(value) => setAmi((c: any) => ({ ...c, port: Number(value) }))} />
      <Field label="کاربر" value={ami.username || ''} onChange={(value) => setAmi((c: any) => ({ ...c, username: value }))} />
      <Field label="رمز جدید" value={ami.secret || ''} onChange={(value) => setAmi((c: any) => ({ ...c, secret: value }))} />
      <label className="flex items-center gap-2 text-sm text-slate-400">
        <input type="checkbox" checked={Boolean(ami.enabled)} onChange={(e) => setAmi((c: any) => ({ ...c, enabled: e.target.checked }))} />
        فعال
      </label>
    </SettingsForm>
  )
}

export function NetworkView() {
  const [data, setData] = useState<any>(null)
  const [desired, setDesired] = useState<any>(null)
  const [message, setMessage] = useState('')
  async function reload() {
    const payload = await api.network()
    setData(payload)
    setDesired({
      hostname: payload.desired.hostname || payload.live.hostname || '',
      gateway: payload.desired.gateway || '',
      dns: (payload.desired.dns?.length ? payload.desired.dns : payload.live.dns || []).join(', '),
      interfaces: payload.desired.interfaces || [],
    })
  }
  useEffect(() => { void reload() }, [])
  if (!data || !desired) return <LoadingMark label="خواندن شبکه سیستم..." large />
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-slate-800">شبکه و IP</h1>
        <p className="text-xs text-slate-400 mt-1">وضعیت زنده سیستم + پیکربندی مطلوب CIWA</p>
      </header>
      {!data.live.readable && (
        <p className="glass-card rounded-2xl px-4 py-3 text-sm text-slate-400">خواندن کامل شبکه محدود است: {data.live.error}</p>
      )}
      <div className="glass-card rounded-[28px] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 text-sm font-semibold">اینترفیس‌های زنده</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400">
                <th className="text-right px-5 py-3">نام</th>
                <th className="text-right px-5 py-3">وضعیت</th>
                <th className="text-right px-5 py-3">آدرس‌ها</th>
              </tr>
            </thead>
            <tbody>
              {(data.live.interfaces || []).map((iface: any) => (
                <tr key={iface.name} className="border-t border-white/10">
                  <td className="px-5 py-3 font-mono text-xs">{iface.name}</td>
                  <td className="px-5 py-3">{iface.state}</td>
                  <td className="px-5 py-3 text-xs">{(iface.addresses || []).map((addr: any) => `${addr.address}/${addr.prefix}`).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SettingsForm
        title="پیکربندی مطلوب"
        subtitle="ذخیره در config/ciwa — اعمال نیاز به دسترسی سیستم دارد"
        message={message}
        onSave={async () => {
          await api.saveNetwork({
            hostname: desired.hostname,
            gateway: desired.gateway,
            dns: String(desired.dns || '').split(',').map((part: string) => part.trim()).filter(Boolean),
            interfaces: desired.interfaces,
          })
          setMessage('ذخیره شد.')
          await reload()
        }}
      >
        <Field label="Hostname" value={desired.hostname} onChange={(value) => setDesired((c: any) => ({ ...c, hostname: value }))} />
        <Field label="Gateway" value={desired.gateway} onChange={(value) => setDesired((c: any) => ({ ...c, gateway: value }))} />
        <Field label="DNS (با ویرگول)" value={desired.dns} onChange={(value) => setDesired((c: any) => ({ ...c, dns: value }))} />
        <Field
          label="اینترفیس‌ها JSON"
          value={JSON.stringify(desired.interfaces || [], null, 2)}
          onChange={(value) => {
            try { setDesired((c: any) => ({ ...c, interfaces: JSON.parse(value || '[]') })) } catch { /* keep typing */ }
          }}
        />
        <button
          type="button"
          className="rounded-2xl px-4 py-2.5 text-xs font-semibold bg-white/10"
          onClick={async () => {
            const result = await api.applyNetwork()
            setMessage(result.note || (result.ok ? 'اعمال شد' : result.stderr || ''))
          }}
        >
          اعمال روی سیستم
        </button>
      </SettingsForm>
    </div>
  )
}

export function FirewallView() {
  const [data, setData] = useState<any>(null)
  const [rule, setRule] = useState({ protocol: 'tcp', port: '', source: 'any', action: 'accept', comment: '' })
  const [message, setMessage] = useState('')
  async function reload() {
    setData(await api.firewall())
  }
  useEffect(() => { void reload() }, [])
  if (!data) return <LoadingMark label="خواندن فایروال..." large />
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-bold text-slate-800">فایروال</h1>
        <p className="text-xs text-slate-400 mt-1">قوانین مطلوب CIWA + وضعیت زنده nft/iptables</p>
      </header>
      <p className="glass-card rounded-2xl px-4 py-3 text-sm text-slate-400">
        Backend زنده: {data.live.backend} {data.live.readable ? '' : `— ${data.live.error}`}
      </p>
      <form
        className="glass-card rounded-[28px] p-5 grid gap-3 md:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault()
          await api.addFirewallRule(rule)
          setRule({ protocol: 'tcp', port: '', source: 'any', action: 'accept', comment: '' })
          setMessage('قانون ذخیره شد.')
          await reload()
        }}
      >
        <Field label="پروتکل" value={rule.protocol} onChange={(value) => setRule((c) => ({ ...c, protocol: value }))} />
        <Field label="پورت / بازه" value={rule.port} onChange={(value) => setRule((c) => ({ ...c, port: value }))} />
        <Field label="منبع" value={rule.source} onChange={(value) => setRule((c) => ({ ...c, source: value }))} />
        <Field label="عمل" value={rule.action} onChange={(value) => setRule((c) => ({ ...c, action: value }))} />
        <Field label="توضیح" value={rule.comment} onChange={(value) => setRule((c) => ({ ...c, comment: value }))} />
        <div className="md:col-span-2 flex gap-3">
          <button type="submit" className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold">افزودن قانون</button>
          <button
            type="button"
            className="rounded-2xl px-4 py-2.5 text-xs font-semibold bg-white/10"
            onClick={async () => {
              const result = await api.applyFirewall()
              setMessage(result.note || result.stderr || '')
            }}
          >
            اعمال فایروال
          </button>
        </div>
        {message && <p className="md:col-span-2 text-xs text-slate-400">{message}</p>}
      </form>
      <div className="glass-card rounded-[28px] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="text-right px-5 py-3">پروتکل</th>
              <th className="text-right px-5 py-3">پورت</th>
              <th className="text-right px-5 py-3">منبع</th>
              <th className="text-right px-5 py-3">عمل</th>
              <th className="text-right px-5 py-3">توضیح</th>
              <th className="text-right px-5 py-3">حذف</th>
            </tr>
          </thead>
          <tbody>
            {(data.desired.rules || []).map((item: any) => (
              <tr key={item.id} className="border-t border-white/10">
                <td className="px-5 py-3">{item.protocol}</td>
                <td className="px-5 py-3">{item.port}</td>
                <td className="px-5 py-3">{item.source}</td>
                <td className="px-5 py-3">{item.action}</td>
                <td className="px-5 py-3">{item.comment}</td>
                <td className="px-5 py-3">
                  <button type="button" className="text-xs text-rose-400" onClick={() => void api.removeFirewallRule(item.id).then(reload)}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.live.ruleset && (
        <pre className="glass-card rounded-[28px] p-4 text-[11px] overflow-auto max-h-80 text-slate-400 whitespace-pre-wrap">{data.live.ruleset}</pre>
      )}
    </div>
  )
}

export function DatabaseSettingsView() {
  const [status, setStatus] = useState<any>(null)
  const [driver, setDriver] = useState<'file' | 'postgres' | 'mysql'>('file')
  const [postgres, setPostgres] = useState<any>({})
  const [mysql, setMysql] = useState<any>({})
  const [message, setMessage] = useState('')

  async function reload() {
    const payload = await api.getDatabase()
    setStatus(payload)
    setDriver(payload.config.driver || 'file')
    setPostgres(payload.config.postgres || {})
    setMysql(payload.config.mysql || {})
  }

  useEffect(() => { void reload() }, [])

  if (!status) return <LoadingMark label="بارگذاری تنظیمات دیتابیس..." large />

  const body = { driver, postgres, mysql }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <header>
        <h1 className="text-xl font-bold text-slate-800">تنظیمات دیتابیس</h1>
        <p className="text-xs text-slate-400 mt-1">
          حالت فعال: <strong>{status.active}</strong>
          {status.usingDatabase ? ' (سرور خارجی)' : ' (فایل‌های config/ciwa)'}
        </p>
      </header>

      <div className="glass-card rounded-[28px] p-5 flex flex-col gap-3">
        <label className="text-xs text-slate-400 flex flex-col gap-1.5">
          درایور
          <select className="glass-input rounded-xl px-3 py-2.5 text-sm" value={driver} onChange={(e) => setDriver(e.target.value as typeof driver)}>
            <option value="file">فایل محلی (پیش‌فرض)</option>
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL / MariaDB</option>
          </select>
        </label>

        {driver === 'postgres' && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Host" value={postgres.host || ''} onChange={(v) => setPostgres((c: any) => ({ ...c, host: v }))} />
            <Field label="Port" value={postgres.port || 5432} onChange={(v) => setPostgres((c: any) => ({ ...c, port: Number(v) }))} />
            <Field label="Database" value={postgres.database || ''} onChange={(v) => setPostgres((c: any) => ({ ...c, database: v }))} />
            <Field label="User" value={postgres.user || ''} onChange={(v) => setPostgres((c: any) => ({ ...c, user: v }))} />
            <Field label="Password" value={postgres.password === '********' ? '' : postgres.password || ''} onChange={(v) => setPostgres((c: any) => ({ ...c, password: v }))} />
            <label className="flex items-center gap-2 text-sm text-slate-400 md:col-span-2">
              <input type="checkbox" checked={Boolean(postgres.ssl)} onChange={(e) => setPostgres((c: any) => ({ ...c, ssl: e.target.checked }))} />
              SSL
            </label>
          </div>
        )}

        {driver === 'mysql' && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Host" value={mysql.host || ''} onChange={(v) => setMysql((c: any) => ({ ...c, host: v }))} />
            <Field label="Port" value={mysql.port || 3306} onChange={(v) => setMysql((c: any) => ({ ...c, port: Number(v) }))} />
            <Field label="Database" value={mysql.database || ''} onChange={(v) => setMysql((c: any) => ({ ...c, database: v }))} />
            <Field label="User" value={mysql.user || ''} onChange={(v) => setMysql((c: any) => ({ ...c, user: v }))} />
            <Field label="Password" value={mysql.password === '********' ? '' : mysql.password || ''} onChange={(v) => setMysql((c: any) => ({ ...c, password: v }))} />
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button type="button" className="rounded-2xl px-4 py-2.5 text-xs bg-white/10" onClick={() => void api.testDatabase(body).then((r) => setMessage(r.message || 'تست انجام شد'))}>
            تست اتصال
          </button>
          <button type="button" className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold" onClick={() => void api.applyDatabase(body).then(() => reload()).then(() => setMessage('تنظیمات اعمال و سرویس به دیتابیس متصل شد.'))}>
            ذخیره و اتصال
          </button>
          <button type="button" className="rounded-2xl px-4 py-2.5 text-xs bg-white/10" onClick={() => void api.importDatabase().then((r) => {
            const data = r as { imported?: string[] }
            setMessage(`انتقال از JSON: ${(data.imported || []).join(', ')}`)
          })}>
            انتقال داده از فایل‌های JSON
          </button>
          <button type="button" className="rounded-2xl px-4 py-2.5 text-xs bg-white/10" onClick={() => void api.useFileDatabase().then(reload).then(() => setMessage('بازگشت به حالت فایل محلی'))}>
            بازگشت به فایل محلی
          </button>
        </div>
        {message && <p className="text-xs text-slate-400 leading-6">{message}</p>}
        <p className="text-[11px] text-slate-500 leading-5">
          تنظیمات اتصال همیشه در <code>config/ciwa/database.json</code> ذخیره می‌شود. داده‌های PBX، سیستم و کاربران در جداول
          <code> ciwa_documents</code> و نشست‌ها در <code>ciwa_sessions</code> نگهداری می‌شوند. می‌توانید از متغیر
          <code> CIWA_DATABASE_URL</code> برای PostgreSQL هم استفاده کنید.
        </p>
      </div>
    </div>
  )
}

export function SettingsView() {
  return (
    <div className="glass-card rounded-[28px] p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-800 mb-2">تنظیمات عمومی</h1>
      <p className="text-sm text-slate-400 leading-7">
        تنظیمات عملیاتی مرکز تلفن از منوی سیستم در دسترس است: شبکه، فایروال، SIP/RTP و AMI.
        هسته Asterisk فقط خوانده می‌شود و خروجی پیکربندی در config/asterisk نوشته می‌شود.
      </p>
    </div>
  )
}

function InfoCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="glass-card rounded-[28px] p-5">
      <h2 className="text-sm font-semibold mb-4">{title}</h2>
      <dl className="grid gap-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-slate-400">{label}</dt>
            <dd className="text-left text-xs break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function SettingsForm({
  title,
  subtitle,
  message,
  onSave,
  children,
}: {
  title: string
  subtitle: string
  message: string
  onSave: () => Promise<void>
  children: React.ReactNode
}) {
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="glass-card rounded-[28px] p-5 grid gap-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        void onSave().finally(() => setBusy(false))
      }}
    >
      <div className="md:col-span-2">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
      </div>
      {children}
      <div className="md:col-span-2 flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn-primary rounded-2xl px-4 py-2.5 text-xs font-semibold">ذخیره</button>
        {message && <p className="text-xs text-slate-400">{message}</p>}
      </div>
    </form>
  )
}

function Field({ label, value, onChange }: { label: string; value: string | number; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-slate-400 md:col-span-1">
      {label}
      <input className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
