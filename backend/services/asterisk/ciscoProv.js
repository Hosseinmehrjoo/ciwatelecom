import fs from 'node:fs'
import path from 'node:path'
import { normalizeMac } from './confSafe.js'
import { ensureDir } from '../store/fsutil.js'

const SEP_FILE = /^SEP[0-9A-F]{12}\.cnf\.xml$/

export function xmlEscape(value) {
  return String(value ?? '')
    .replace(/[\r\n\0]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function provisionHost(pbx) {
  return String(process.env.CIWA_PROVISION_HOST || pbx.sip?.provisionHost || pbx.sip?.externalIp || '').trim()
}

export function ciscoLoadName(pbx) {
  const raw = String(pbx.sip?.ciscoLoad || 'SIP42.9-4-2SR3-1S').trim()
  return /^[A-Za-z0-9._-]{1,64}$/.test(raw) ? raw : 'SIP42.9-4-2SR3-1S'
}

function lineXml({ number, name, secret }) {
  const label = xmlEscape(name || number)
  const ext = xmlEscape(number)
  const password = xmlEscape(secret || '')
  return `<line button="1">
        <featureID>9</featureID>
        <featureLabel>${label}</featureLabel>
        <proxy>USECALLMANAGER</proxy>
        <port>5060</port>
        <name>${ext}</name>
        <displayName>${label}</displayName>
        <autoAnswer><autoAnswerEnabled>2</autoAnswerEnabled></autoAnswer>
        <callWaiting>3</callWaiting>
        <authName>${ext}</authName>
        <authPassword>${password}</authPassword>
        <sharedLine>false</sharedLine>
        <messageWaitingLampPolicy>1</messageWaitingLampPolicy>
        <messagesNumber>*97</messagesNumber>
        <ringSettingIdle>4</ringSettingIdle>
        <ringSettingActive>5</ringSettingActive>
        <contact>${ext}</contact>
        <forwardCallInfoDisplay>
          <callerName>true</callerName>
          <callerNumber>true</callerNumber>
          <redirectedNumber>false</redirectedNumber>
          <dialedNumber>true</dialedNumber>
        </forwardCallInfoDisplay>
      </line>`
}

export function buildSepXml({ mac, number, name, secret, host, load }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<device>
  <deviceProtocol>SIP</deviceProtocol>
  <sshUserId>admin</sshUserId>
  <sshPassword></sshPassword>
  <devicePool>
    <dateTimeSetting>
      <dateTemplate>D/M/Y</dateTemplate>
      <timeZone>Iran Standard Time</timeZone>
      <ntps>
        <ntp>
          <name>pool.ntp.org</name>
          <ntpMode>Unicast</ntpMode>
        </ntp>
      </ntps>
    </dateTimeSetting>
    <callManagerGroup>
      <members>
        <member priority="0">
          <callManager>
            <ports>
              <ethernetPhonePort>2000</ethernetPhonePort>
              <sipPort>5060</sipPort>
              <securedSipPort>5061</securedSipPort>
            </ports>
            <processNodeName>${xmlEscape(host)}</processNodeName>
          </callManager>
        </member>
      </members>
    </callManagerGroup>
  </devicePool>
  <sipProfile>
    <sipProxies>
      <registerWithProxy>true</registerWithProxy>
    </sipProxies>
    <sipCallFeatures>
      <cnfJoinEnabled>true</cnfJoinEnabled>
      <rfc2543Hold>false</rfc2543Hold>
      <callHoldRingback>2</callHoldRingback>
      <localCfwdEnable>true</localCfwdEnable>
      <semiAttendedTransfer>true</semiAttendedTransfer>
    </sipCallFeatures>
    <sipStack>
      <timerRegisterExpires>3600</timerRegisterExpires>
      <timerRegisterDelta>5</timerRegisterDelta>
      <timerKeepAliveExpires>120</timerKeepAliveExpires>
      <remotePartyID>false</remotePartyID>
      <userInfo>None</userInfo>
    </sipStack>
    <enableVad>false</enableVad>
    <preferredCodec>none</preferredCodec>
    <dtmfAvtPayload>101</dtmfAvtPayload>
    <dtmfDbLevel>3</dtmfDbLevel>
    <dtmfOutofband>avt</dtmfOutofband>
    <kpml>0</kpml>
    <natEnabled>false</natEnabled>
    <phoneLabel>${xmlEscape(name || number)}</phoneLabel>
    <sipLines>
      ${lineXml({ number, name, secret })}
    </sipLines>
    <dialTemplate>dialplan.xml</dialTemplate>
  </sipProfile>
  <commonProfile>
    <phonePassword></phonePassword>
    <backgroundImageAccess>true</backgroundImageAccess>
    <callLogBlfEnabled>2</callLogBlfEnabled>
  </commonProfile>
  <loadInformation>${xmlEscape(load)}</loadInformation>
  <vendorConfig>
    <disableSpeaker>false</disableSpeaker>
    <pcPort>0</pcPort>
    <settingsAccess>1</settingsAccess>
    <webAccess>0</webAccess>
    <videoCapability>0</videoCapability>
  </vendorConfig>
  <deviceSecurityMode>1</deviceSecurityMode>
  <transportLayerProtocol>2</transportLayerProtocol>
  <capfAuthMode>0</capfAuthMode>
  <encrConfig>false</encrConfig>
  <mac>${xmlEscape(mac)}</mac>
</device>
`
}

export function buildDialplanXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<DIALTEMPLATE>
  <TEMPLATE MATCH="..." Timeout="0"/>
  <TEMPLATE MATCH="...." Timeout="0"/>
  <TEMPLATE MATCH="*" Timeout="5"/>
</DIALTEMPLATE>
`
}

export function writeCiscoProvisioning(pbx, tftpDir) {
  ensureDir(tftpDir)
  const host = provisionHost(pbx)
  const load = ciscoLoadName(pbx)
  const keep = new Set()
  const phones = []

  for (const ext of pbx.extensions || []) {
    if (!String(ext.phoneType || '').startsWith('cisco')) continue
    let mac = ''
    try { mac = normalizeMac(ext.mac) } catch { continue }
    const filename = `SEP${mac}.cnf.xml`
    fs.writeFileSync(path.join(tftpDir, filename), buildSepXml({
      mac,
      number: ext.number,
      name: ext.name,
      secret: ext.secret,
      host,
      load,
    }), 'utf8')
    keep.add(filename)
    phones.push({ mac, number: String(ext.number), file: filename, host })
  }

  fs.writeFileSync(path.join(tftpDir, 'dialplan.xml'), buildDialplanXml(), 'utf8')

  for (const name of fs.readdirSync(tftpDir)) {
    if (SEP_FILE.test(name) && !keep.has(name)) fs.unlinkSync(path.join(tftpDir, name))
  }

  return { dir: 'tftp', phones, host: host || null, load }
}
