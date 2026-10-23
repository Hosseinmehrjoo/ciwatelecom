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
