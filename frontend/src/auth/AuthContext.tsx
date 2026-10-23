import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setAuthToken } from '../api/client'

export type AuthUser = {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'operator' | 'viewer'
  mustChangePassword?: boolean
}

type AuthState = {
  user: AuthUser | null
  loading: boolean
  authDisabled: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const TOKEN_KEY = 'ciwa_telecom_token'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [authDisabled, setAuthDisabled] = useState(false)

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    setAuthToken(token)
    try {
      const payload = await api.me()
      setUser(payload.user)
      setAuthDisabled(Boolean(payload.authDisabled))
    } catch {
      setUser(null)
      localStorage.removeItem(TOKEN_KEY)
      setAuthToken(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const payload = await api.login(username, password)
    localStorage.setItem(TOKEN_KEY, payload.token)
    setAuthToken(payload.token)
    setUser(payload.user)
    setAuthDisabled(false)
  }, [])

  const logout = useCallback(async () => {
    try { await api.logout() } catch { /* ignore */ }
    localStorage.removeItem(TOKEN_KEY)
    setAuthToken(null)
    setUser(null)
  }, [])

  const value = useMemo(() => ({
    user, loading, authDisabled, login, logout, refresh,
  }), [user, loading, authDisabled, login, logout, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
