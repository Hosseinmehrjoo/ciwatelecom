import { readJson, resolvePath, writeJson } from './fsutil.js'
import {
  activeConnectionConfig,
  isDatabaseDriver,
  loadDatabaseConfig,
} from './databaseConfig.js'
import {
  closePool,
  dbGetDocument,
  dbSetDocument,
  ensureSchema,
  openPool,
} from './db/drivers.js'

const FILES = {
  pbx: resolvePath('config/ciwa/pbx.json'),
  system: resolvePath('config/ciwa/system.json'),
  auth: resolvePath('config/ciwa/auth.json'),
}

const cache = {
  pbx: null,
  system: null,
  auth: null,
}

let ready = false

function mergeWithFallback(data, fallback) {
  if (!data || typeof data !== 'object') return structuredClone(fallback)
  return { ...structuredClone(fallback), ...data }
}

function readFileNamespace(namespace, fallback) {
  return mergeWithFallback(readJson(FILES[namespace], null), fallback)
}

export function isDatastoreReady() {
  return ready
}

export async function initDatastore() {
  const config = loadDatabaseConfig()
  if (!isDatabaseDriver(config.driver)) {
    ready = true
    return { driver: 'file', connected: true }
  }
  const conn = activeConnectionConfig(config)
  await openPool(conn)
  await ensureSchema(conn)
  for (const namespace of Object.keys(FILES)) {
    const fromDb = await dbGetDocument(namespace)
    if (fromDb) cache[namespace] = fromDb
  }
  ready = true
  return { driver: config.driver, connected: true }
}

export async function reconnectDatastore() {
  closePool()
  ready = false
  cache.pbx = null
  cache.system = null
  cache.auth = null
  return initDatastore()
}

export function loadDocumentSync(namespace, fallback) {
  if (cache[namespace]) {
    return mergeWithFallback(cache[namespace], fallback)
  }
  const fromFile = readFileNamespace(namespace, fallback)
  cache[namespace] = fromFile
  return mergeWithFallback(fromFile, fallback)
}

export async function saveDocument(namespace, data, fallback) {
  cache[namespace] = data
  const config = loadDatabaseConfig()
  if (!isDatabaseDriver(config.driver)) {
    writeJson(FILES[namespace], data)
    return data
  }
  if (!ready) await initDatastore()
  await dbSetDocument(namespace, data)
  return data
}

export async function migrateFilesToDatabase() {
  const config = loadDatabaseConfig()
  if (!isDatabaseDriver(config.driver)) {
    const error = new Error('ابتدا درایور postgres یا mysql را انتخاب و ذخیره کنید.')
    error.status = 400
    throw error
  }
  const conn = activeConnectionConfig(config)
  await openPool(conn)
  await ensureSchema(conn)
  const imported = []
  for (const [namespace, filePath] of Object.entries(FILES)) {
    if (!readJson(filePath, null)) continue
    const payload = readJson(filePath, {})
    await dbSetDocument(namespace, payload)
    cache[namespace] = payload
    imported.push(namespace)
  }
  ready = true
  return { ok: true, imported, driver: config.driver }
}

export function readFileSnapshot(namespace) {
  return readJson(FILES[namespace], null)
}

export function primeCache(namespace, data) {
  cache[namespace] = data
}
