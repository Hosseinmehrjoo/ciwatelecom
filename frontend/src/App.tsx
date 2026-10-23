import { useEffect, useState } from 'react'
import {
  Activity, Clock, Headphones, LayoutDashboard, Layers, LifeBuoy, Menu, Mic2, Moon, Network,
  Megaphone, Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, Radio, Server, Settings, Shield, Sun, Users, X,
} from 'lucide-react'
import { useTheme } from './theme/useTheme'
import { DashboardView } from './views/DashboardView'
import { useAuth } from './auth/AuthContext'
import { LoginView } from './views/LoginView'
import { ChangePasswordModal } from './views/ChangePasswordModal'
import {
  CdrView, LiveView, RecordingsView, ResourceView,
} from './views/ResourceViews'
import { CallsView, QueueMonitorView, SoftphoneView } from './views/OperativeViews'
import { PromotionalCallsView } from './views/PromotionalCallsView'
import {
  AdminView,   AmiSettingsView, DatabaseSettingsView, FirewallView, NetworkView, SettingsView, SipSettingsView, StatusView,
} from './views/SystemViews'

const navItems = [
  { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard, group: 'main' },
  { id: 'extensions', label: 'داخلی‌ها', icon: Phone, group: 'pbx' },
  { id: 'trunks', label: 'ترانک‌ها', icon: Radio, group: 'pbx' },
  { id: 'inbound-routes', label: 'مسیر ورودی', icon: PhoneIncoming, group: 'pbx' },
  { id: 'outbound-routes', label: 'مسیر خروجی', icon: PhoneOutgoing, group: 'pbx' },
  { id: 'queues', label: 'صف تماس', icon: Users, group: 'pbx' },
  { id: 'ivrs', label: 'IVR', icon: Headphones, group: 'pbx' },
  { id: 'ring-groups', label: 'گروه زنگ', icon: Layers, group: 'pbx' },
  { id: 'time-conditions', label: 'زمان‌بندی', icon: Clock, group: 'pbx' },
  { id: 'conferences', label: 'کنفرانس', icon: Mic2, group: 'pbx' },
  { id: 'voicemail', label: 'صندوق صوتی', icon: PhoneCall, group: 'pbx' },
  { id: 'moh', label: 'موزیک انتظار', icon: Headphones, group: 'pbx' },
  { id: 'promo-calls', label: 'تماس تبلیغاتی', icon: Megaphone, group: 'marketing' },
  { id: 'calls', label: 'برقراری تماس', icon: PhoneCall, group: 'reports' },
  { id: 'softphone', label: 'Softphone', icon: Phone, group: 'reports' },
  { id: 'queue-live', label: 'صف زنده', icon: Users, group: 'reports' },
  { id: 'cdr', label: 'گزارش تماس', icon: Activity, group: 'reports' },
  { id: 'recordings', label: 'ضبط‌ها', icon: Mic2, group: 'reports' },
  { id: 'live', label: 'مانیتور زنده', icon: Server, group: 'reports' },
  { id: 'status', label: 'وضعیت هسته', icon: Server, group: 'system' },
  { id: 'network', label: 'شبکه و IP', icon: Network, group: 'system' },
  { id: 'firewall', label: 'فایروال', icon: Shield, group: 'system' },
  { id: 'sip', label: 'SIP / RTP', icon: Radio, group: 'system' },
  { id: 'ami', label: 'AMI', icon: Settings, group: 'system' },
  { id: 'database', label: 'تنظیمات دیتابیس', icon: Server, group: 'system', adminOnly: true },
  { id: 'settings', label: 'تنظیمات', icon: Settings, group: 'system' },
  { id: 'admin', label: 'مدیریت سامانه', icon: Shield, group: 'system', adminOnly: true },
] as const

type Section = (typeof navItems)[number]['id']

const groupLabel: Record<string, string> = {
  main: '',
  pbx: 'مرکز تلفن',
  marketing: 'تماس تبلیغاتی',
  reports: 'گزارش و مانیتور',
  system: 'سیستم و هسته',
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Phone
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-right ${active ? 'active' : 'text-slate-500'}`}
    >
      <Icon size={17} className="shrink-0" />
      <span>{label}</span>
    </button>
  )
}

function canAccess(item: (typeof navItems)[number] & { adminOnly?: boolean }, role: string | undefined) {
  if (item.adminOnly && role !== 'admin') return false
  if (role === 'viewer' && item.group === 'system' && item.id !== 'status') return false
  if (role === 'viewer' && ['calls', 'softphone', 'queue-live', 'promo-calls'].includes(item.id)) return false
  return true
}

export default function App() {
  const { user, loading, logout, authDisabled } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [section, setSection] = useState<Section>('dashboard')
  const [navOpen, setNavOpen] = useState(false)
  const [compactNav, setCompactNav] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)')
    const sync = () => setCompactNav(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!compactNav) setNavOpen(false)
  }, [compactNav])

  function openSection(id: Section) {
    setSection(id)
    setNavOpen(false)
  }

  const groups = ['main', 'pbx', 'marketing', 'reports', 'system']
  const role = user?.role

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center vision-app text-slate-400 text-sm">بارگذاری...</div>
  }
  if (!user && !authDisabled) {
    return <LoginView />
  }

  return (
    <div className="vision-app flex min-h-screen" style={{ fontFamily: "'Vazirmatn', sans-serif" }}>
      <ChangePasswordModal />
      {navOpen && (
        <button type="button" aria-label="بستن منو" className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} />
      )}

      <aside
        id="app-nav"
        inert={compactNav && !navOpen ? true : undefined}
        aria-hidden={compactNav && !navOpen}
        className={`glass-sidebar w-[min(18rem,88vw)] lg:w-64 shrink-0 fixed z-30 flex flex-col overflow-hidden top-0 bottom-0 right-0 rounded-none transition-transform duration-200 lg:top-3 lg:bottom-3 lg:right-3 lg:rounded-[28px] lg:translate-x-0 ${navOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
      >
        <div className="p-4 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/ciwa-brand.jpg" alt="CIWA Telecom" className="h-10 w-10 rounded-xl object-cover" />
            <div>
              <p className="text-sm font-bold leading-none brand-text">CIWA Telecom</p>
              <p className="text-xs text-slate-400 mt-0.5">مرکز تلفن ساده</p>
            </div>
          </div>
          <button type="button" aria-label="بستن منو" className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:bg-white/10" onClick={() => setNavOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
          {groups.map((group) => (
            <div key={group} className="mb-2">
              {groupLabel[group] && <p className="px-3 py-2 text-[11px] font-bold text-slate-500">{groupLabel[group]}</p>}
              {navItems.filter((item) => item.group === group && canAccess(item, role)).map((item) => (
                <SidebarItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={section === item.id}
                  onClick={() => openSection(item.id)}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="p-3 pb-4">
          <div className="glass-card rounded-[22px] p-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(232,121,249,0.2)', border: '1px solid rgba(232,121,249,0.35)' }}>
              <LifeBuoy size={16} className="ciwa-accent" />
            </div>
            <p className="text-sm font-semibold text-slate-800 mb-1">پشتیبانی سیوا</p>
            <p className="text-xs text-slate-400 leading-5 mb-3">هسته دست‌نخورده می‌ماند؛ همه تنظیمات از UI.</p>
            <a href="https://ciwa.ir" className="btn-primary block text-center w-full rounded-xl py-2 text-xs font-semibold">ciwa.ir</a>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 lg:mr-[17.5rem] flex flex-col min-h-screen">
        <header className="glass-bar sticky top-3 z-10 mx-3 mt-3 flex flex-col gap-3 px-3 py-3 rounded-[24px] sm:mx-4 lg:flex-row lg:items-center lg:justify-between lg:px-4 lg:gap-4">
          <div className="flex items-center gap-2 min-w-0 sm:gap-3">
            <button
              type="button"
              aria-label="منو"
              aria-expanded={navOpen}
              aria-controls="app-nav"
              className="lg:hidden w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-slate-600 hover:bg-white/10"
              onClick={() => setNavOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div className="flex flex-col items-end min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-none">{user?.displayName || 'کاربر'}</p>
              <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">{user?.role || '—'} · CIWA Telecom</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white text-sm font-semibold"
              style={{ background: 'linear-gradient(135deg, #e879f9, #6366f1 50%, #3b82f6)' }}
              title="خروج"
            >
              {(user?.displayName || 'U').slice(0, 1)}
            </button>
            <div className="hidden sm:block w-px h-8 bg-white/15" />
            <div className="flex items-center gap-0.5 mr-auto sm:mr-0 sm:gap-1">
              <button type="button" aria-label={theme === 'dark' ? 'حالت روشن' : 'حالت تیره'} onClick={toggleTheme} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-white">
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button type="button" aria-label="تنظیمات" onClick={() => openSection('settings')} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-white">
                <Settings size={17} />
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-400 lg:text-left">بدون داده جعلی · هسته فقط خواندنی · پیکربندی در config/</div>
        </header>

        <div className="flex-1 min-w-0 p-3 sm:p-5 flex flex-col gap-5 overflow-y-auto">
          {section === 'dashboard' && <DashboardView onOpen={(id) => openSection(id as Section)} />}
          {section === 'extensions' && <ResourceView catalogKey="extensions" />}
          {section === 'trunks' && <ResourceView catalogKey="trunks" />}
          {section === 'inbound-routes' && <ResourceView catalogKey="inbound-routes" />}
          {section === 'outbound-routes' && <ResourceView catalogKey="outbound-routes" />}
          {section === 'queues' && <ResourceView catalogKey="queues" />}
          {section === 'ivrs' && <ResourceView catalogKey="ivrs" />}
          {section === 'ring-groups' && <ResourceView catalogKey="ring-groups" />}
          {section === 'time-conditions' && <ResourceView catalogKey="time-conditions" />}
          {section === 'conferences' && <ResourceView catalogKey="conferences" />}
          {section === 'voicemail' && <ResourceView catalogKey="voicemail" />}
          {section === 'moh' && <ResourceView catalogKey="moh" />}
          {section === 'promo-calls' && <PromotionalCallsView />}
          {section === 'calls' && <CallsView />}
          {section === 'softphone' && <SoftphoneView />}
          {section === 'queue-live' && <QueueMonitorView />}
          {section === 'cdr' && <CdrView />}
          {section === 'recordings' && <RecordingsView />}
          {section === 'live' && <LiveView />}
          {section === 'status' && <StatusView />}
          {section === 'network' && <NetworkView />}
          {section === 'firewall' && <FirewallView />}
          {section === 'sip' && <SipSettingsView />}
          {section === 'ami' && <AmiSettingsView />}
          {section === 'database' && <DatabaseSettingsView />}
          {section === 'settings' && <SettingsView />}
          {section === 'admin' && role === 'admin' && <AdminView />}
        </div>
      </main>
    </div>
  )
}
