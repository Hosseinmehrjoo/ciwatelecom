import { isDatabaseDriver, loadDatabaseConfig } from '../store/databaseConfig.js'
import { isDatastoreReady } from '../store/documentStore.js'
import { getPool, getPoolDriver } from '../store/db/drivers.js'
import { probeAmi } from '../asterisk/ami.js'

export async function getReadiness() {
  const checks = {
    datastore: { ok: isDatastoreReady(), detail: loadDatabaseConfig().driver },
    database: { ok: true, detail: 'file' },
    ami: { ok: false, detail: null },
  }

  if (isDatabaseDriver()) {
    try {
      const pool = getPool()
      if (!pool) {
        checks.database = { ok: false, detail: 'pool_not_ready' }
      } else if (getPoolDriver() === 'postgres') {
        await pool.query('SELECT 1')
        checks.database = { ok: true, detail: 'postgres' }
      } else {
        await pool.query('SELECT 1')
        checks.database = { ok: true, detail: 'mysql' }
      }
    } catch (error) {
      checks.database = { ok: false, detail: error instanceof Error ? error.message : 'db_error' }
    }
  }

  if (process.env.CIWA_HEALTH_CHECK_AMI === '1') {
    const ami = await probeAmi()
    checks.ami = { ok: ami.connected, detail: ami.error }
  } else {
    checks.ami = { ok: true, detail: 'skipped' }
  }

  const ok = checks.datastore.ok && checks.database.ok && checks.ami.ok
  return { ok, checks, at: new Date().toISOString() }
}
