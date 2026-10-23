import { readJson, resolvePath, writeJson } from './fsutil.js'

const CONFIG_PATH = resolvePath('config/ciwa/database.json')

export const emptyDatabaseConfig = () => ({
  driver: 'file',
  postgres: {
    host: '127.0.0.1',
    port: 5432,
    database: 'ciwa_telecom',
    user: 'ciwa',
    password: '',
    ssl: false,
  },
  mysql: {
    host: '127.0.0.1',
    port: 3306,
    database: 'ciwa_telecom',
    user: 'ciwa',
    password: '',
    ssl: false,
  },
})

export function applyEnvDatabaseBootstrap() {
  const url = process.env.CIWA_DATABASE_URL
  if (!url) return loadDatabaseConfig()
  const current = readJson(CONFIG_PATH, emptyDatabaseConfig())
  if (current.driver === 'postgres' || current.driver === 'mysql') return current
  const next = loadDatabaseConfig()
  saveDatabaseConfig({ ...next, driver: url.startsWith('mysql') ? 'mysql' : 'postgres' })
  return loadDatabaseConfig()
}

export function loadDatabaseConfig() {
  const fromEnv = process.env.CIWA_DATABASE_URL
  const data = readJson(CONFIG_PATH, emptyDatabaseConfig())
  const merged = { ...emptyDatabaseConfig(), ...data, postgres: { ...emptyDatabaseConfig().postgres, ...(data.postgres || {}) }, mysql: { ...emptyDatabaseConfig().mysql, ...(data.mysql || {}) } }
  if (fromEnv && fromEnv.startsWith('postgres')) {
    merged.driver = 'postgres'
    try {
      const url = new URL(fromEnv)
      merged.postgres.host = url.hostname
      merged.postgres.port = Number(url.port || 5432)
      merged.postgres.database = url.pathname.replace(/^\//, '')
      merged.postgres.user = decodeURIComponent(url.username)
      merged.postgres.password = decodeURIComponent(url.password)
      merged.postgres.ssl = url.searchParams.get('sslmode') === 'require'
    } catch { /* keep file config */ }
  }
  return merged
}

export function saveDatabaseConfig(patch) {
  const current = loadDatabaseConfig()
  const next = { ...current, ...patch }
  if (patch.postgres) next.postgres = { ...current.postgres, ...patch.postgres }
  if (patch.mysql) next.mysql = { ...current.mysql, ...patch.mysql }
  if (!next.password && patch.postgres?.password === '') delete next.postgres?.password
  writeJson(CONFIG_PATH, next)
  return next
}

export function isDatabaseDriver(driver = loadDatabaseConfig().driver) {
  return driver === 'postgres' || driver === 'mysql'
}

export function activeConnectionConfig(config = loadDatabaseConfig()) {
  if (config.driver === 'postgres') return { driver: 'postgres', ...config.postgres }
  if (config.driver === 'mysql') return { driver: 'mysql', ...config.mysql }
  return { driver: 'file' }
}

export function maskDatabaseConfig(config = loadDatabaseConfig()) {
  const clone = structuredClone(config)
  if (clone.postgres?.password) clone.postgres.password = '********'
  if (clone.mysql?.password) clone.mysql.password = '********'
  return clone
}
