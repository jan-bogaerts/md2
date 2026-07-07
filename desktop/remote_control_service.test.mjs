import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import WebSocket from 'ws'

const require = createRequire(import.meta.url)
const { RemoteControlService } = require('./remote_control_service')

let service = null

function connect(status, token = status.token) {
    return new WebSocket(`${status.endpoint}?token=${token}`)
}

function waitForOpen(socket) {
    return new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.once('open', resolve)
    })
}

function waitForClose(socket) {
    return new Promise((resolve) => {
        socket.once('close', resolve)
    })
}

function waitForMessage(socket) {
    return new Promise((resolve) => {
        socket.once('message', (message) => resolve(JSON.parse(message.toString())))
    })
}

function waitForMessages(socket, count) {
    return new Promise((resolve) => {
        const messages = []
        const handleMessage = (message) => {
            messages.push(JSON.parse(message.toString()))
            if (messages.length !== count) return

            socket.off('message', handleMessage)
            resolve(messages)
        }

        socket.on('message', handleMessage)
    })
}

async function request(socket, id, method, params = []) {
    socket.send(JSON.stringify({ id, method, params }))

    return waitForMessage(socket)
}

function createDispatcher(overrides = {}) {
    const methods = {
        echo: async (value) => value,
        fail: async () => {
            throw new Error('method failed')
        },
        runAgent: async (_request, onEvent) => {
            onEvent({ content: 'hello', conversation: { id: 'run-1' }, runId: 'run-1', type: 'stdout' })

            return { runId: 'run-1' }
        },
        watchProject: (_project, onChange) => {
            onChange({ changeKind: 'changed', path: 'design/F-1.md' })

            return vi.fn()
        },
        ...overrides,
    }

    return {
        invoke(method, params) {
            const handler = methods[method]
            if (!handler) throw new Error(`Unknown method ${method}`)

            return handler(...params)
        },
    }
}

describe('RemoteControlService', () => {
    afterEach(async () => {
        if (service) await service.stop()
        service = null
    })

    it('handles authenticated JSON-RPC requests with large payloads and concurrent ids', async () => {
        service = new RemoteControlService(createDispatcher())
        const status = await service.start()
        const socket = connect(status)
        await waitForOpen(socket)
        const largePayload = 'x'.repeat(512)

        const responsePromise = waitForMessages(socket, 2)
        socket.send(JSON.stringify({ id: 'large', method: 'echo', params: [largePayload] }))
        socket.send(JSON.stringify({ id: 'small', method: 'echo', params: ['ok'] }))
        const responses = await responsePromise

        expect(responses).toEqual(expect.arrayContaining([
            { id: 'large', result: largePayload },
            { id: 'small', result: 'ok' },
        ]))
        expect(service.getStatus().clientCount).toBe(1)
    })

    it('rejects connections without the token', async () => {
        service = new RemoteControlService(createDispatcher())
        const status = await service.start()
        const socket = connect(status, 'wrong-token')

        await expect(waitForOpen(socket)).rejects.toThrow()
    })

    it('returns method errors by request id', async () => {
        service = new RemoteControlService(createDispatcher())
        const status = await service.start()
        const socket = connect(status)
        await waitForOpen(socket)

        await expect(request(socket, 'fail-1', 'fail')).resolves.toEqual({
            error: { message: 'method failed' },
            id: 'fail-1',
        })
    })

    it('pushes watchProject and agent run events', async () => {
        service = new RemoteControlService(createDispatcher())
        const status = await service.start()
        const socket = connect(status)
        await waitForOpen(socket)

        const watchPromise = waitForMessages(socket, 2)
        socket.send(JSON.stringify({ id: 'watch-1', method: 'watchProject', params: [{ id: 'local' }] }))
        const [watchPush, watchResponse] = await watchPromise
        const agentPromise = waitForMessages(socket, 2)
        socket.send(JSON.stringify({ id: 'agent-1', method: 'runAgent', params: [{ cardPath: 'design/F-1.md' }] }))
        const [agentPush, agentResponse] = await agentPromise

        expect(watchPush.event).toBe('watchProject')
        expect(watchPush.payload.event).toEqual({ changeKind: 'changed', path: 'design/F-1.md' })
        expect(watchResponse.result.subscriptionId).toEqual(expect.any(String))
        expect(agentPush).toEqual({
            event: 'agentRun',
            payload: {
                event: { content: 'hello', conversation: { id: 'run-1' }, runId: 'run-1', type: 'stdout' },
                requestId: 'agent-1',
            },
        })
        expect(agentResponse).toEqual({ id: 'agent-1', result: { runId: 'run-1' } })
    })

    it('closes clients on stop', async () => {
        service = new RemoteControlService(createDispatcher())
        const status = await service.start()
        const socket = connect(status)
        await waitForOpen(socket)

        await service.stop()

        await expect(waitForClose(socket)).resolves.toBeDefined()
        expect(service.getStatus()).toEqual({ active: false, clientCount: 0, endpoint: null, token: null })
    })
})
