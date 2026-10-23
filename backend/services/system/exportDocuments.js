import { writeJson, resolvePath } from '../store/fsutil.js'
import { loadDocumentSync } from '../store/documentStore.js'
import { emptyPbx } from '../store/pbxStore.js'
import { emptySystem } from '../store/systemStore.js'

const FILES = {
  pbx: { path: resolvePath('config/ciwa/pbx.json'), fallback: emptyPbx },
  system: { path: resolvePath('config/ciwa/system.json'), fallback: emptySystem },
  auth: { path: resolvePath('config/ciwa/auth.json'), fallback: () => ({ users: [] }) },
}

export function exportDocumentsToFiles() {
  const exported = []
  for (const [namespace, meta] of Object.entries(FILES)) {
    const data = loadDocumentSync(namespace, meta.fallback())
    writeJson(meta.path, data)
    exported.push(namespace)
  }
  return { ok: true, exported, at: new Date().toISOString() }
}
