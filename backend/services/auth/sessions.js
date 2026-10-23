import { randomBytes } from 'node:crypto'
import { readJson, resolvePath, writeJson } from '../store/fsutil.js'
import { isDatabaseDriver } from '../store/databaseConfig.js'
import {
  dbDeleteSession,
  dbDeleteUserSessions,
  dbListSessions,
  dbPruneSessions,
  dbUpsertSession,
} from '../store/db/drivers.js'
import { sessionTtlMs } from './authStore.js'

const SESSION_PATH = resolvePath('config/ciwa/sessions.json')

let tokenCache = null

function loadFileTokens() {
  const data = readJson(SESSION_PATH, { tokens: {} })
  return data.tokens && typeof data.tokens === 'object' ? data.tokens : {}
}

function saveFileTokens(tokens) {
  writeJson(SESSION_PATH, { tokens })
}

function prune(tokens) {
  const now = Date.now()
  const next = {}
  for (const [token, session] of Object.entries(tokens)) {
    if (session?.expiresAt > now) next[token] = session
  }
  return next
}

export async function initSessions() {
  if (isDatabaseDriver()) {
    await dbPruneSessions()
    tokenCache = await dbListSessions()
  } else {
    tokenCache = prune(loadFileTokens())
    saveFileTokens(tokenCache)
  }
}

function tokens() {
  if (!tokenCache) tokenCache = prune(loadFileTokens())
  return tokenCache
}

export function createSession(user) {
  const token = randomBytes(32).toString('hex')
  const all = prune(tokens())
  all[token] = {
    userId: user.id,
    role: user.role,
    username: user.username,
    expiresAt: Date.now() + sessionTtlMs(),
  }
  tokenCache = all
  if (isDatabaseDriver()) {
    void dbUpsertSession(token, all[token])
  } else {
    saveFileTokens(all)
  }
  return { token, expiresAt: all[token].expiresAt }
}

export function getSession(token) {
  if (!token) return null
  const all = prune(tokens())
  const session = all[token]
  if (!session) {
    tokenCache = all
    if (!isDatabaseDriver()) saveFileTokens(all)
    return null
  }
  if (session.expiresAt <= Date.now()) {
    delete all[token]
    tokenCache = all
    if (isDatabaseDriver()) void dbDeleteSession(token)
    else saveFileTokens(all)
    return null
  }
  tokenCache = all
  return session
}

export function revokeSession(token) {
  const all = prune(tokens())
  delete all[token]
  tokenCache = all
  if (isDatabaseDriver()) void dbDeleteSession(token)
  else saveFileTokens(all)
}

export function revokeUserSessions(userId) {
  const all = prune(tokens())
  for (const [token, session] of Object.entries(all)) {
    if (session.userId === userId) delete all[token]
  }
  tokenCache = all
  if (isDatabaseDriver()) void dbDeleteUserSessions(userId)
  else saveFileTokens(all)
}
