import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { encodeAmi } from '../../services/asterisk/confSafe.js'
import { generateAsteriskConfigs } from '../../services/asterisk/generateConf.js'
import { emptyPbx } from '../../services/store/pbxStore.js'
import { methodRole } from '../../services/auth/middleware.js'
import { resolveAmiHost } from '../../services/asterisk/ami.js'
import { assertBackupMembers } from '../../services/system/backup.js'
import { assertCampaignId } from '../../services/campaign/campaignStore.js'
import { assertPasswordStrength } from '../../services/auth/password.js'

test('AMI encoder strips injected newlines', () => {
  const packet = encodeAmi({ Action: 'Originate', Channel: 'PJSIP/100\r\nAction: Command' })
  assert.equal(packet.includes('\r\nAction: Command'), false)
  assert.match(packet, /Channel: PJSIP\/100Action: Command/)
})

test('dialplan values cannot break out of a line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciwa-sec-'))
  const pbx = emptyPbx()
  pbx.extensions = [{ number: '100\n same => n,NoOp(PWNED)', name: 'Desk', secret: 'secret12' }]
  generateAsteriskConfigs(pbx, dir)
  const dialplan = fs.readFileSync(path.join(dir, 'extensions.conf'), 'utf8')
  const pjsip = fs.readFileSync(path.join(dir, 'pjsip.conf'), 'utf8')
  assert.doesNotMatch(dialplan, /NoOp\(PWNED\)/)
  assert.doesNotMatch(pjsip, /NoOp\(PWNED\)/)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('route roles use the original /api path', () => {
  const req = { method: 'POST', path: '/system/firewall/apply', originalUrl: '/api/system/firewall/apply', baseUrl: '/api' }
  assert.equal(methodRole(req), 'admin')
  assert.equal(methodRole({ method: 'GET', path: '/extensions', originalUrl: '/api/extensions', baseUrl: '/api' }), 'viewer')
  assert.equal(methodRole({ method: 'POST', path: '/calls/originate', originalUrl: '/api/calls/originate', baseUrl: '/api' }), 'operator')
})

test('docker loopback AMI host is rewritten', () => {
  assert.equal(resolveAmiHost('127.0.0.1', { inDocker: true }), 'host.docker.internal')
  assert.equal(resolveAmiHost('127.0.0.1', { inDocker: false }), '127.0.0.1')
  assert.equal(resolveAmiHost('10.1.1.5', { inDocker: true }), '10.1.1.5')
})

test('backup members reject traversal and unexpected paths', () => {
  assert.throws(() => assertBackupMembers('../etc/passwd\n'), /غیرمجاز|فقط/)
  assert.throws(() => assertBackupMembers('config/ciwa/../../etc/cron\n'), /غیرمجاز|فقط/)
  assert.deepEqual(assertBackupMembers('config/ciwa/auth.json\nconfig/asterisk/pjsip.conf\n'), [
    'config/ciwa/auth.json',
    'config/asterisk/pjsip.conf',
  ])
})

test('campaign ids cannot escape the storage directory', () => {
  assert.throws(() => assertCampaignId('../etc/passwd'), /نامعتبر/)
  assert.equal(assertCampaignId('camp_abc-1'), 'camp_abc-1')
})

test('new passwords must be at least 8 characters', () => {
  assert.throws(() => assertPasswordStrength('short'), /۸/)
  assert.equal(assertPasswordStrength('long-enough'), 'long-enough')
})
