import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizeMac } from './confSafe.js'
import { ensureDir } from '../store/fsutil.js'

const SEP_FILE = /^SEP[0-9A-F]{12}\.cnf\.xml$/
const DEFAULT_PHONE_LABEL = 'telecom.aisis.ir'

export function xmlEscape(value) {
  return String(value ?? '')
    .replace(/[\r\n\0]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isDockerBridgeIp(host) {
  const text = String(host || '').trim()
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(text)) return false
  const parts = text.split('.').map(Number)
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31
}

/** Text shown at the top of the Cisco handset — not the SIP/TFTP server. */
export function ciscoPhoneLabel(pbx) {
  const raw = String(pbx.sip?.ciscoPhoneLabel || process.env.CIWA_PHONE_LABEL || DEFAULT_PHONE_LABEL).trim()
  const cleaned = raw.replace(/[\r\n\0]/g, '').slice(0, 32)
  return cleaned || DEFAULT_PHONE_LABEL
}

export function detectLanHost() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.internal || entry.family !== 'IPv4') continue
      if (isDockerBridgeIp(entry.address)) continue
      return entry.address
    }
  }
  return ''
}

/** SIP / TFTP address the phone actually registers to (server IP). */
export function provisionHost(pbx) {
  const candidates = [
    process.env.CIWA_PROVISION_HOST,
    pbx.sip?.provisionHost,
    pbx.sip?.externalIp,
    detectLanHost(),
  ]
  for (const candidate of candidates) {
    const text = String(candidate || '').trim()
    if (!text || isDockerBridgeIp(text)) continue
    return text
  }
  return ''
}

export function ciscoLoadName(pbx) {
  // Match the load already on typical 7962G SIP phones when firmware files are not in tftp/.
  const raw = String(pbx.sip?.ciscoLoad || 'SIP42.8-5-3S').trim()
  return /^[A-Za-z0-9._-]{1,64}$/.test(raw) ? raw : 'SIP42.8-5-3S'
}

function lineXml({ number, name, secret, host }) {
  const label = xmlEscape(name || number)
  const ext = xmlEscape(number)
  const password = xmlEscape(secret || '')
  const proxy = xmlEscape(host || 'USECALLMANAGER')
  return `<line button="1">
        <featureID>9</featureID>
        <featureLabel>${label}</featureLabel>
        <proxy>${proxy}</proxy>
        <port>5060</port>
        <name>${ext}</name>
        <displayName>${label}</displayName>
        <autoAnswer>
          <autoAnswerEnabled>2</autoAnswerEnabled>
        </autoAnswer>
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

export function buildSepXml({ mac, number, name, secret, host, load, phoneLabel }) {
  const node = xmlEscape(host)
  const banner = xmlEscape(phoneLabel || DEFAULT_PHONE_LABEL)
  return `<?xml version="1.0" encoding="UTF-8"?>
<device>
  <deviceProtocol>SIP</deviceProtocol>
  <sshUserId>cisco</sshUserId>
  <sshPassword>cisco</sshPassword>
  <devicePool>
    <dateTimeSetting>
      <dateTemplate>D/M/Y</dateTemplate>
      <timeZone>Iran Standard Time</timeZone>
      <ntps>
        <ntp>
          <name>${node}</name>
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
            <processNodeName>${node}</processNodeName>
          </callManager>
        </member>
      </members>
    </callManagerGroup>
  </devicePool>
  <sipProfile>
    <sipProxies>
      <backupProxy></backupProxy>
      <backupProxyPort></backupProxyPort>
      <outboundProxy></outboundProxy>
      <outboundProxyPort></outboundProxyPort>
      <registerWithProxy>true</registerWithProxy>
    </sipProxies>
    <sipCallFeatures>
      <cnfJoinEnabled>true</cnfJoinEnabled>
      <rfc2543Hold>false</rfc2543Hold>
      <callHoldRingback>2</callHoldRingback>
      <localCfwdEnable>true</localCfwdEnable>
      <semiAttendedTransfer>true</semiAttendedTransfer>
      <anonymousCallBlock>2</anonymousCallBlock>
      <callerIdBlocking>2</callerIdBlocking>
      <dndControl>0</dndControl>
    </sipCallFeatures>
    <sipStack>
      <sipInviteRetx>6</sipInviteRetx>
      <sipRetx>10</sipRetx>
      <timerInvite>180</timerInvite>
      <timerRegister>300</timerRegister>
      <timerRegisterExpires>3600</timerRegisterExpires>
      <timerRegisterDelta>5</timerRegisterDelta>
      <timerKeepAliveExpires>120</timerKeepAliveExpires>
      <remotePartyID>true</remotePartyID>
      <userInfo>None</userInfo>
    </sipStack>
    <enableVad>false</enableVad>
    <preferredCodec>g711ulaw</preferredCodec>
    <dtmfAvtPayload>101</dtmfAvtPayload>
    <dtmfDbLevel>3</dtmfDbLevel>
    <dtmfOutofband>avt</dtmfOutofband>
    <kpml>3</kpml>
    <natEnabled>false</natEnabled>
    <phoneLabel>${banner}</phoneLabel>
    <stutterMsgWaiting>0</stutterMsgWaiting>
    <callStats>false</callStats>
    <startMediaPort>16384</startMediaPort>
    <stopMediaPort>32766</stopMediaPort>
    <sipLines>
      ${lineXml({ number, name, secret, host })}
    </sipLines>
    <voipControlPort>5060</voipControlPort>
    <dialTemplate>dialplan.xml</dialTemplate>
  </sipProfile>
  <commonProfile>
    <phonePassword></phonePassword>
    <backgroundImageAccess>true</backgroundImageAccess>
    <callLogBlfEnabled>1</callLogBlfEnabled>
  </commonProfile>
  <loadInformation>${xmlEscape(load)}</loadInformation>
  <vendorConfig>
    <disableSpeaker>false</disableSpeaker>
    <disableSpeakerAndHeadset>false</disableSpeakerAndHeadset>
    <pcPort>0</pcPort>
    <settingsAccess>1</settingsAccess>
    <webAccess>1</webAccess>
    <spanToPCPort>1</spanToPCPort>
    <videoCapability>0</videoCapability>
  </vendorConfig>
  <versionStamp>${Date.now()}</versionStamp>
  <networkLocale>US</networkLocale>
  <deviceSecurityMode>1</deviceSecurityMode>
  <transportLayerProtocol>2</transportLayerProtocol>
  <capfAuthMode>0</capfAuthMode>
  <encrConfig>false</encrConfig>
  <mac>${xmlEscape(mac)}</mac>
</device>
`
}

export function buildXmlDefault({ host, load, phoneLabel }) {
  const node = xmlEscape(host)
  return `<?xml version="1.0" encoding="UTF-8"?>
<device>
  <deviceProtocol>SIP</deviceProtocol>
  <loadInformation>${xmlEscape(load)}</loadInformation>
  <devicePool>
    <callManagerGroup>
      <members>
        <member priority="0">
          <callManager>
            <ports>
              <sipPort>5060</sipPort>
            </ports>
            <processNodeName>${node}</processNodeName>
          </callManager>
        </member>
      </members>
    </callManagerGroup>
  </devicePool>
  <sipProfile>
    <phoneLabel>${xmlEscape(phoneLabel || DEFAULT_PHONE_LABEL)}</phoneLabel>
  </sipProfile>
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
  const phoneLabel = ciscoPhoneLabel(pbx)
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
      phoneLabel,
    }), 'utf8')
    keep.add(filename)
    phones.push({ mac, number: String(ext.number), file: filename, host, phoneLabel })
  }

  fs.writeFileSync(path.join(tftpDir, 'dialplan.xml'), buildDialplanXml(), 'utf8')
  if (host) {
    fs.writeFileSync(path.join(tftpDir, 'XMLDefault.cnf.xml'), buildXmlDefault({ host, load, phoneLabel }), 'utf8')
  }

  for (const name of fs.readdirSync(tftpDir)) {
    if (SEP_FILE.test(name) && !keep.has(name)) fs.unlinkSync(path.join(tftpDir, name))
  }

  return { dir: 'tftp', phones, host: host || null, load, phoneLabel }
}
