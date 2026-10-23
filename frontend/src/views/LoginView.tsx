import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export function LoginView() {
  const { login } = useAuth()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود ناموفق')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 vision-app" style={{ fontFamily: "'Vazirmatn', sans-serif" }}>
      <form onSubmit={onSubmit} className="glass-card w-full max-w-md rounded-[28px] p-8 flex flex-col gap-4">
        <div className="text-center mb-2">
          <img src="/ciwa-brand.jpg" alt="CIWA" className="h-14 w-14 rounded-2xl mx-auto mb-3 object-cover" />
          <h1 className="text-lg font-bold text-slate-800">ورود به CIWA Telecom</h1>
          <p className="text-xs text-slate-400 mt-1">مرکز تلفن داخل سازمان</p>
        </div>
        <label className="flex flex-col gap-1.5 text-xs text-slate-400">
          نام کاربری
          <input className="glass-input rounded-xl px-3 py-2.5 text-sm" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-slate-400">
          رمز عبور
          <input type="password" className="glass-input rounded-xl px-3 py-2.5 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary rounded-2xl py-3 text-sm font-semibold mt-2">
          {busy ? 'در حال ورود...' : 'ورود'}
        </button>
        <p className="text-[11px] text-slate-500 text-center leading-5">در نصب اولیه: کاربر admin و رمز admin — پس از ورود رمز را تغییر دهید.</p>
      </form>
    </div>
  )
}
