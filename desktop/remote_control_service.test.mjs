import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { RemoteControlService } = require('./remote_control_service')

let service = null

function waitForOpen(socket) {
    return new Promise((resolve, reject) => {
        socket.addEventListener('error', reject, { once: true })
        socket.addEventListener('open', resolve, { once: true })
    })
}

function waitForMessage(socket) {
    return new Promise((resolve) => {
        socket.addEventListener('message', (message) => resolve(String(message.data)), { once: true })
    })
}

describe('RemoteControlService', () => {
    afterEach(async () => {
        if (service) await service.stop()
        service = null
    })

    it('starts a WebSocket endpoint only while active', async () => {
        service = new RemoteControlService()

        const status = await service.start()

        expect(status.active).toBe(true)
        expect(status.endpoint).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/u)

        const socket = new WebSocket(status.endpoint)
        await waitForOpen(socket)
        socket.send('ping')

        await expect(waitForMessage(socket)).resolves.toBe('ping')
        expect(service.getStatus().clientCount).toBe(1)

        socket.close()
        await service.stop()

        expect(service.getStatus()).toEqual({ active: false, clientCount: 0, endpoint: null })
    })
})
