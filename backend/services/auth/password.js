import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LEN = 64

export function hashPassword(password, saltHex = randomBytes(16).toString('hex')) {
  const salt = Buffer.from(saltHex, 'hex')
  const hash = scryptSync(String(password), salt, KEY_LEN)
  return { salt: saltHex, hash: hash.toString('hex') }
}

export function verifyPassword(password, saltHex, hashHex) {
  try {
    const { hash } = hashPassword(password, saltHex)
    const a = Buffer.from(hash, 'hex')
    const b = Buffer.from(String(hashHex || ''), 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function assertPasswordStrength(password) {
  const value = String(password ?? '')
  if (value.length < 8 || value.length > 128) {
    const error = new Error('رمز عبور باید بین ۸ تا ۱۲۸ نویسه باشد.')
    error.status = 400
    throw error
  }
  if (/[\r\n\0]/.test(value)) {
    const error = new Error('رمز عبور نویسه کنترلی دارد.')
    error.status = 400
    throw error
  }
  return value
}
