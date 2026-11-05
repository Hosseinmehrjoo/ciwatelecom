import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { createConnection } from 'node:net'
import { promisify } from 'node:util'
import os from 'node:os'

const execFileAsync = promisify(execFile)

/** Well-known Cisco / Cisco phone OUI prefixes (first 6 hex of MAC). */
const CISCO_OUIS = new Set([
  '00000C', '000142', '000163', '0001C7', '0001C9', '000216', '000217', '0002B9',
  '0003E3', '0003FD', '000496', '0004C0', '000574', '0006C1', '0006D6', '00070E',
  '0007EB', '00085F', '000873', '0008A3', '0008C2', '0008E3', '000912', '00094D',
  '00097B', '0009B7', '0009E8', '000A41', '000A8A', '000AF4', '000B45', '000B5F',
  '000B85', '000BBE', '000BFC', '000C30', '000C85', '000CCF', '000D29', '000D65',
  '000DBC', '000DEC', '000E38', '000E83', '000ED7', '000F23', '000F34', '000F8F',
  '000FF8', '001120', '00115C', '001193', '0011BB', '001243', '00127F', '0012D9',
  '001319', '001360', '0013C4', '00141C', '001469', '0014A9', '0014F1', '001561',
  '0015C7', '0015F9', '001646', '00169C', '0016C7', '00173B', '001794', '0017DF',
  '001818', '001873', '0018BA', '0018F8', '001930', '0019A9', '0019E7', '001A2F',
  '001A6C', '001AA1', '001AE2', '001B0D', '001B53', '001B67', '001B90', '001BD4',
  '001C0E', '001C57', '001C58', '001CAF', '001CBF', '001CF9', '001D45', '001D70',
  '001DA1', '001DE5', '001E13', '001E4A', '001E79', '001EBD', '001EF7', '001F26',
  '001F6C', '001F9E', '001FC9', '00211B', '002155', '0021A0', '0021D1', '00220C',
  '002255', '002290', '0022BD', '002304', '002349', '00235E', '0023AB', '0023BE',
  '0023EA', '002414', '002450', '002497', '0024C4', '0024F7', '002545', '002583',
  '0025B4', '002605', '00264A', '002697', '0026CA', '00270D', '004096', '0050BD',
  '00907F', '00B0E1', '00D0BA', '00E0B0', '00E016', '00E098', '04C5A4', '0C75BD',
  '188B45', '2C3F38', '2C54CF', '2C5A0F', '2C86D2', '346F90', '3C08F6', '44ADD9',
  '4C0082', '5475D0', '641225', '68BC0C', '6C416A', '70DB98', '7C95F3', '84B517',
  '88F031', '9C4E20', 'A44C11', 'B000B4', 'B4A4E3', 'B8BEBF', 'C46413', 'C8F9F9',
  'D0C789', 'D48CB5', 'E8BA70', 'F4CFE2', 'F872EA', 'F866F2',
])

function bad(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

export function assertIpv4(value, label = 'آدرس IP') {
  const text = String(value ?? '').trim()
  const parts = text.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
    throw bad(`${label} نامعتبر است.`)
  }
  return text
}

export function parseCidr(cidr) {
  const text = String(cidr || '').trim()
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(text)
  if (!match) throw bad('رنج شبکه باید مثل 192.168.88.0/24 باشد.')
  const prefix = Number(match[2])
  if (prefix < 24 || prefix > 30) throw bad('برای اسکن فقط رنج /24 تا /30 مجاز است.')
  const base = assertIpv4(match[1], 'شبکه')
  const ipNum = ipv4ToInt(base)
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0)
  const network = (ipNum & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const hosts = []
  for (let value = network + 1; value < broadcast; value += 1) hosts.push(intToIpv4(value))
  return { cidr: `${intToIpv4(network)}/${prefix}`, hosts, network: intToIpv4(network), prefix }
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0)
}

function intToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.')
}

export function localSubnets() {
  const found = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.internal || entry.family !== 'IPv4' || !entry.cidr) continue
      const [address, prefixText] = entry.cidr.split('/')
      const prefix = Number(prefixText)
      if (!address || !Number.isInteger(prefix) || prefix < 8 || prefix > 30) continue
      found.push({ address, cidr: entry.cidr, prefix })
    }
  }
  return found
}

function readProcArp(map) {
  try {
    const text = fs.readFileSync('/proc/net/arp', 'utf8')
    for (const line of text.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4) continue
      const ip = parts[0]
      const mac = String(parts[3] || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()
      if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) || mac.length !== 12 || mac === '000000000000') continue
      map.set(ip, mac)
    }
  } catch {
    /* ignore */
  }
}

export async function readNeighbors() {
  const map = new Map()
  readProcArp(map)
  try {
    const { stdout } = await execFileAsync('ip', ['-j', 'neigh'], { timeout: 4000, maxBuffer: 2_000_000 })
    const rows = JSON.parse(stdout)
    for (const row of rows || []) {
      const ip = String(row.dst || '').trim()
      const mac = String(row.lladdr || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()
      if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) || mac.length !== 12) continue
      map.set(ip, mac)
    }
  } catch {
    /* fall through */
  }
  if (map.size) return map
  try {
    const { stdout } = await execFileAsync('arp', ['-an'], { timeout: 4000, maxBuffer: 2_000_000 })
    for (const line of stdout.split('\n')) {
      const ipMatch = /\((\d{1,3}(?:\.\d{1,3}){3})\)/.exec(line)
      const macMatch = /((?:[0-9a-fA-F]{1,2}:){5}[0-9a-fA-F]{1,2})/.exec(line)
      if (!ipMatch || !macMatch) continue
      const mac = macMatch[1].replace(/[^0-9a-fA-F]/g, '').toUpperCase()
      if (mac.length === 12) map.set(ipMatch[1], mac)
    }
  } catch {
    /* empty */
  }
  return map
}

export function lookupMacForIp(neighbors, ip) {
  return neighbors.get(assertIpv4(ip)) || null
}

export function isCiscoMac(mac) {
  const hex = String(mac || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (hex.length !== 12) return false
  return CISCO_OUIS.has(hex.slice(0, 6))
}

function tcpOpen(ip, port, timeoutMs = 350) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: ip, port })
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function httpProbe(ip, timeoutMs = 900) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`http://${ip}/`, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'text/html,*/*', 'User-Agent': 'CIWA-Telecom-PhoneScan/1.0' },
    })
    const text = await response.text()
    return { ok: true, status: response.status, body: text.slice(0, 20000) }
  } catch {
    return { ok: false, status: 0, body: '' }
  } finally {
    clearTimeout(timer)
  }
}

function parsePhoneIdentity(body, fallbackMac = null) {
  const text = String(body || '')
  const lower = text.toLowerCase()
  const looksCisco = /cisco\s*ip\s*phone|cisco systems|cp-79|sep[0-9a-f]{12}|unified ip phone/i.test(text)
    || lower.includes('cisco')
  const modelMatch = /CP-?(79(?:42|62|41|61|05|70)G?)/i.exec(text)
    || /Cisco IP Phone\s+(CP-?[0-9A-Za-z-]+)/i.exec(text)
    || /Product ID[:\s]+([A-Za-z0-9-]+)/i.exec(text)
  const macMatch = /SEP([0-9A-Fa-f]{12})/.exec(text)
    || /MAC(?:\s*Address)?[:\s]+([0-9A-Fa-f:.-]{12,17})/i.exec(text)
  let mac = fallbackMac
  if (macMatch?.[1]) {
    const hex = macMatch[1].replace(/[^0-9a-fA-F]/g, '').toUpperCase()
    if (hex.length === 12) mac = hex
  }
  let phoneType = 'cisco-7962'
  const model = modelMatch?.[1] || (looksCisco ? 'Cisco IP Phone' : null)
  if (/7942/i.test(String(model))) phoneType = 'cisco-7942'
  if (/7962/i.test(String(model))) phoneType = 'cisco-7962'
  return {
    looksCisco: looksCisco || isCiscoMac(mac),
    model: model || (isCiscoMac(mac) ? 'Cisco (OUI)' : null),
    mac,
    phoneType,
  }
}

async function mapPool(items, concurrency, worker) {
  const results = []
  let index = 0
  async function run() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await worker(items[current], current)
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  await Promise.all(runners)
  return results
}

function sameSubnet(a, b, prefix = 24) {
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0)
  return ((ipv4ToInt(a) & mask) >>> 0) === ((ipv4ToInt(b) & mask) >>> 0)
}

export function guessProvisionHostFor(phoneIp) {
  const ip = assertIpv4(phoneIp)
  const locals = localSubnets()
  const match = locals.find((item) => sameSubnet(item.address, ip, Math.min(item.prefix, 24)))
  return match?.address || locals[0]?.address || ''
}

/**
 * Discover Cisco desk phones on a LAN subnet.
 * Strategy: ARP/neigh OUI + TCP/80 probe + HTTP fingerprint.
 */
export async function discoverPhones({ subnet } = {}) {
  const neighbors = await readNeighbors()
  const locals = localSubnets()
  let cidr = subnet
  if (!cidr) {
    const preferred = locals.find((item) => item.prefix >= 24 && item.prefix <= 30) || locals[0]
    if (!preferred) throw bad('هیچ اینترفیس شبکه‌ای برای اسکن پیدا نشد.', 500)
    const forcedPrefix = Math.max(preferred.prefix, 24)
    const ipNum = ipv4ToInt(preferred.address)
    const mask = ((0xffffffff << (32 - forcedPrefix)) >>> 0)
    cidr = `${intToIpv4((ipNum & mask) >>> 0)}/${forcedPrefix}`
  }
  const range = parseCidr(cidr)
  const found = new Map()

  for (const [ip, mac] of neighbors.entries()) {
    if (!range.hosts.includes(ip) && !sameSubnet(ip, range.network, range.prefix)) continue
    if (!isCiscoMac(mac)) continue
    found.set(ip, {
      ip,
      mac,
      model: 'Cisco (ARP)',
      phoneType: 'cisco-7962',
      source: 'arp',
      httpOpen: false,
    })
  }

  await mapPool(range.hosts, 48, async (ip) => {
    const open = await tcpOpen(ip, 80)
    if (!open) return
    const probe = await httpProbe(ip)
    const identity = parsePhoneIdentity(probe.body, neighbors.get(ip) || null)
    if (!identity.looksCisco && !isCiscoMac(identity.mac)) return
    const previous = found.get(ip) || {}
    found.set(ip, {
      ip,
      mac: identity.mac || previous.mac || null,
      model: identity.model || previous.model || 'Cisco IP Phone',
      phoneType: identity.phoneType,
      source: 'http',
      httpOpen: true,
      httpStatus: probe.status,
    })
  })

  const phones = [...found.values()].sort((a, b) => ipv4ToInt(a.ip) - ipv4ToInt(b.ip))
  return {
    subnet: range.cidr,
    scanned: range.hosts.length,
    count: phones.length,
    phones,
    localAddresses: locals.map((item) => item.address),
  }
}

function stripHtml(text) {
  return String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse Cisco 79xx HTML tables: <TD><B>Label</B></TD><td></TD><TD><B>Value</B></TD> */
function parseCiscoFields(html) {
  const fields = {}
  const re = /<TD[^>]*>\s*<B>\s*([^<]*?)\s*<\/B>\s*<\/TD>\s*<td[^>]*>\s*<\/TD>\s*<TD[^>]*>\s*<B>\s*([^<]*?)\s*<\/B>/gi
  let match
  while ((match = re.exec(html))) {
    const key = String(match[1] || '').replace(/\s+/g, ' ').trim()
    const value = String(match[2] || '').replace(/\s+/g, ' ').trim()
    if (key) fields[key] = value
  }
  return fields
}

function fieldOf(fields, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(fields, name)) return fields[name]
    const found = Object.keys(fields).find((key) => key.toLowerCase() === String(name).toLowerCase())
    if (found) return fields[found]
  }
  return ''
}

async function fetchCiscoPage(ip, adapter, timeoutMs = 2500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const url = `http://${ip}/CGI/Java/Serviceability?adapter=${adapter}`
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'text/html,*/*', 'User-Agent': 'CIWA-Telecom-PhoneScan/1.0' },
    })
    const body = await response.text()
    return { ok: response.ok, body: body.slice(0, 80000) }
  } catch {
    return { ok: false, body: '' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Read live 79xx web pages (Network Configuration / Device Information / Status).
 * This is how we detect "No IPv4 TFTP Server" which blocks SEP download.
 */
export async function readCiscoPhoneState(ip) {
  const address = assertIpv4(ip)
  const [net, device, status] = await Promise.all([
    fetchCiscoPage(address, 'device.statistics.configuration'),
    fetchCiscoPage(address, 'device.statistics.device'),
    fetchCiscoPage(address, 'device.settings.status.messages'),
  ])
  const netFields = parseCiscoFields(net.body)
  const deviceFields = parseCiscoFields(device.body)
  const statusText = stripHtml(status.body)
  const macRaw = fieldOf(deviceFields, 'MAC Address') || fieldOf(netFields, 'MAC Address')
  const mac = String(macRaw || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase()
  const hostName = fieldOf(netFields, 'Host Name') || fieldOf(deviceFields, 'Host Name')
  const macFromHost = /SEP([0-9A-Fa-f]{12})/i.exec(hostName)?.[1]?.toUpperCase() || ''

  const tftpServer1 = fieldOf(netFields, 'TFTP Server 1')
  const alternateTftp = fieldOf(netFields, 'Alternate TFTP')
  const dhcpServer = fieldOf(netFields, 'DHCP Server')
  const phoneDn = fieldOf(deviceFields, 'Phone DN')
  const version = fieldOf(deviceFields, 'Version')
  const appLoad = fieldOf(deviceFields, 'App Load ID')
  const modelNumber = fieldOf(deviceFields, 'Model Number')
  const noTftp = /No IPv4 TFTP Server/i.test(statusText) || !tftpServer1 || tftpServer1 === '::'
  const statusMessages = [...statusText.matchAll(/(?:No IPv4 TFTP Server|TFTP Error[^.]{0,80}|Registering|Registration Rejected)/gi)]
    .map((m) => String(m[0] || '').trim())
    .filter(Boolean)
    .slice(0, 8)

  return {
    ip: address,
    reachable: net.ok || device.ok,
    mac: mac.length === 12 ? mac : (macFromHost || null),
    model: modelNumber ? `Cisco Unified IP Phone ${modelNumber}` : (/7962/i.test(device.body) ? 'Cisco Unified IP Phone CP-7962G' : 'Cisco IP Phone'),
    phoneType: /7942/i.test(modelNumber || device.body) ? 'cisco-7942' : 'cisco-7962',
    phoneDn: phoneDn || null,
    version: version || null,
    appLoad: appLoad || null,
    dhcpServer: dhcpServer || null,
    tftpServer1: tftpServer1 || '',
    alternateTftp: alternateTftp || '',
    noTftpServer: noTftp,
    statusMessages,
    rawHints: {
      hasStatusPage: status.ok,
      hasNetworkPage: net.ok,
    },
  }
}

export function dhcpOption150Hex(ip) {
  const address = assertIpv4(ip)
  return `0x${address.split('.').map((part) => Number(part).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export async function inspectPhone(ip) {
  const address = assertIpv4(ip)
  const neighbors = await readNeighbors()
  const macFromArp = neighbors.get(address) || null
  const open = await tcpOpen(address, 80, 700)
  let identity = {
    looksCisco: isCiscoMac(macFromArp),
    model: isCiscoMac(macFromArp) ? 'Cisco (ARP)' : null,
    mac: macFromArp,
    phoneType: 'cisco-7962',
  }
  let httpOpen = false
  let ciscoState = null
  if (open) {
    httpOpen = true
    const probe = await httpProbe(address, 1500)
    identity = parsePhoneIdentity(probe.body, macFromArp)
    ciscoState = await readCiscoPhoneState(address)
    if (ciscoState.mac) identity.mac = ciscoState.mac
    if (ciscoState.model) identity.model = ciscoState.model
  }
  return {
    ip: address,
    mac: identity.mac || macFromArp || ciscoState?.mac || null,
    model: identity.model || ciscoState?.model,
    phoneType: identity.phoneType,
    httpOpen,
    looksCisco: identity.looksCisco || isCiscoMac(identity.mac || macFromArp) || Boolean(ciscoState?.reachable),
    cisco: ciscoState,
  }
}
