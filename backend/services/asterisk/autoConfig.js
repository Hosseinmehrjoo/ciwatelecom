import fs from 'node:fs'
import path from 'node:path'
import { normalizeMac, assertExtensionNumber, assertNoControl } from './confSafe.js'
import { saveCollectionItem } from './pbx.js'
import { loadPbx, savePbx } from '../store/pbxStore.js'
import { generateAsteriskConfigs } from './generateConf.js'
import { detectLanHost, provisionHost as sepProvisionHost } from './ciscoProv.js'
import {
  assertIpv4,
  guessProvisionHostFor,
  inspectPhone,
  readNeighbors,
  lookupMacForIp,
  dhcpOption150Hex,
  readCiscoPhoneState,
} from './phoneDiscovery.js'
import { ensureTftpServer, getTftpStatus, tftpRoot } from './tftpManager.js'

function bad(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function isUnusableProvisionHost(host) {
  const text = String(host || '').trim()
  if (!text) return true
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(text)) return false
  const parts = text.split('.').map(Number)
  if (parts[0] === 127) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  return false
}

/** Always prefer the real server IP for SIP/TFTP — never the cosmetic phone banner. */
export function resolveProvisionHost(pbx, phoneIp) {
  const envHost = String(process.env.CIWA_PROVISION_HOST || '').trim()
  const configured = String(pbx.sip?.provisionHost || '').trim()
  for (const candidate of [configured, envHost, guessProvisionHostFor(phoneIp), detectLanHost()]) {
    if (!candidate || isUnusableProvisionHost(candidate)) continue
    return candidate
  }
  throw bad('آدرس سرور برای گوشی سیسکو پیدا نشد. در SIP / RTP فیلد «آدرس سرور برای گوشی سیسکو» را IP همین سرور بگذارید.')
}

async function resolveMac({ ip, mac }) {
  if (mac) {
    try { return normalizeMac(mac) } catch (error) {
      throw bad(error instanceof Error ? error.message : 'مک‌آدرس نامعتبر است.')
    }
  }
  const neighbors = await readNeighbors()
  const fromArp = lookupMacForIp(neighbors, ip)
  if (fromArp) return fromArp
  const inspected = await inspectPhone(ip)
  if (inspected.mac) {
    try { return normalizeMac(inspected.mac) } catch { /* continue */ }
  }
  throw bad('مک‌آدرس گوشی پیدا نشد. مک ۱۲ رقمی را دستی وارد کنید (پشت گوشی یا برچسب).')
}

/**
 * Bind an already-created extension to a Cisco phone.
 * Number/secret come from the existing extension — not from the form.
 */
export async function configureCiscoPhone(input = {}) {
  const ip = assertIpv4(input.ip, 'آی‌پی تلفن')
  const number = assertExtensionNumber(input.number, 'شماره داخلی')
  const phoneType = input.phoneType === 'cisco-7942' ? 'cisco-7942' : 'cisco-7962'
  const mac = await resolveMac({ ip, mac: input.mac })

  const pbx = loadPbx()
  const existing = (pbx.extensions || []).find((row) => String(row.number) === String(number))
  if (!existing) {
    throw bad('این داخلی در سامانه نیست. اول از بخش «داخلی‌ها» آن را بسازید، بعد اینجا انتخاب کنید.')
  }
  if (!existing.secret) {
    throw bad('رمز SIP این داخلی خالی است. در بخش داخلی‌ها برای آن رمز بگذارید.')
  }

  const provisionHost = resolveProvisionHost(pbx, ip)
  const nextSip = {
    ...pbx.sip,
    provisionHost,
    ciscoPhoneLabel: String(pbx.sip?.ciscoPhoneLabel || 'telecom.aisis.ir').trim() || 'telecom.aisis.ir',
  }
  if (
    String(pbx.sip?.provisionHost || '').trim() !== provisionHost
    || String(pbx.sip?.ciscoPhoneLabel || '').trim() !== nextSip.ciscoPhoneLabel
  ) {
    pbx.sip = nextSip
    await savePbx(pbx)
  }

  const saved = await saveCollectionItem('extensions', {
    ...existing,
    number,
    name: assertNoControl(existing.name || `Cisco ${number}`, 'نام').trim() || `Cisco ${number}`,
    secret: existing.secret,
    phoneType,
    mac,
    phoneIp: ip,
    webrtc: false,
  })

  let tftp
  try {
    tftp = await ensureTftpServer()
  } catch (error) {
    tftp = {
      ...getTftpStatus(),
      running: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  generateAsteriskConfigs(loadPbx())

  const sepName = `SEP${mac}.cnf.xml`
  const sepPath = path.join(tftpRoot(), sepName)
  const sepReady = fs.existsSync(sepPath)
  const hostInFile = sepProvisionHost(loadPbx())
  let ciscoState = null
  try { ciscoState = await readCiscoPhoneState(ip) } catch { ciscoState = null }

  const option150 = dhcpOption150Hex(hostInFile || provisionHost)
  const blockers = []
  if (!tftp.running) blockers.push('سرویس TFTP روی این سرور فعال نیست.')
  if (ciscoState?.noTftpServer) {
    blockers.push('روی خود گوشی «TFTP Server» خالی است و پیام No IPv4 TFTP Server دیده می‌شود. DHCP گزینه ۱۵۰ را نمی‌فرستد؛ برای همین فایل SEP جدید را نمی‌گیرد و روی داخلی قدیمی می‌ماند.')
  }
  if (ciscoState?.phoneDn && String(ciscoState.phoneDn) !== String(number)) {
    blockers.push(`گوشی هنوز داخلی قدیمی ${ciscoState.phoneDn} را نشان می‌دهد؛ تا وقتی TFTP Server روی گوشی تنظیم نشود کانفیگ جدید اعمال نمی‌شود.`)
  }

  let message = 'کانفیگ روی سرور ساخته شد.'
  if (blockers.length) {
    message = `${blockers[0]} اول DHCP option 150 را روی روتر برابر ${hostInFile || provisionHost} بگذارید (مقدار ${option150})، یا روی گوشی Alternate TFTP را Yes و TFTP Server را ${hostInFile || provisionHost} کنید؛ بعد گوشی را ری‌استارت کنید.`
  } else if (tftp.running) {
    message = 'کانفیگ آماده است. گوشی را یک‌بار ری‌استارت کنید تا فایل را از TFTP بگیرد.'
  }

  return {
    ok: true,
    extension: saved.item,
    phone: {
      ip,
      mac,
      phoneType,
      model: phoneType === 'cisco-7942' ? 'Cisco 7942' : 'Cisco 7962G',
    },
    provisionHost: hostInFile || provisionHost,
    phoneLabel: nextSip.ciscoPhoneLabel,
    sepFile: sepName,
    sepReady,
    dialplanReady: fs.existsSync(path.join(tftpRoot(), 'dialplan.xml')),
    tftp,
    dhcpOption150: option150,
    ciscoState,
    blockers,
    restartRequired: true,
    message,
  }
}
