import {
  activeConnectionConfig,
  loadDatabaseConfig,
  maskDatabaseConfig,
  saveDatabaseConfig,
} from '../store/databaseConfig.js'
import { migrateFilesToDatabase, reconnectDatastore } from '../store/documentStore.js'
import { closePool, testPoolConnection } from '../store/db/drivers.js'

export function getDatabaseSettings() {
  const config = loadDatabaseConfig()
  return {
    config: maskDatabaseConfig(config),
    active: config.driver,
    usingDatabase: config.driver === 'postgres' || config.driver === 'mysql',
  }
}

export async function saveDatabaseSettings(patch) {
  const current = loadDatabaseConfig()
  const next = { ...current, ...patch }
  if (patch.postgres) {
    next.postgres = { ...current.postgres, ...patch.postgres }
    if (!patch.postgres.password || patch.postgres.password === '********') {
      next.postgres.password = current.postgres.password
    }
  }
  if (patch.mysql) {
    next.mysql = { ...current.mysql, ...patch.mysql }
    if (!patch.mysql.password || patch.mysql.password === '********') {
      next.mysql.password = current.mysql.password
    }
  }
  saveDatabaseConfig(next)
  return getDatabaseSettings()
}

export async function testDatabaseSettings(override = null) {
  const config = loadDatabaseConfig()
  const driver = override?.driver || config.driver
  if (driver === 'file') {
    return { ok: true, driver: 'file', message: 'حالت فایل محلی — بدون سرور دیتابیس.' }
  }
  const base = driver === 'postgres' ? config.postgres : config.mysql
  const patch = driver === 'postgres' ? override?.postgres : override?.mysql
  const conn = {
    driver,
    ...base,
    ...(patch || {}),
  }
  if (conn.password === '********') conn.password = base.password
  const result = await testPoolConnection(conn)
  return { ...result, message: 'اتصال موفق بود.' }
}

export async function applyDatabaseSettings(patch) {
  await saveDatabaseSettings(patch)
  await reconnectDatastore()
  return getDatabaseSettings()
}

export async function importJsonToDatabase() {
  const result = await migrateFilesToDatabase()
  return result
}

export async function switchToFileMode() {
  closePool()
  saveDatabaseConfig({ driver: 'file' })
  await reconnectDatastore()
  return getDatabaseSettings()
}
