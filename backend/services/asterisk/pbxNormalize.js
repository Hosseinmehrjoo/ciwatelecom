import {
  assertDialPattern,
  assertExtensionNumber,
  assertHost,
  assertNoControl,
  assertSectionId,
  normalizeMac,
} from './confSafe.js'

const PHONE_TYPES = ['webrtc', 'sip', 'cisco-7942', 'cisco-7962']

export function normalizeCollectionItem(key, item) {
  const next = { ...item }
  if (typeof next.members === 'string') {
    next.members = next.members.split(',').map((part) => part.trim()).filter(Boolean)
  }
  if (key === 'ivrs') {
    if (typeof next.options === 'string') {
      try { next.options = JSON.parse(next.options || '[]') } catch { next.options = [] }
    }
    if (!Array.isArray(next.options)) next.options = []
  }
  if (key === 'extensions') {
    next.id = next.id || next.number
    if (next.voicemail === 'on') next.voicemail = true
    if (next.voicemail === 'off') next.voicemail = false
    if (next.recordCalls === 'on') next.recordCalls = true
    if (next.recordCalls === 'off') next.recordCalls = false
  }
  if (key === 'trunks') {
    if (next.register === 'on') next.register = true
    if (next.register === 'off') next.register = false
  }
  return next
}

import { collectionIdField as storeIdField } from '../store/pbxStore.js'

export function collectionIdField(key) {
  return storeIdField(key)
}

export function validateCollectionItem(key, item) {
  const next = { ...item }
  if (next.name) assertNoControl(next.name, 'نام')
  if (key === 'extensions') {
    next.number = assertExtensionNumber(next.number, 'شماره داخلی')
    next.id = next.number
    next.phoneType = PHONE_TYPES.includes(next.phoneType) ? next.phoneType : 'webrtc'
    next.webrtc = next.phoneType === 'webrtc'
    if (String(next.phoneType).startsWith('cisco')) {
      next.mac = normalizeMac(next.mac)
    } else {
      delete next.mac
    }
  } else if (key === 'trunks') {
    next.id = assertSectionId(next.id, 'شناسه ترانک')
    next.host = assertHost(next.host, 'میزبان ترانک')
  } else if (key === 'inboundRoutes') {
    next.id = assertSectionId(next.id, 'شناسه مسیر')
    next.did = assertDialPattern(next.did || 's', 'DID')
    if (next.destination) next.destination = assertSectionId(next.destination, 'مقصد')
  } else if (key === 'outboundRoutes') {
    next.id = assertSectionId(next.id, 'شناسه مسیر')
    next.pattern = assertDialPattern(next.pattern, 'الگو')
    next.trunkId = assertSectionId(next.trunkId, 'ترانک')
  } else if (key === 'queues' || key === 'ringGroups' || key === 'conferences') {
    next.id = assertSectionId(next.id, 'شناسه')
    if (next.number) next.number = assertExtensionNumber(next.number, 'شماره')
  } else if (key === 'ivrs' || key === 'timeConditions' || key === 'mohClasses') {
    next.id = assertSectionId(next.id, 'شناسه')
  } else if (key === 'voicemailBoxes') {
    next.number = assertExtensionNumber(next.number, 'شماره صندوق')
  }
  return next
}
