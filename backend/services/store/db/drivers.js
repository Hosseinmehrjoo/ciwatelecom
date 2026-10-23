import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../api/package.json'))
const { Pool } = require('pg')
const mysql = require('mysql2/promise')

let pool = null
let poolDriver = null

export function closePool() {
  if (pool && poolDriver === 'postgres') {
    void pool.end()
  }
  pool = null
  poolDriver = null
}

export async function openPool(config) {
  closePool()
  if (config.driver === 'postgres') {
    pool = new Pool({
      host: config.host,
      port: Number(config.port || 5432),
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 10,
    })
    poolDriver = 'postgres'
    return pool
  }
  if (config.driver === 'mysql') {
    pool = await mysql.createPool({
      host: config.host,
      port: Number(config.port || 3306),
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? {} : undefined,
      connectionLimit: 10,
    })
    poolDriver = 'mysql'
    return pool
  }
  throw new Error('درایور دیتابیس پشتیبانی نمی‌شود.')
}

export function getPool() {
  return pool
}

export function getPoolDriver() {
  return poolDriver
}

export async function testPoolConnection(config) {
  const testPool = await openPool(config)
  try {
    if (config.driver === 'postgres') {
      await testPool.query('SELECT 1')
    } else {
      const [rows] = await testPool.query('SELECT 1 AS ok')
      if (!rows?.length) throw new Error('پاسخ خالی از MySQL')
    }
    return { ok: true, driver: config.driver }
  } finally {
    closePool()
  }
}

export async function ensureSchema(config) {
  const active = await openPool(config)
  if (config.driver === 'postgres') {
    await active.query(`
      CREATE TABLE IF NOT EXISTS ciwa_documents (
        namespace VARCHAR(64) PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ciwa_sessions (
        token VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        username VARCHAR(128) NOT NULL,
        role VARCHAR(32) NOT NULL,
        expires_at BIGINT NOT NULL
      );
    `)
    return
  }
  await active.query(`
    CREATE TABLE IF NOT EXISTS ciwa_documents (
      namespace VARCHAR(64) PRIMARY KEY,
      payload JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `)
  await active.query(`
    CREATE TABLE IF NOT EXISTS ciwa_sessions (
      token VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      username VARCHAR(128) NOT NULL,
      role VARCHAR(32) NOT NULL,
      expires_at BIGINT NOT NULL
    );
  `)
}

export async function dbGetDocument(namespace) {
  const driver = getPoolDriver()
  const active = getPool()
  if (!active) return null
  if (driver === 'postgres') {
    const result = await active.query('SELECT payload FROM ciwa_documents WHERE namespace = $1', [namespace])
    return result.rows[0]?.payload ?? null
  }
  const [rows] = await active.query('SELECT payload FROM ciwa_documents WHERE namespace = ?', [namespace])
  const raw = rows[0]?.payload
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

export async function dbSetDocument(namespace, payload) {
  const driver = getPoolDriver()
  const active = getPool()
  const json = JSON.stringify(payload)
  if (driver === 'postgres') {
    await active.query(
      `INSERT INTO ciwa_documents (namespace, payload, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (namespace) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [namespace, json],
    )
    return
  }
  await active.query(
    `INSERT INTO ciwa_documents (namespace, payload) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP`,
    [namespace, json],
  )
}

export async function dbListSessions() {
  const driver = getPoolDriver()
  const active = getPool()
  if (!active) return {}
  if (driver === 'postgres') {
    const result = await active.query('SELECT token, user_id, username, role, expires_at FROM ciwa_sessions')
    const tokens = {}
    for (const row of result.rows) {
      tokens[row.token] = {
        userId: row.user_id,
        username: row.username,
        role: row.role,
        expiresAt: Number(row.expires_at),
      }
    }
    return tokens
  }
  const [rows] = await active.query('SELECT token, user_id, username, role, expires_at FROM ciwa_sessions')
  const tokens = {}
  for (const row of rows) {
    tokens[row.token] = {
      userId: row.user_id,
      username: row.username,
      role: row.role,
      expiresAt: Number(row.expires_at),
    }
  }
  return tokens
}

export async function dbUpsertSession(token, session) {
  const driver = getPoolDriver()
  const active = getPool()
  if (driver === 'postgres') {
    await active.query(
      `INSERT INTO ciwa_sessions (token, user_id, username, role, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, username = EXCLUDED.username, role = EXCLUDED.role, expires_at = EXCLUDED.expires_at`,
      [token, session.userId, session.username, session.role, session.expiresAt],
    )
    return
  }
  await active.query(
    `INSERT INTO ciwa_sessions (token, user_id, username, role, expires_at) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), username = VALUES(username), role = VALUES(role), expires_at = VALUES(expires_at)`,
    [token, session.userId, session.username, session.role, session.expiresAt],
  )
}

export async function dbDeleteSession(token) {
  const active = getPool()
  if (!active) return
  if (getPoolDriver() === 'postgres') {
    await active.query('DELETE FROM ciwa_sessions WHERE token = $1', [token])
  } else {
    await active.query('DELETE FROM ciwa_sessions WHERE token = ?', [token])
  }
}

export async function dbPruneSessions(now = Date.now()) {
  const active = getPool()
  if (!active) return
  if (getPoolDriver() === 'postgres') {
    await active.query('DELETE FROM ciwa_sessions WHERE expires_at <= $1', [now])
  } else {
    await active.query('DELETE FROM ciwa_sessions WHERE expires_at <= ?', [now])
  }
}

export async function dbDeleteUserSessions(userId) {
  const active = getPool()
  if (!active) return
  if (getPoolDriver() === 'postgres') {
    await active.query('DELETE FROM ciwa_sessions WHERE user_id = $1', [userId])
  } else {
    await active.query('DELETE FROM ciwa_sessions WHERE user_id = ?', [userId])
  }
}
