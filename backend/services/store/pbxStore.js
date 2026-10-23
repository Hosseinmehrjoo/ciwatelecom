import { uid } from './fsutil.js'
import { loadDocumentSync, saveDocument } from './documentStore.js'

export const emptyPbx = () => ({
  extensions: [],
  trunks: [],
  inboundRoutes: [],
  outboundRoutes: [],
  queues: [],
  ivrs: [],
  ringGroups: [],
  timeConditions: [],
  conferences: [],
  voicemailBoxes: [],
  mohClasses: [],
  sip: {
    udpEnabled: true,
    tcpEnabled: false,
    wssEnabled: true,
    bindIp: '0.0.0.0',
    sipPort: 5060,
    tlsPort: 5061,
    wssPort: 8089,
    rtpStart: 10000,
    rtpEnd: 20000,
    externalIp: '',
    localNets: ['192.168.0.0/16', '10.0.0.0/8'],
  },
  ami: {
    enabled: true,
    bindIp: '127.0.0.1',
    port: 5038,
    username: 'ciwa',
    secret: 'ciwa',
  },
})

export function loadPbx() {
  const data = loadDocumentSync('pbx', emptyPbx())
  return { ...emptyPbx(), ...data, sip: { ...emptyPbx().sip, ...(data.sip || {}) }, ami: { ...emptyPbx().ami, ...(data.ami || {}) } }
}

export async function savePbx(data) {
  await saveDocument('pbx', data, emptyPbx())
  return data
}

export async function mutateCollection(key, mutator) {
  const pbx = loadPbx()
  const list = Array.isArray(pbx[key]) ? [...pbx[key]] : []
  const next = mutator(list, uid)
  pbx[key] = next
  await savePbx(pbx)
  return pbx
}

export function collectionIdField(key) {
  if (key === 'extensions' || key === 'voicemailBoxes') return 'number'
  return 'id'
}

export async function upsertItem(key, item, idField = collectionIdField(key)) {
  return mutateCollection(key, (list, makeId) => {
    const id = item[idField] || makeId(key.slice(0, 3))
    const record = { ...item, [idField]: id, updatedAt: new Date().toISOString() }
    if (!record.createdAt) record.createdAt = record.updatedAt
    const index = list.findIndex((row) => row[idField] === id)
    if (index === -1) return [...list, record]
    const prev = list[index]
    list[index] = { ...prev, ...record, createdAt: prev.createdAt || record.createdAt }
    return list
  })
}

export async function removeItem(key, id, idField = collectionIdField(key)) {
  const needle = String(id)
  return mutateCollection(key, (list) => list.filter((row) => String(row[idField]) !== needle && String(row.id) !== needle))
}
