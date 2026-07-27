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

    it('proxies linked worktree mutations', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const addition = service.addWorktree(project)
        const preparationRequest = { branchName: 'card-title', project, worktree: 1 }
        const operationRequest = { project, worktree: 1 }
        const commitRequest = { ...operationRequest, message: 'F-1: Card' }
        const commit = service.commitWorktree(commitRequest)
        const discard = service.discardWorktreeChanges(operationRequest)
        const integration = service.integrateWorktree(operationRequest)
        const parking = service.parkWorktree(operationRequest)
        const preparation = service.prepareWorktree(preparationRequest)
        const pull = service.pullWorktree(operationRequest)
        const push = service.pushWorktree(operationRequest)
        const refresh = service.refreshWorktrees(project)
        const removal = service.removeWorktree(project, 'C:/feature')
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const addRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        const commitSentRequest = JSON.parse(socket.sent[1]) as { id: string, method: string, params: unknown[] }
        const discardRequest = JSON.parse(socket.sent[2]) as { id: string, method: string, params: unknown[] }
        const integrateRequest = JSON.parse(socket.sent[3]) as { id: string, method: string, params: unknown[] }
        const parkRequest = JSON.parse(socket.sent[4]) as { id: string, method: string, params: unknown[] }
        const prepareRequest = JSON.parse(socket.sent[5]) as { id: string, method: string, params: unknown[] }
        const pullRequest = JSON.parse(socket.sent[6]) as { id: string, method: string, params: unknown[] }
        const pushRequest = JSON.parse(socket.sent[7]) as { id: string, method: string, params: unknown[] }
        const refreshRequest = JSON.parse(socket.sent[8]) as { id: string, method: string, params: unknown[] }
        const removeRequest = JSON.parse(socket.sent[9]) as { id: string, method: string, params: unknown[] }
        expect(addRequest).toMatchObject({ method: 'addWorktree', params: [project] })
        expect(commitSentRequest).toMatchObject({ method: 'commitWorktree', params: [commitRequest] })
        expect(discardRequest).toMatchObject({ method: 'discardWorktreeChanges', params: [operationRequest] })
        expect(integrateRequest).toMatchObject({ method: 'integrateWorktree', params: [operationRequest] })
        expect(parkRequest).toMatchObject({ method: 'parkWorktree', params: [operationRequest] })
        expect(prepareRequest).toMatchObject({ method: 'prepareWorktree', params: [preparationRequest] })
        expect(pullRequest).toMatchObject({ method: 'pullWorktree', params: [operationRequest] })
        expect(pushRequest).toMatchObject({ method: 'pushWorktree', params: [operationRequest] })
        expect(refreshRequest).toMatchObject({ method: 'refreshWorktrees', params: [project] })
        expect(removeRequest).toMatchObject({ method: 'removeWorktree', params: [project, 'C:/feature'] })
        for (const request of [
            addRequest, commitSentRequest, discardRequest, integrateRequest, parkRequest, prepareRequest,
            pullRequest, pushRequest, refreshRequest, removeRequest,
        ]) socket.receive({ id: request.id, result: request === addRequest })

        await expect(addition).resolves.toBe(true)
        await expect(commit).resolves.toBeUndefined()
        await expect(discard).resolves.toBeUndefined()
        await expect(integration).resolves.toBeUndefined()
        await expect(parking).resolves.toBeUndefined()
        await expect(preparation).resolves.toBeUndefined()
        await expect(pull).resolves.toBeUndefined()
        await expect(push).resolves.toBeUndefined()
        await expect(refresh).resolves.toBeUndefined()
        await expect(removal).resolves.toBeUndefined()
    })

    it('proxies primary pull', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const pull = service.pull(project)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const request = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(request).toMatchObject({ method: 'pull', params: [project] })
        socket.receive({ id: request.id, result: null })

        await expect(pull).resolves.toBeUndefined()
    })

    it('delivers initial and later pushed worktree state and unsubscribes', async () => {
        installWebSocket()
        const service = createService()
        const callback = vi.fn()
        const unsubscribe = service.onWorktreesChanged(callback)
        const socket = lastSocket()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const state = { error: null, primaryStatus: null, project, records: [] }

        socket.open()
        await flushPromises()
        const request = JSON.parse(socket.sent[0]) as { id: string, method: string }
        expect(request.method).toBe('onWorktreesChanged')
        socket.receive({ event: 'worktreesChanged', payload: { requestId: request.id, state, subscriptionId: 'worktrees-1' } })
        socket.receive({ id: request.id, result: { subscriptionId: 'worktrees-1' } })
        await flushPromises()
        socket.receive({ event: 'worktreesChanged', payload: { requestId: request.id, state, subscriptionId: 'worktrees-1' } })

        expect(callback).toHaveBeenCalledTimes(2)
        unsubscribe()
        await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
        const unsubscribeRequest = JSON.parse(socket.sent[1]) as { method: string, params: unknown[] }
        expect(unsubscribeRequest).toEqual(expect.objectContaining({ method: 'unsubscribe', params: ['worktrees-1'] }))
    })

    it('unsubscribes when cleanup runs before subscription setup completes', async () => {
        installWebSocket()
        const service = createService()
        const callback = vi.fn()
        const unsubscribe = service.onWorktreesChanged(callback)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const request = JSON.parse(socket.sent[0]) as { id: string }
        unsubscribe()
        socket.receive({ id: request.id, result: { subscriptionId: 'worktrees-1' } })
        await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
        const unsubscribeRequest = JSON.parse(socket.sent[1]) as { method: string, params: unknown[] }

        expect(unsubscribeRequest).toEqual(expect.objectContaining({ method: 'unsubscribe', params: ['worktrees-1'] }))
        socket.receive({
            event: 'worktreesChanged',
            payload: {
                requestId: request.id,
                state: { error: null, primaryStatus: null, project: null, records: [] },
                subscriptionId: 'worktrees-1',
            },
        })
        expect(callback).not.toHaveBeenCalled()
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

    it('lists agent conversation references through remote control', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const references = service.listAgentConversationReferences(project, 'design')
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(sentRequest).toMatchObject({ method: 'listAgentConversationReferences', params: [project, 'design'] })
        socket.receive({ id: sentRequest.id, result: ['design/activity/project.json#conversation=conversation-1'] })

        await expect(references).resolves.toEqual(['design/activity/project.json#conversation=conversation-1'])
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

    it('routes streaming interaction methods through remote control', async () => {
        installWebSocket()
        const service = createService()
        const firstOperation = service.sendActionMessage('action-1', 'approved')
        await flushPromises()
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const operations = [
            firstOperation,
            service.setActionQueuedMessage('action-1', 'next', 3),
            service.sendActionQueuedMessage('action-1', 3),
            service.answerActionQuestion('action-1', 7, { confirm: ['Yes'] }),
            service.finishActionExecution('action-1'),
            service.notifyActionCardStateChange('card-1', 'ready'),
        ]
        await flushPromises()
        const requests = socket.sent.map((entry) => JSON.parse(entry) as { id: string, method: string, params: unknown[] })
        expect(requests.map(({ method, params }) => ({ method, params }))).toEqual([
            { method: 'sendActionMessage', params: ['action-1', 'approved'] },
            { method: 'setActionQueuedMessage', params: ['action-1', 'next', 3] },
            { method: 'sendActionQueuedMessage', params: ['action-1', 3] },
            { method: 'answerActionQuestion', params: ['action-1', 7, { confirm: ['Yes'] }] },
            { method: 'finishActionExecution', params: ['action-1'] },
            { method: 'notifyActionCardStateChange', params: ['card-1', 'ready'] },
        ])
        requests.forEach(({ id }) => socket.receive({ id, result: null }))

        await Promise.all(operations)
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
