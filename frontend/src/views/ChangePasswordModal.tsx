import { useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function ChangePasswordModal() {
  const { user, refresh } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user?.mustChangePassword) return null

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.changePassword(currentPassword, newPassword)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={onSubmit} className="glass-card w-full max-w-md rounded-[28px] p-6 flex flex-col gap-3">
        <h2 className="text-lg font-bold text-slate-800">تغییر رمز اجباری</h2>
        <p className="text-xs text-slate-400 leading-5">قبل از استفاده از سامانه، رمز پیش‌فرض را عوض کنید.</p>
        <input type="password" className="glass-input rounded-xl px-3 py-2.5 text-sm" placeholder="رمز فعلی" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        <input type="password" className="glass-input rounded-xl px-3 py-2.5 text-sm" placeholder="رمز جدید" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary rounded-2xl py-2.5 text-sm font-semibold">ذخیره رمز</button>
      </form>
    </div>
  )
}
