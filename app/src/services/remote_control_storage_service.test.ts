import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteControlStorageService } from './remote_control_storage_service'

class MockWebSocket extends EventTarget {
    static instances: MockWebSocket[] = []

    readyState = 0
    protocol: string | string[] | undefined
    sent: string[] = []
    url: string

    constructor(url: string, protocol?: string | string[]) {
        super()
        this.protocol = protocol
        this.url = url
        MockWebSocket.instances.push(this)
    }

    send(message: string) {
        this.sent.push(message)
    }

    open() {
        this.readyState = 1
        this.dispatchEvent(new Event('open'))
    }

    close() {
        this.readyState = 3
        this.dispatchEvent(new Event('close'))
    }

    receive(message: unknown) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }))
    }
}

function installWebSocket() {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
}

function createService() {
    const service = new RemoteControlStorageService()
    service.init({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })

    return service
}

function lastSocket() {
    const socket = MockWebSocket.instances.at(-1)
    if (!socket) throw new Error('Missing mock socket')

    return socket
}

function commandRequest() {
    return { actionId: 'action-test', actionsFolder: 'actions', context: { file: 'design/F-1.md', kind: 'card' as const }, extraInput: '' }
}

async function flushPromises() {
    await Promise.resolve()
    await Promise.resolve()
}

describe('RemoteControlStorageService', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('matches concurrent responses by request id', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const first = service.loadProject(project, 'design')
        const second = service.listBranches(project)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const firstRequest = JSON.parse(socket.sent[0]) as { id: string }
        const secondRequest = JSON.parse(socket.sent[1]) as { id: string }
        socket.receive({ id: secondRequest.id, result: [{ name: 'main' }] })
        socket.receive({ id: firstRequest.id, result: { files: [], workingFolder: 'design' } })

        await expect(first).resolves.toEqual({ files: [], workingFolder: 'design' })
        await expect(second).resolves.toEqual([{ name: 'main' }])
    })

    it('rejects error responses', async () => {
        installWebSocket()
        const service = createService()
        const request = service.runCommand(commandRequest())
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string }
        socket.receive({ error: { message: 'command failed' }, id: sentRequest.id })

        await expect(request).rejects.toThrow('command failed')
    })

    it('delivers watch and agent push events', async () => {
        installWebSocket()
        const service = createService()
        const watchCallback = vi.fn()
        const agentCallback = vi.fn()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        service.watchProject(project, watchCallback)
        const agentRequest = service.startAgentConversation(project, { cardPath: 'design/F-1.md', prompt: 'go' }, agentCallback)
        const socket = lastSocket()
        socket.open()
        await flushPromises()
        const watchRequest = JSON.parse(socket.sent[0]) as { id: string }
        const agentStartRequest = JSON.parse(socket.sent[1]) as { id: string }
        socket.receive({ id: watchRequest.id, result: { subscriptionId: 'sub-1' } })
        socket.receive({
            event: 'watchProject',
            payload: { event: { changeKind: 'changed', path: 'design/F-1.md' }, requestId: watchRequest.id, subscriptionId: 'sub-1' },
        })
        socket.receive({
            event: 'agentRun',
            payload: {
                event: { content: 'started', conversation: { id: 'run-1' }, runId: 'run-1', type: 'started' },
                requestId: agentStartRequest.id,
            },
        })
        socket.receive({ id: agentStartRequest.id, result: { conversation: { id: 'run-1' }, reference: 'log.json', runId: 'run-1' } })

        await expect(agentRequest).resolves.toEqual({ conversation: { id: 'run-1' }, reference: 'log.json', runId: 'run-1' })
        expect(watchCallback).toHaveBeenCalledWith({ changeKind: 'changed', path: 'design/F-1.md' })
        expect(agentCallback).toHaveBeenCalledWith({ content: 'started', conversation: { id: 'run-1' }, runId: 'run-1', type: 'started' })
    })

    it('fails pending requests clearly when the socket closes', async () => {
        installWebSocket()
        const service = createService()
        const request = service.runCommand(commandRequest())
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        socket.close()

        await expect(request).rejects.toThrow('Remote-control connection closed')
    })

    it('sends the token as WebSocket protocol instead of a query parameter', async () => {
        installWebSocket()
        const service = createService()
        const request = service.runCommand(commandRequest())
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string }
        socket.receive({ id: sentRequest.id, result: { command: 'npm test', exitCode: 0, stderr: '', stdout: 'ok' } })

        await expect(request).resolves.toEqual({ command: 'npm test', exitCode: 0, stderr: '', stdout: 'ok' })
        expect(socket.url).toBe('ws://127.0.0.1:1234')
        expect(socket.protocol).toBe('token-1')
    })
})
