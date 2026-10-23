import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LEN = 64

export function hashPassword(password, saltHex = randomBytes(16).toString('hex')) {
  const salt = Buffer.from(saltHex, 'hex')
  const hash = scryptSync(String(password), salt, KEY_LEN)
  return { salt: saltHex, hash: hash.toString('hex') }
}

export function verifyPassword(password, saltHex, hashHex) {
  const { hash } = hashPassword(password, saltHex)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(hashHex, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
