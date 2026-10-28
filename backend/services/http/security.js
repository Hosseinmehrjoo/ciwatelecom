import { randomBytes } from 'node:crypto'

const loginAttempts = new Map()

export function requestContext(req, res, next) {
  req.requestId = randomBytes(8).toString('hex')
  res.setHeader('X-Request-Id', req.requestId)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'microphone=(), camera=(), geolocation=()')
  if (process.env.CIWA_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
}

function loginWindowMs() {
  return Number(process.env.CIWA_LOGIN_WINDOW_MS || 5 * 60_000)
}

function loginMaxAttempts() {
  return Number(process.env.CIWA_LOGIN_MAX_ATTEMPTS || 8)
}

function loginKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown'
}

function pruneLoginAttempts(now) {
  if (loginAttempts.size < 2000) return
  for (const [key, bucket] of loginAttempts) {
    if (now > bucket.resetAt) loginAttempts.delete(key)
  }
}

export function rateLimitLogin(req, res, next) {
  const now = Date.now()
  pruneLoginAttempts(now)
  const bucket = loginAttempts.get(loginKey(req))
  if (bucket && now <= bucket.resetAt && bucket.count >= loginMaxAttempts()) {
    res.status(429).json({ error: 'rate_limited', message: 'تعداد تلاش ورود زیاد است. کمی بعد دوباره امتحان کنید.' })
    return
  }
  next()
}

export function noteLoginFailure(req) {
  const now = Date.now()
  const windowMs = loginWindowMs()
  const key = loginKey(req)
  const bucket = loginAttempts.get(key) || { count: 0, resetAt: now + windowMs }
  if (now > bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = now + windowMs
  }
  bucket.count += 1
  loginAttempts.set(key, bucket)
}

export function clearLoginFailures(req) {
  loginAttempts.delete(loginKey(req))
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim()
}
