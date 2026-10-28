import { findUserById, sanitizeUser } from './authStore.js'
import { getSession } from './sessions.js'

export function authDisabled() {
  if (process.env.CIWA_ENV === 'production') return false
  return process.env.CIWA_DISABLE_AUTH === '1' || process.env.CIWA_DISABLE_AUTH === 'true'
}

export function attachUser(req, _res, next) {
  if (authDisabled()) {
    req.user = { id: 'dev', username: 'dev', role: 'admin', displayName: 'Dev' }
    return next()
  }
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const session = getSession(token)
  if (!session) {
    req.user = null
    return next()
  }
  const user = findUserById(session.userId)
  req.user = user ? sanitizeUser(user) : null
  next()
}

const PASSWORD_CHANGE_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/change-password',
])

export function requireAuth(req, res, next) {
  if (authDisabled()) return next()
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized', message: 'ورود لازم است.' })
    return
  }
  if (req.user.mustChangePassword) {
    const full = routePath(req)
    if (!PASSWORD_CHANGE_PATHS.has(full)) {
      res.status(403).json({
        error: 'password_change_required',
        message: 'قبل از ادامه، رمز عبور را عوض کنید.',
      })
      return
    }
  }
  next()
}

const roleRank = { viewer: 1, operator: 2, admin: 3 }

export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (authDisabled()) return next()
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'ورود لازم است.' })
      return
    }
    if ((roleRank[req.user.role] || 0) < (roleRank[minRole] || 99)) {
      res.status(403).json({ error: 'forbidden', message: 'دسترسی کافی ندارید.' })
      return
    }
    next()
  }
}

export function routePath(req) {
  const raw = String(req.originalUrl || '')
  const pathOnly = raw.split('?')[0]
  if (pathOnly.startsWith('/api/')) return pathOnly
  const base = req.baseUrl || ''
  const path = req.path || ''
  if (base && path) return `${base}${path.startsWith('/') ? path : `/${path}`}`
  return path
}

export function methodRole(req) {
  const path = routePath(req)
  if (path === '/api/health' || path === '/api/health/ready' || path === '/api/auth/login') return null
  if (path.startsWith('/api/auth/users') || path.startsWith('/api/audit')) return 'admin'
  if (path.startsWith('/api/settings/') || path.startsWith('/api/system/')) return 'admin'
  if (path.startsWith('/api/calls/') || path.startsWith('/api/configs/')) return 'operator'
  if (path.startsWith('/api/campaigns') || path.startsWith('/api/exports/')) return 'operator'
  if (path.startsWith('/api/queues/member/')) return 'operator'
  if (req.method === 'GET' || req.method === 'HEAD') return 'viewer'
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') return 'operator'
  return 'viewer'
}

export function enforceRouteRole(req, res, next) {
  const minRole = methodRole(req)
  if (!minRole) return next()
  return requireMinRole(minRole)(req, res, next)
}
