import { probeAmi } from '../asterisk/ami.js'
import { listChannels, listRecordings } from '../asterisk/pbx.js'
import {
  appendLog,
  loadCampaign,
  saveCampaign,
  updateCampaignStatus,
} from './campaignStore.js'

const active = new Map()

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findRecordingAfter(number, sinceIso) {
  const since = new Date(sinceIso).getTime()
  const needle = String(number).replace(/\D+/g, '').slice(-10)
  const items = listRecordings()
    .filter((r) => r.modifiedAt && new Date(r.modifiedAt).getTime() >= since - 5000)
    .filter((r) => {
      const hay = `${r.name} ${(r.numbers || []).join(' ')}`.replace(/\D+/g, '')
      return hay.includes(needle)
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  return items[0] || null
}

async function trackCall({ number, extension, startedAt, ringTimeoutSec = 45 }) {
  const startMs = Date.now()
  let ringSec = 0
  let talkSec = 0
  let answered = false
  let disposition = 'NO_ANSWER'
  const digits = String(number).replace(/\D+/g, '')

  while (Date.now() - startMs < ringTimeoutSec * 1000) {
    const { connected, items } = await listChannels()
    if (!connected) break
    const related = items.filter((ch) => {
      const blob = `${ch.callerId} ${ch.connectedLine} ${ch.channel}`.replace(/\D+/g, '')
      return blob.includes(digits.slice(-10)) || blob.includes(digits)
    })
    const up = related.find((ch) => String(ch.state).toLowerCase() === 'up')
    if (up) {
      answered = true
      disposition = 'ANSWERED'
      const answerMs = Date.now()
      ringSec = Math.round((answerMs - startMs) / 1000)
      while (Date.now() - answerMs < 120 * 60 * 1000) {
        await sleep(2000)
        const snap = await listChannels()
        const still = (snap.items || []).some((ch) => ch.channel === up.channel)
        if (!still) {
          talkSec = Math.round((Date.now() - answerMs) / 1000)
          break
        }
      }
      break
    }
    await sleep(2000)
  }

  if (!answered && Date.now() - startMs >= ringTimeoutSec * 1000) {
    disposition = 'NO_ANSWER'
  }

  const rec = findRecordingAfter(number, startedAt)
  return {
    success: answered,
    disposition,
    ringSec,
    talkSec,
    recordingFile: rec?.name || '',
    recordingId: rec?.id || '',
  }
}

export function getRunnerState(campaignId) {
  return active.get(campaignId) || { running: false }
}

export async function startCampaign(campaignId) {
  if (active.get(campaignId)?.running) {
    return loadCampaign(campaignId)
  }
  const campaign = loadCampaign(campaignId)
  if (!campaign.numbers?.length) {
    const error = new Error('لیست شماره خالی است. فایل را آپلود کنید.')
    error.status = 400
    throw error
  }
  updateCampaignStatus(campaignId, 'running', {
    startedAt: campaign.startedAt || new Date().toISOString(),
    finishedAt: null,
  })
  active.set(campaignId, { running: true, stop: false })

  void runLoop(campaignId)
  return loadCampaign(campaignId)
}

export function stopCampaign(campaignId) {
  const state = active.get(campaignId)
  if (state) state.stop = true
  updateCampaignStatus(campaignId, 'stopped', { finishedAt: new Date().toISOString() })
  return loadCampaign(campaignId)
}

export function pauseCampaign(campaignId) {
  const state = active.get(campaignId)
  if (state) state.stop = true
  updateCampaignStatus(campaignId, 'paused')
  return loadCampaign(campaignId)
}

async function runLoop(campaignId) {
  const state = active.get(campaignId)
  try {
    while (state && !state.stop) {
      let campaign = loadCampaign(campaignId)
      if (campaign.status !== 'running') break
      const index = campaign.currentIndex || 0
      if (index >= campaign.numbers.length) {
        updateCampaignStatus(campaignId, 'completed', { finishedAt: new Date().toISOString() })
        break
      }
      const number = campaign.numbers[index]
      const startedAt = new Date().toISOString()
      const ami = await probeAmi()
      let disposition = 'FAILED'
      let success = false
      let ringSec = 0
      let talkSec = 0
      let recordingFile = ''
      let recordingId = ''
      let note = ''

      if (!ami.connected) {
        note = ami.error || 'AMI قطع'
        appendLog(campaignId, {
          number,
          extension: campaign.extension,
          success: false,
          disposition: 'AMI_OFFLINE',
          ringSec: 0,
          talkSec: 0,
          recordingFile: '',
          note,
        })
        updateCampaignStatus(campaignId, 'paused')
        state.stop = true
        break
      }

      try {
        await ami.client.originate({
          extension: campaign.extension,
          destination: number,
          callerId: `CIWA <${campaign.extension}>`,
          timeoutMs: 45000,
        })
        const outcome = await trackCall({
          number,
          extension: campaign.extension,
          startedAt,
        })
        success = outcome.success
        disposition = outcome.disposition
        ringSec = outcome.ringSec
        talkSec = outcome.talkSec
        recordingFile = outcome.recordingFile
        recordingId = outcome.recordingId
      } catch (error) {
        note = error instanceof Error ? error.message : 'originate failed'
        disposition = 'FAILED'
      }

      appendLog(campaignId, {
        number,
        extension: campaign.extension,
        success,
        disposition,
        ringSec,
        talkSec,
        recordingFile,
        recordingId,
        note,
      })

      campaign = loadCampaign(campaignId)
      campaign.currentIndex = index + 1
      saveCampaign(campaign)

      if (state.stop) break
      await sleep(campaign.intervalSec * 1000)
    }
  } finally {
    active.delete(campaignId)
  }
}
