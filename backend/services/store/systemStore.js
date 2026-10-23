import { uid } from './fsutil.js'
import { loadDocumentSync, saveDocument } from './documentStore.js'

export const emptySystem = () => ({
  hostname: '',
  dns: [],
  gateway: '',
  interfaces: [],
  firewall: {
    enabled: true,
    defaultIncoming: 'drop',
    defaultOutgoing: 'accept',
    rules: [
      { id: 'fw_ssh', enabled: true, action: 'accept', protocol: 'tcp', port: '22', source: 'any', comment: 'SSH' },
      { id: 'fw_sip', enabled: true, action: 'accept', protocol: 'udp', port: '5060', source: 'any', comment: 'SIP' },
      { id: 'fw_rtp', enabled: true, action: 'accept', protocol: 'udp', port: '10000-20000', source: 'any', comment: 'RTP' },
      { id: 'fw_ami', enabled: true, action: 'accept', protocol: 'tcp', port: '5038', source: '127.0.0.1', comment: 'AMI local' },
      { id: 'fw_ui', enabled: true, action: 'accept', protocol: 'tcp', port: '5173', source: 'any', comment: 'CIWA UI' },
      { id: 'fw_api', enabled: true, action: 'accept', protocol: 'tcp', port: '8788', source: 'any', comment: 'CIWA API' },
    ],
  },
})

export function loadSystem() {
  const data = loadDocumentSync('system', emptySystem())
  return {
    ...emptySystem(),
    ...data,
    firewall: {
      ...emptySystem().firewall,
      ...(data.firewall || {}),
      rules: data.firewall?.rules || emptySystem().firewall.rules,
    },
  }
}

export async function saveSystem(data) {
  await saveDocument('system', data, emptySystem())
  return data
}

export async function upsertFirewallRule(rule) {
  const system = loadSystem()
  const id = rule.id || uid('fw')
  const next = { enabled: true, action: 'accept', protocol: 'tcp', port: '', source: 'any', comment: '', ...rule, id }
  const index = system.firewall.rules.findIndex((row) => row.id === id)
  if (index === -1) system.firewall.rules.push(next)
  else system.firewall.rules[index] = { ...system.firewall.rules[index], ...next }
  return saveSystem(system)
}

export async function removeFirewallRule(id) {
  const system = loadSystem()
  system.firewall.rules = system.firewall.rules.filter((row) => row.id !== id)
  return saveSystem(system)
}
