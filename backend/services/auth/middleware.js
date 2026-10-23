import { findUserById, sanitizeUser } from './authStore.js'
import { getSession } from './sessions.js'

export function authDisabled() {
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

export function requireAuth(req, res, next) {
  if (authDisabled() || req.user) return next()
  res.status(401).json({ error: 'unauthorized', message: 'ورود لازم است.' })
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

export function methodRole(req) {
  const path = req.path || ''
  if (path === '/api/health' || path.startsWith('/api/auth/')) return null
  if (req.method === 'GET' || req.method === 'HEAD') return 'viewer'
  if (path.startsWith('/api/system/') && (path.endsWith('/apply') || path.includes('/restore'))) return 'admin'
  if (path.startsWith('/api/settings/') || path.startsWith('/api/system/')) return 'admin'
  if (path.startsWith('/api/settings/database')) return 'admin'
  if (path.startsWith('/api/auth/users')) return 'admin'
  if (path.startsWith('/api/calls/')) return 'operator'
  if (path.startsWith('/api/configs/')) return 'operator'
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') return 'operator'
  return 'viewer'
}

export function enforceRouteRole(req, res, next) {
  const minRole = methodRole(req)
  if (!minRole) return next()
  return requireMinRole(minRole)(req, res, next)
}
