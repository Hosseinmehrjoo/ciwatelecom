import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { emptyPbx, loadPbx } from '../../services/store/pbxStore.js'
import { loadDatabaseConfig, isDatabaseDriver } from '../../services/store/databaseConfig.js'
import { generateAsteriskConfigs } from '../../services/asterisk/generateConf.js'

test('loadPbx returns defaults shape', () => {
  const pbx = loadPbx()
  assert.ok(Array.isArray(pbx.extensions))
  assert.ok(pbx.sip)
  assert.ok(pbx.ami)
})

test('generateAsteriskConfigs writes pjsip and extensions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciwa-conf-'))
  const result = generateAsteriskConfigs(emptyPbx(), dir)
  assert.ok(result.files.includes('pjsip.conf'))
  assert.ok(result.files.includes('extensions.conf'))
  const manager = fs.readFileSync(path.join(dir, 'manager.conf'), 'utf8')
  assert.match(manager, /deny = 0\.0\.0\.0\/0\.0\.0\.0/)
  assert.doesNotMatch(manager, /flush ruleset/)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('database config driver is known', () => {
  const config = loadDatabaseConfig()
  assert.ok(['file', 'postgres', 'mysql'].includes(config.driver))
  if (isDatabaseDriver(config.driver)) {
    assert.ok(config[config.driver])
  }
})
