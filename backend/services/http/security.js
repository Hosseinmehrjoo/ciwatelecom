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

export function rateLimitLogin(req, res, next) {
  const windowMs = Number(process.env.CIWA_LOGIN_WINDOW_MS || 60_000)
  const max = Number(process.env.CIWA_LOGIN_MAX_ATTEMPTS || 20)
  const key = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const bucket = loginAttempts.get(key) || { count: 0, resetAt: now + windowMs }
  if (now > bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = now + windowMs
  }
  bucket.count += 1
  loginAttempts.set(key, bucket)
  if (bucket.count > max) {
    res.status(429).json({ error: 'rate_limited', message: 'تعداد تلاش ورود زیاد است. کمی بعد دوباره امتحان کنید.' })
    return
  }
  next()
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim()
}
