import dgram from 'node:dgram'
import fs from 'node:fs'
import path from 'node:path'

const RRQ = 1
const DATA = 3
const ACK = 4
const ERROR = 5
const OACK = 6

function parseRrq(message) {
  if (message.length < 4 || message.readUInt16BE(0) !== RRQ) return null
  const parts = []
  let offset = 2
  while (offset < message.length) {
    const end = message.indexOf(0, offset)
    if (end === -1) break
    parts.push(message.slice(offset, end).toString('utf8'))
    offset = end + 1
  }
  if (!parts[0]) return null
  const options = {}
  for (let index = 2; index + 1 < parts.length; index += 2) {
    options[parts[index].toLowerCase()] = parts[index + 1]
  }
  return { filename: parts[0], options }
}

function safeFile(root, filename) {
  const base = path.basename(String(filename || '').replace(/\\/g, '/'))
  if (!base || base === '.' || base === '..' || base.includes('\0')) return null
  const full = path.resolve(root, base)
  if (!full.startsWith(path.resolve(root) + path.sep)) return null
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null
  return full
}

function packet(opcode, payload) {
  const header = Buffer.alloc(2)
  header.writeUInt16BE(opcode, 0)
  return Buffer.concat([header, payload])
}

function errorPacket(message) {
  const body = Buffer.alloc(2 + Buffer.byteLength(message) + 1)
  body.writeUInt16BE(1, 0)
  body.write(message, 2)
  return packet(ERROR, body)
}

export function startTftpServer({ root, port = 69, host = '0.0.0.0' } = {}) {
  const socket = dgram.createSocket('udp4')
  const sessions = new Map()

  function send(buffer, rinfo) {
    socket.send(buffer, rinfo.port, rinfo.address)
  }

  function beginTransfer(rinfo, file, blockSize) {
    const key = `${rinfo.address}:${rinfo.port}`
    const session = {
      file,
      blockSize,
      block: 0,
      timer: null,
      payload: null,
      rinfo,
    }
    sessions.set(key, session)
    sendBlock(session, 1)
  }

  function sendBlock(session, block) {
    const start = (block - 1) * session.blockSize
    const chunk = session.file.subarray(start, start + session.blockSize)
    const body = Buffer.alloc(2 + chunk.length)
    body.writeUInt16BE(block, 0)
    chunk.copy(body, 2)
    session.block = block
    session.payload = packet(DATA, body)
    session.tries = 0
    transmit(session)
    if (chunk.length < session.blockSize) session.done = true
  }

  function transmit(session) {
    clearTimeout(session.timer)
    send(session.payload, session.rinfo)
    session.tries += 1
    if (session.tries > 6) {
      sessions.delete(`${session.rinfo.address}:${session.rinfo.port}`)
      return
    }
    session.timer = setTimeout(() => transmit(session), 1000)
  }

  socket.on('message', (message, rinfo) => {
    const opcode = message.length >= 2 ? message.readUInt16BE(0) : 0
    const key = `${rinfo.address}:${rinfo.port}`

    if (opcode === RRQ) {
      const previous = sessions.get(key)
      if (previous?.timer) clearTimeout(previous.timer)
      const request = parseRrq(message)
      const full = request ? safeFile(root, request.filename) : null
      if (!full) {
        send(errorPacket('File not found'), rinfo)
        return
      }
      const file = fs.readFileSync(full)
      let blockSize = 512
      const options = request.options || {}
      const oack = []
      if (options.blksize) {
        const asked = Number(options.blksize)
        blockSize = Math.min(8192, Math.max(8, Number.isFinite(asked) ? asked : 512))
        oack.push('blksize', String(blockSize))
      }
      if (options.tsize !== undefined) oack.push('tsize', String(file.length))
      const pending = { file, blockSize, rinfo }
      if (oack.length) {
        const body = Buffer.concat(oack.map((part) => Buffer.concat([Buffer.from(part), Buffer.from([0])])))
        sessions.set(key, { ...pending, waitAck0: true, payload: packet(OACK, body), tries: 0 })
        transmit(sessions.get(key))
        return
      }
      beginTransfer(rinfo, file, blockSize)
      return
    }

    if (opcode === ACK) {
      const session = sessions.get(key)
      const block = message.length >= 4 ? message.readUInt16BE(2) : -1
      if (!session) return
      if (session.waitAck0 && block === 0) {
        clearTimeout(session.timer)
        session.waitAck0 = false
        beginTransfer(rinfo, session.file, session.blockSize)
        return
      }
      if (block === session.block) {
        clearTimeout(session.timer)
        if (session.done) {
          sessions.delete(key)
          return
        }
        sendBlock(session, session.block + 1)
      }
    }
  })

  return new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.bind(port, host, () => {
      socket.off('error', reject)
      resolve(socket)
    })
  })
}

const startedDirectly = process.argv[1] && process.argv[1].endsWith('tftpServer.js')
if (startedDirectly) {
  const root = process.argv[2]
  const port = Number(process.argv[3] || process.env.CIWA_TFTP_PORT || 69)
  const host = process.env.CIWA_TFTP_BIND || '0.0.0.0'
  if (!root) {
    console.error('usage: node tftpServer.js <root> [port]')
    process.exit(1)
  }
  startTftpServer({ root, port, host }).then(() => {
    console.log(`CIWA TFTP ${host}:${port} -> ${root}`)
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
