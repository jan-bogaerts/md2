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

function actionStartRequest() {
    return { actionId: 'action-test', context: { file: 'design/F-1.md', kind: 'card' as const }, runInput: {} }
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

    it('prepares action prompts through remote control', async () => {
        installWebSocket()
        const service = createService()
        const request = { actionId: 'action-test', context: { file: 'design/F-1.md', kind: 'card' as const } }
        const preparation = service.prepareActionPrompt(request)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(sentRequest).toMatchObject({ method: 'prepareActionPrompt', params: [request] })
        socket.receive({ id: sentRequest.id, result: { prompt: 'Prepared prompt' } })

        await expect(preparation).resolves.toEqual({ prompt: 'Prepared prompt' })
    })

    it('proxies card activity and historical file requests', async () => {
        installWebSocket()
        const service = createService()
        const activityRequest = { cardInternalId: 'card-1' }
        const fileRequest = { commit: 'a'.repeat(40), parent: true, path: 'design/F-1.md' }
        const activity = service.loadCardActivity(activityRequest)
        const historicalFile = service.readFileAtCommit(fileRequest)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const activityMessage = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        const fileMessage = JSON.parse(socket.sent[1]) as { id: string, method: string, params: unknown[] }
        expect(activityMessage).toMatchObject({ method: 'loadCardActivity', params: [activityRequest] })
        expect(fileMessage).toMatchObject({ method: 'readFileAtCommit', params: [fileRequest] })
        socket.receive({ id: activityMessage.id, result: { conversations: [], origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 1 } })
        socket.receive({ id: fileMessage.id, result: { content: '# Card', exists: true } })

        await expect(activity).resolves.toMatchObject({ version: 1 })
        await expect(historicalFile).resolves.toEqual({ content: '# Card', exists: true })
    })

    it('rejects error responses', async () => {
        installWebSocket()
        const service = createService()
        const request = service.startAction(actionStartRequest())
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string }
        socket.receive({ error: { message: 'command failed' }, id: sentRequest.id })

        await expect(request).rejects.toThrow('command failed')
    })

    it('sends recursive folder deletion requests', async () => {
        installWebSocket()
        const service = createService()
        const deleteRequest = { branch: 'main', message: 'Delete design/notes', path: 'design/notes' }
        const deletion = service.deleteFolder(deleteRequest)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(sentRequest).toMatchObject({ method: 'deleteFolder', params: [deleteRequest] })
        socket.receive({ id: sentRequest.id, result: null })

        await expect(deletion).resolves.toBeUndefined()
    })

    it('delivers watch push events', async () => {
        installWebSocket()
        const service = createService()
        const watchCallback = vi.fn()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        service.watchProject(project, watchCallback)
        const socket = lastSocket()
        socket.open()
        await flushPromises()
        const watchRequest = JSON.parse(socket.sent[0]) as { id: string }
        socket.receive({ id: watchRequest.id, result: { subscriptionId: 'sub-1' } })
        socket.receive({
            event: 'watchProject',
            payload: { event: { changeKind: 'changed', path: 'design/F-1.md' }, requestId: watchRequest.id, subscriptionId: 'sub-1' },
        })
        expect(watchCallback).toHaveBeenCalledWith({ changeKind: 'changed', path: 'design/F-1.md' })
    })

    it('fails pending requests clearly when the socket closes', async () => {
        installWebSocket()
        const service = createService()
        const request = service.startAction(actionStartRequest())
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        socket.close()

        await expect(request).rejects.toThrow('Remote-control connection closed')
    })

    it('connects and disconnects without a request', async () => {
        installWebSocket()
        const service = createService()
        const connection = service.connect()
        const socket = lastSocket()

        socket.open()
        await expect(connection).resolves.toBeUndefined()
        expect(socket.url).toBe('ws://127.0.0.1:1234')

        service.disconnect()
        expect(socket.readyState).toBe(3)
    })

    it('rejects connect when the socket errors before opening', async () => {
        installWebSocket()
        const service = createService()
        const connection = service.connect()
        const socket = lastSocket()

        socket.dispatchEvent(new Event('error'))

        await expect(connection).rejects.toThrow('Remote-control connection failed')
    })

    it('sends the token as WebSocket protocol instead of a query parameter', async () => {
        installWebSocket()
        const service = createService()
        const request = service.startAction(actionStartRequest())
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string }
        socket.receive({ id: sentRequest.id, result: 'action-1' })

        await expect(request).resolves.toBe('action-1')
        expect(socket.url).toBe('ws://127.0.0.1:1234')
        expect(socket.protocol).toBe('token-1')
    })
})
