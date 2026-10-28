import fs from 'node:fs'
import net from 'node:net'
import { encodeAmi } from './confSafe.js'
import { loadPbx } from '../store/pbxStore.js'

/**
 * Minimal Asterisk Manager Interface client.
 * Connects to a running Asterisk process only. Never writes into core/asterisk.
 */
export class AmiClient {
  constructor({ host, port, username, secret, timeoutMs = 3500 }) {
    this.host = host
    this.port = port
    this.username = username
    this.secret = secret
    this.timeoutMs = timeoutMs
  }

  async request(action, { collectEvent } = {}) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port })
      let buffer = ''
      let settled = false
      let authenticated = false
      const events = []
      let finalResponse = null

      const timer = setTimeout(() => fail(new Error('AMI timeout')), this.timeoutMs)

      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.destroy()
        resolve(value)
      }

      const fail = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.destroy()
        reject(error)
      }

      socket.setEncoding('utf8')
      socket.on('error', fail)
      socket.on('data', (chunk) => {
        buffer += chunk
        const packets = buffer.split('\r\n\r\n')
        buffer = packets.pop() || ''
        for (const packet of packets) {
          if (!packet.trim()) continue
          const message = parseAmi(packet)

          if (!authenticated) {
            if (message.Response === 'Success') {
              authenticated = true
              socket.write(encodeAmi(action))
            } else if (message.Response) {
              fail(new Error(message.Message || 'AMI login failed'))
            }
            continue
          }

          if (message.Event) {
            events.push(message)
            if (collectEvent && message.Event === collectEvent) {
              finish({ response: finalResponse, events })
            }
            continue
          }

          if (message.Response) {
            finalResponse = message
            if (!collectEvent) finish({ response: message, events })
            if (message.Response === 'Error') fail(new Error(message.Message || 'AMI action failed'))
          }
        }
      })

      socket.on('connect', () => {
        socket.write(encodeAmi({
          Action: 'Login',
          Username: this.username,
          Secret: this.secret,
          Events: 'off',
        }))
      })
    })
  }

  coreStatus() {
    return this.request({ Action: 'CoreStatus' }).then((r) => r.response)
  }

  ping() {
    return this.request({ Action: 'Ping' }).then((r) => r.response?.Response === 'Success')
  }

  reload() {
    return this.request({ Action: 'Command', Command: 'core reload' }).then((r) => r.response)
  }

  showChannels() {
    return this.request({ Action: 'CoreShowChannels' }, { collectEvent: 'CoreShowChannelsComplete' })
  }

  pjsipEndpoints() {
    return this.request({ Action: 'PJSIPShowEndpoints' }, { collectEvent: 'EndpointListComplete' })
  }

  /**
   * Click-to-call: ring the agent extension, then dial destination in from-internal.
   */
  originate({ extension, destination, callerId, timeoutMs = 30000 }) {
    return this.request({
      Action: 'Originate',
      Channel: `PJSIP/${extension}`,
      Context: 'from-internal',
      Exten: String(destination),
      Priority: '1',
      CallerID: callerId || `${extension} <${extension}>`,
      Timeout: String(timeoutMs),
      Async: 'true',
      Variable: `CIWA_CRM=1`,
    }).then((r) => r.response)
  }

  hangup(channel) {
    return this.request({ Action: 'Hangup', Channel: channel }).then((r) => r.response)
  }

  redirect({ channel, extension, context = 'from-internal' }) {
    return this.request({
      Action: 'Redirect',
      Channel: channel,
      Exten: String(extension),
      Context: context,
      Priority: '1',
    }).then((r) => r.response)
  }

  queueStatus() {
    return this.request({ Action: 'QueueStatus' }, { collectEvent: 'QueueStatusComplete' })
  }

  queuePause({ interfaceName, paused, reason = '' }) {
    return this.request({
      Action: 'QueuePause',
      Interface: interfaceName,
      Paused: paused ? 'true' : 'false',
      Reason: reason,
    }).then((r) => r.response)
  }
}

function parseAmi(packet) {
  const message = {}
  for (const line of packet.split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index === -1) continue
    message[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return message
}

export function resolveAmiHost(configured, { inDocker } = {}) {
  const host = String(configured || '127.0.0.1').trim() || '127.0.0.1'
  if (process.env.CIWA_AMI_HOST_MODE === 'literal') return host
  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1'
  const docker = inDocker ?? fs.existsSync('/.dockerenv')
  if (loopback && docker) return process.env.CIWA_AMI_DOCKER_HOST || 'host.docker.internal'
  return host
}

export function createAmiFromConfig() {
  const pbx = loadPbx()
  return new AmiClient({
    host: resolveAmiHost(process.env.AMI_HOST || pbx.ami.bindIp || '127.0.0.1'),
    port: Number(process.env.AMI_PORT || pbx.ami.port || 5038),
    username: process.env.AMI_USERNAME || pbx.ami.username || 'ciwa',
    secret: process.env.AMI_SECRET || pbx.ami.secret || 'ciwa',
    timeoutMs: Number(process.env.AMI_TIMEOUT_MS || 3500),
  })
}

export async function probeAmi() {
  const ami = createAmiFromConfig()
  try {
    const status = await ami.coreStatus()
    return {
      connected: true,
      error: null,
      live: {
        startupTime: status.StartupTime || null,
        lastReload: status.LastReload || null,
        channels: Number(status.CoreCurrentCalls || 0),
        version: status.CoreVersion || null,
      },
      client: ami,
    }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'AMI unavailable',
      live: null,
      client: ami,
    }
  }
}
