import { test } from 'node:test'
import assert from 'node:assert/strict'
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
  const result = generateAsteriskConfigs(emptyPbx())
  assert.ok(result.files.includes('pjsip.conf'))
  assert.ok(result.files.includes('extensions.conf'))
})

test('database config driver is known', () => {
  const config = loadDatabaseConfig()
  assert.ok(['file', 'postgres', 'mysql'].includes(config.driver))
  if (isDatabaseDriver(config.driver)) {
    assert.ok(config[config.driver])
  }
})
