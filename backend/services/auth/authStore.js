import { uid, resolvePath, writeJson } from '../store/fsutil.js'
import { loadDocumentSync, primeCache, saveDocument } from '../store/documentStore.js'
import { assertPasswordStrength, hashPassword, verifyPassword } from './password.js'

const DUMMY = hashPassword('ciwa-dummy-password', 'ab'.repeat(16))

const AUTH_PATH = resolvePath('config/ciwa/auth.json')

const defaultAuth = () => ({
  version: 1,
  sessionTtlHours: 24,
  users: [],
})

export function loadAuth() {
  const data = loadDocumentSync('auth', null)
  if (!data || !Array.isArray(data.users) || data.users.length === 0) {
    return bootstrapAuthSync()
  }
  return { ...defaultAuth(), ...data }
}

function bootstrapAuthSync() {
  const { salt, hash } = hashPassword('admin')
  const auth = {
    ...defaultAuth(),
    users: [
      {
        id: 'admin',
        username: 'admin',
        displayName: 'مدیر سیستم',
        role: 'admin',
        salt,
        passwordHash: hash,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      },
    ],
    bootstrapNote: 'رمز اولیه admin است — پس از نصب حتماً تغییر دهید.',
  }
  writeJson(AUTH_PATH, auth)
  primeCache('auth', auth)
  console.warn('[CIWA] auth created — default login: admin / admin')
  return auth
}

export function findUserByUsername(username) {
  const auth = loadAuth()
  const needle = String(username || '').trim().toLowerCase()
  return auth.users.find((user) => user.username.toLowerCase() === needle) || null
}

export function findUserById(id) {
  const auth = loadAuth()
  return auth.users.find((user) => user.id === id) || null
}

export function authenticate(username, password) {
  const user = findUserByUsername(username)
  const salt = user?.salt || DUMMY.salt
  const hash = user?.passwordHash || DUMMY.hash
  const ok = verifyPassword(password, salt, hash)
  if (!user || !ok) return null
  return sanitizeUser(user)
}

export function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
  }
}

export function listUsers() {
  return loadAuth().users.map(sanitizeUser)
}

export async function upsertUser({ id, username, displayName, role, password }) {
  const auth = loadAuth()
  const roles = ['admin', 'operator', 'viewer']
  if (!roles.includes(role)) {
    const error = new Error('نقش نامعتبر است.')
    error.status = 400
    throw error
  }
  const name = String(username || '').trim()
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(name)) {
    const error = new Error('نام کاربری فقط حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط (حداکثر ۶۴ نویسه).')
    error.status = 400
    throw error
  }
  const duplicate = auth.users.find((u) => u.username.toLowerCase() === name.toLowerCase() && u.id !== id)
  if (duplicate) {
    const error = new Error('این نام کاربری قبلاً ثبت شده.')
    error.status = 409
    throw error
  }
  const userId = id || uid('user')
  const index = auth.users.findIndex((u) => u.id === userId)
  const prev = index === -1 ? null : auth.users[index]
  const record = {
    ...(prev || {}),
    id: userId,
    username: name,
    displayName: displayName || name,
    role,
    updatedAt: new Date().toISOString(),
    createdAt: prev?.createdAt || new Date().toISOString(),
  }
  if (password) {
    assertPasswordStrength(password)
    const { salt, hash } = hashPassword(password)
    record.salt = salt
    record.passwordHash = hash
    record.mustChangePassword = false
  } else if (!prev) {
    const error = new Error('رمز عبور لازم است.')
    error.status = 400
    throw error
  }
  if (prev?.role === 'admin' && role !== 'admin' && countAdmins(auth.users, userId) < 1) {
    const error = new Error('حداقل یک مدیر باید در سامانه بماند.')
    error.status = 400
    throw error
  }
  if (index === -1) auth.users.push(record)
  else auth.users[index] = record
  await saveDocument('auth', auth, defaultAuth())
  return sanitizeUser(record)
}

function countAdmins(users, ignoreId) {
  return users.filter((user) => user.id !== ignoreId && user.role === 'admin').length
}

export async function deleteUser(id) {
  const auth = loadAuth()
  const target = auth.users.find((user) => user.id === id)
  if (!target) {
    const error = new Error('کاربر پیدا نشد.')
    error.status = 404
    throw error
  }
  if (target.role === 'admin' && countAdmins(auth.users, id) < 1) {
    const error = new Error('حذف آخرین مدیر مجاز نیست.')
    error.status = 400
    throw error
  }
  auth.users = auth.users.filter((user) => user.id !== id)
  await saveDocument('auth', auth, defaultAuth())
  return { ok: true }
}

export async function changePassword(userId, currentPassword, newPassword) {
  const auth = loadAuth()
  const user = auth.users.find((u) => u.id === userId)
  if (!user) {
    const error = new Error('کاربر پیدا نشد.')
    error.status = 404
    throw error
  }
  if (!verifyPassword(currentPassword, user.salt, user.passwordHash)) {
    const error = new Error('رمز فعلی نادرست است.')
    error.status = 401
    throw error
  }
  assertPasswordStrength(newPassword)
  const { salt, hash } = hashPassword(newPassword)
  user.salt = salt
  user.passwordHash = hash
  user.mustChangePassword = false
  user.updatedAt = new Date().toISOString()
  await saveDocument('auth', auth, defaultAuth())
  return { ok: true }
}

export function sessionTtlMs() {
  const hours = Number(loadAuth().sessionTtlHours || 24)
  return Math.max(1, hours) * 60 * 60 * 1000
}
