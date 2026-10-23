export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let authToken: string | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> || {}),
  }
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    let message = response.statusText
    try {
      const body = await response.json() as { message?: string; error?: string }
      if (body.message) message = body.message
      else if (body.error) message = body.error
    } catch { /* ignore */ }
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export type Overview = {
  product: string
  connected: boolean
  amiError: string | null
  core: {
    present: boolean
    sourceDir: string
    version: string
    branch: string | null
    hasMakefile: boolean
    samples: { manager: boolean; pjsip: boolean }
    touched: boolean
  }
  live: { startupTime: string | null; lastReload: string | null; channels: number; version: string | null } | null
  kpis: Record<string, number>
  recentCalls: CallRecord[]
  generatedAt: string
}

export type CallRecord = {
  id: string
  direction?: string
  from: string
  to: string
  duration: string
  disposition: string
  startedAt: string
}

export type ResourceKey =
  | 'extensions'
  | 'trunks'
  | 'inbound-routes'
  | 'outbound-routes'
  | 'queues'
  | 'ivrs'
  | 'ring-groups'
  | 'time-conditions'
  | 'conferences'
  | 'voicemail'
  | 'moh'

export type AuthUser = {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'operator' | 'viewer'
  mustChangePassword?: boolean
}

export const api = {
  login: (username: string, password: string) => request<{ token: string; expiresAt: number; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: AuthUser; authDisabled?: boolean }>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) => request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  }),
  listUsers: () => request<{ items: AuthUser[] }>('/api/auth/users'),
  saveUser: (body: Record<string, unknown>) => request('/api/auth/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id: string, body: Record<string, unknown>) => request(`/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUser: (id: string) => request(`/api/auth/users/${id}`, { method: 'DELETE' }),
  audit: () => request<{ items: any[] }>('/api/audit'),
  backups: () => request<{ items: any[] }>('/api/system/backups'),
  createBackup: () => request<{ ok: boolean; name: string; file: string }>('/api/system/backup', { method: 'POST' }),
  restoreBackup: (name: string) => request('/api/system/restore', { method: 'POST', body: JSON.stringify({ name }) }),
  exportJson: () => request<{ exported: string[] }>('/api/system/export-json', { method: 'POST' }),

  exportPhoneNumbersCsv: () => '/api/exports/phone-numbers',
  listCampaigns: () => request<{ items: any[] }>('/api/campaigns'),
  createCampaign: (body: Record<string, unknown>) => request<{ campaign: any }>('/api/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  getCampaign: (id: string) => request<{ campaign: any; logs: any[] }>(`/api/campaigns/${id}`),
  uploadCampaignFile: async (id: string, file: File) => {
    const token = localStorage.getItem('ciwa_telecom_token')
    const form = new FormData()
    form.append('file', file)
    const response = await fetch(`/api/campaigns/${id}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!response.ok) throw new ApiError(response.status, 'آپلود ناموفق')
    return response.json() as Promise<{ campaign: any; count: number }>
  },
  startCampaign: (id: string) => request(`/api/campaigns/${id}/start`, { method: 'POST' }),
  stopCampaign: (id: string) => request(`/api/campaigns/${id}/stop`, { method: 'POST' }),
  pauseCampaign: (id: string) => request(`/api/campaigns/${id}/pause`, { method: 'POST' }),
  campaignLogsCsvUrl: (id: string) => `/api/campaigns/${id}/logs.csv`,

  getDatabase: () => request<{ config: any; active: string; usingDatabase: boolean }>('/api/settings/database'),
  saveDatabase: (body: Record<string, unknown>) => request('/api/settings/database', { method: 'PUT', body: JSON.stringify(body) }),
  testDatabase: (body?: Record<string, unknown>) => request<{ ok: boolean; message?: string }>('/api/settings/database/test', { method: 'POST', body: JSON.stringify(body || {}) }),
  applyDatabase: (body: Record<string, unknown>) => request('/api/settings/database/apply', { method: 'POST', body: JSON.stringify(body) }),
  importDatabase: () => request('/api/settings/database/import', { method: 'POST' }),
  useFileDatabase: () => request('/api/settings/database/use-file', { method: 'POST' }),

  overview: () => request<Overview>('/api/overview'),
  status: () => request<any>('/api/status'),
  channels: () => request<{ connected: boolean; amiError: string | null; items: any[] }>('/api/channels'),
  pjsipEndpoints: () => request<{ connected: boolean; amiError: string | null; items: any[] }>('/api/pjsip/endpoints'),
  queuesLive: () => request<{ connected: boolean; amiError: string | null; items: any[] }>('/api/queues/live'),
  queuePause: (member: string, paused: boolean) => request('/api/queues/member/pause', {
    method: 'POST',
    body: JSON.stringify({ member, paused }),
  }),
  softphoneBootstrap: () => request<any>('/api/softphone/bootstrap'),
  originate: (body: { extension: string; destination: string; callerId?: string }) => request('/api/calls/originate', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  hangup: (channel: string) => request('/api/calls/hangup', { method: 'POST', body: JSON.stringify({ channel }) }),

  cdr: () => request<{ connected: boolean; items: CallRecord[] }>('/api/cdr'),
  recordings: () => request<{ items: any[] }>('/api/recordings'),
  recordingUrl: (id: string) => `/api/recordings/${encodeURIComponent(id)}/audio`,
  list: (key: ResourceKey) => request<{ connected: boolean; amiError: string | null; items: any[] }>(`/api/${key}`),
  create: (key: ResourceKey, body: Record<string, unknown>) => request(`/api/${key}`, { method: 'POST', body: JSON.stringify(body) }),
  update: (key: ResourceKey, id: string, body: Record<string, unknown>) => request(`/api/${key}/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (key: ResourceKey, id: string) => request(`/api/${key}/${id}`, { method: 'DELETE' }),
  getSip: () => request<{ sip: any }>('/api/settings/sip'),
  saveSip: (sip: Record<string, unknown>) => request('/api/settings/sip', { method: 'PUT', body: JSON.stringify(sip) }),
  getAmi: () => request<{ ami: any }>('/api/settings/ami'),
  saveAmi: (ami: Record<string, unknown>) => request('/api/settings/ami', { method: 'PUT', body: JSON.stringify(ami) }),
  regenerate: () => request('/api/configs/regenerate', { method: 'POST' }),
  network: () => request<any>('/api/system/network'),
  saveNetwork: (body: Record<string, unknown>) => request('/api/system/network', { method: 'PUT', body: JSON.stringify(body) }),
  applyNetwork: () => request<{ ok: boolean; note?: string; stderr?: string; stdout?: string }>('/api/system/network/apply', { method: 'POST' }),
  firewall: () => request<any>('/api/system/firewall'),
  saveFirewall: (body: Record<string, unknown>) => request('/api/system/firewall', { method: 'PUT', body: JSON.stringify(body) }),
  addFirewallRule: (body: Record<string, unknown>) => request('/api/system/firewall/rules', { method: 'POST', body: JSON.stringify(body) }),
  removeFirewallRule: (id: string) => request(`/api/system/firewall/rules/${id}`, { method: 'DELETE' }),
  applyFirewall: () => request<{ ok: boolean; note?: string; stderr?: string; stdout?: string }>('/api/system/firewall/apply', { method: 'POST' }),
}
