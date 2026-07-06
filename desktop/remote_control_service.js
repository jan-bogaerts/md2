const crypto = require('node:crypto')
const http = require('node:http')

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 0

function createInactiveState() {
    return {
        active: false,
        clientCount: 0,
        endpoint: null,
    }
}

function acceptKey(key) {
    return crypto
        .createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64')
}

function encodeTextFrame(text) {
    const payload = Buffer.from(text)
    if (payload.length > 125) throw new Error('Remote-control message is too large')

    return Buffer.concat([Buffer.from([0x81, payload.length]), payload])
}

function decodeTextFrame(buffer) {
    const isMasked = !!(buffer[1] & 0x80)
    const length = buffer[1] & 0x7f
    const maskOffset = 2
    const payloadOffset = isMasked ? 6 : 2
    const payload = buffer.subarray(payloadOffset, payloadOffset + length)

    if (!isMasked) return payload.toString()

    const mask = buffer.subarray(maskOffset, payloadOffset)
    const decoded = Buffer.alloc(payload.length)
    for (let index = 0; index < payload.length; index += 1) decoded[index] = payload[index] ^ mask[index % 4]

    return decoded.toString()
}

class RemoteControlService {
    constructor() {
        this.clientCount = 0
        this.clients = new Set()
        this.host = DEFAULT_HOST
        this.port = DEFAULT_PORT
        this.server = null
        this.statusListener = null
    }

    getStatus() {
        if (!this.server) return createInactiveState()

        const address = this.server.address()
        const port = address && typeof address === 'object' ? address.port : this.port

        return {
            active: true,
            clientCount: this.clientCount,
            endpoint: `ws://${this.host}:${port}`,
        }
    }

    async start(options = {}) {
        if (this.server) return this.getStatus()

        this.host = typeof options.host === 'string' && options.host.length > 0 ? options.host : DEFAULT_HOST
        this.port = Number.isInteger(options.port) ? options.port : DEFAULT_PORT

        await new Promise((resolve, reject) => {
            const server = http.createServer()
            const service = this

            function handleListening() {
                server.off('error', handleError)
                service.server = server
                service.registerServerEvents(server)
                service.emitStatus()
                resolve()
            }

            function handleError(error) {
                server.off('listening', handleListening)
                reject(error)
            }

            server.once('error', handleError)
            server.once('listening', handleListening)
            server.listen(this.port, this.host)
        })

        return this.getStatus()
    }

    async stop() {
        if (!this.server) return createInactiveState()

        const server = this.server
        this.server = null
        this.clientCount = 0

        for (const client of this.clients) client.destroy()
        this.clients.clear()

        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }

                resolve()
            })
        })

        this.emitStatus()

        return createInactiveState()
    }

    setStatusListener(listener) {
        this.statusListener = listener
    }

    registerServerEvents(server) {
        server.on('upgrade', (request, socket) => {
            const key = request.headers['sec-websocket-key']
            if (typeof key !== 'string' || key.length === 0) {
                socket.destroy()
                return
            }

            socket.write([
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
                `Sec-WebSocket-Accept: ${acceptKey(key)}`,
                '',
                '',
            ].join('\r\n'))
            this.clients.add(socket)
            this.clientCount += 1
            this.emitStatus()

            socket.on('data', (message) => {
                socket.write(encodeTextFrame(decodeTextFrame(message)))
            })
            socket.on('close', () => {
                this.clients.delete(socket)
                this.clientCount = Math.max(0, this.clientCount - 1)
                this.emitStatus()
            })
        })
    }

    emitStatus() {
        if (this.statusListener) this.statusListener(this.getStatus())
    }
}

module.exports = { RemoteControlService }
