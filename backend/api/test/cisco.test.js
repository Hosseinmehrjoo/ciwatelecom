import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { emptyPbx } from '../../services/store/pbxStore.js'
import { generateAsteriskConfigs } from '../../services/asterisk/generateConf.js'
import { normalizeMac } from '../../services/asterisk/confSafe.js'
import { validateCollectionItem } from '../../services/asterisk/pbxNormalize.js'

test('cisco mac normalizes separators', () => {
  assert.equal(normalizeMac('00:11:22:33:44:55'), '001122334455')
})

test('cisco extension is plain SIP and gets a SEP file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ciwa-cisco-'))
  const tftp = path.join(dir, 'tftp')
  const pbx = emptyPbx()
  pbx.sip.provisionHost = '192.168.88.10'
  pbx.extensions = [
    validateCollectionItem('extensions', {
      number: '101',
      name: 'Desk',
      secret: 'secret12',
      phoneType: 'cisco-7962',
      mac: '001122334455',
    }),
  ]
  generateAsteriskConfigs(pbx, dir, { tftpDir: tftp })
  const pjsip = fs.readFileSync(path.join(dir, 'pjsip.conf'), 'utf8')
  assert.doesNotMatch(pjsip, /webrtc = yes/)
  assert.match(pjsip, /dtmf_mode = rfc4733/)
  const xml = fs.readFileSync(path.join(tftp, 'SEP001122334455.cnf.xml'), 'utf8')
  assert.match(xml, /<authName>101<\/authName>/)
  assert.match(xml, /<processNodeName>192\.168\.88\.10<\/processNodeName>/)
  assert.match(xml, /SIP42/)
  assert.ok(fs.existsSync(path.join(tftp, 'dialplan.xml')))
  fs.rmSync(dir, { recursive: true, force: true })
})
