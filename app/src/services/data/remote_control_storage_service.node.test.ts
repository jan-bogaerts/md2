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

    it('loads one markdown file through remote control and propagates desktop errors', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const firstLoad = service.loadFile(project, 'design/F-1.md')
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const firstRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(firstRequest).toMatchObject({ method: 'loadFile', params: [project, 'design/F-1.md'] })
        socket.receive({ id: firstRequest.id, result: { content: '# Changed', path: 'design/F-1.md' } })
        await expect(firstLoad).resolves.toEqual({ content: '# Changed', path: 'design/F-1.md' })

        const missingLoad = service.loadFile(project, 'design/missing.md')
        await flushPromises()
        const secondRequest = JSON.parse(socket.sent[1]) as { id: string }
        socket.receive({ error: { message: 'File not found: design/missing.md' }, id: secondRequest.id })

        await expect(missingLoad).rejects.toThrow('File not found: design/missing.md')
    })

    it('receives account-wide Codex runtime snapshots through dedicated remote subscription', async () => {
        installWebSocket()
        const service = createService()
        const callback = vi.fn()
        service.onCodexRateLimits(callback)
        const socket = lastSocket()
        const snapshot = { available: true, buckets: [], observedAt: 10, rateLimitResetCredits: null }

        socket.open()
        await flushPromises()
        const subscriptionRequest = JSON.parse(socket.sent[0]) as { id: string, method: string }
        expect(subscriptionRequest.method).toBe('onCodexRateLimits')
        socket.receive({
            event: 'codexRateLimits',
            payload: { requestId: subscriptionRequest.id, snapshot, subscriptionId: 'codex-rate-limits-1' },
        })
        socket.receive({ id: subscriptionRequest.id, result: { subscriptionId: 'codex-rate-limits-1' } })
        await flushPromises()

        expect(callback).toHaveBeenCalledWith(snapshot)
    })

    it('proxies linked worktree mutations', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const addition = service.addWorktree(project)
        const preparationRequest = { branchName: 'card-title', project, worktree: 1 }
        const operationRequest = { project, worktree: 1 }
        const integrationRequest = { ...operationRequest, cardInternalId: 'stable-card-id', projectFolder: 'design' }
        const commitRequest = { ...operationRequest, message: 'F-1: Card' }
        const commit = service.commitWorktree(commitRequest)
        const discard = service.discardWorktreeChanges(operationRequest)
        const integration = service.integrateWorktree(integrationRequest)
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
        expect(integrateRequest).toMatchObject({ method: 'integrateWorktree', params: [integrationRequest] })
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
        socket.receive({ id: activityMessage.id, result: { conversations: [], origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 2 } })
        socket.receive({ id: fileMessage.id, result: { content: '# Card', exists: true } })

        await expect(activity).resolves.toMatchObject({ version: 2 })
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

    it('preserves access and approval overrides in remote action requests', async () => {
        installWebSocket()
        const service = createService()
        const actionRequest = {
            ...actionStartRequest(),
            runInput: { accessLevel: 'read-only', approvalPolicy: 'untrusted' },
        }
        const request = service.startAction(actionRequest)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(sentRequest).toMatchObject({ method: 'startAction', params: [actionRequest] })
        socket.receive({ id: sentRequest.id, result: 'run-1' })

        await expect(request).resolves.toBe('run-1')
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
            service.beginActionPromptDraft('action-1'),
            service.setActionQueuedMessage('action-1', 2, 'next', 3),
            service.sendActionQueuedMessage('action-1', 2, 3),
            service.answerActionApproval('action-1', 41, 'accept'),
            service.answerActionQuestion('action-1', 7, { confirm: ['Yes'] }),
            service.closeWaitingActionConversation('activity.json#conversation=one', 'completed'),
            service.updateActionConversationViewed('activity.json#conversation=one', false),
            service.finishActionRun('action-1'),
            service.restartActionRun('action-1', { actionId: 'review', context: { kind: 'project' }, runInput: {} }),
            service.notifyActionCardStateChange('card-1', 'ready'),
        ]
        await flushPromises()
        const requests = socket.sent.map((entry) => JSON.parse(entry) as { id: string, method: string, params: unknown[] })
        expect(requests.map(({ method, params }) => ({ method, params }))).toEqual([
            { method: 'sendActionMessage', params: ['action-1', 'approved'] },
            { method: 'beginActionPromptDraft', params: ['action-1'] },
            { method: 'setActionQueuedMessage', params: ['action-1', 2, 'next', 3] },
            { method: 'sendActionQueuedMessage', params: ['action-1', 2, 3] },
            { method: 'answerActionApproval', params: ['action-1', 41, 'accept'] },
            { method: 'answerActionQuestion', params: ['action-1', 7, { confirm: ['Yes'] }] },
            { method: 'closeWaitingActionConversation', params: ['activity.json#conversation=one', 'completed'] },
            { method: 'updateActionConversationViewed', params: ['activity.json#conversation=one', false] },
            { method: 'finishActionRun', params: ['action-1'] },
            { method: 'restartActionRun', params: ['action-1', { actionId: 'review', context: { kind: 'project' }, runInput: {} }] },
            { method: 'notifyActionCardStateChange', params: ['card-1', 'ready'] },
        ])
        requests.forEach(({ id, method }) => {
            const result = method === 'beginActionPromptDraft'
                ? 2
                : method === 'setActionQueuedMessage'
                    ? { accepted: true }
                    : method === 'sendActionQueuedMessage'
                        ? { sent: true }
                        : null
            socket.receive({ id, result })
        })

        await Promise.all(operations)
    })

    it('reattaches action run events and reloads active state after reconnect', async () => {
        installWebSocket()
        const service = createService()
        const callback = vi.fn()
        service.onActionRun(callback)
        const firstSocket = lastSocket()
        firstSocket.open()
        await flushPromises()
        const firstSubscription = JSON.parse(firstSocket.sent[0]) as { id: string }
        firstSocket.receive({ id: firstSubscription.id, result: { subscriptionId: 'action-events-1' } })
        await flushPromises()
        firstSocket.close()

        const reconnection = service.connect()
        const secondSocket = lastSocket()
        secondSocket.open()
        await reconnection
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(1))
        const secondSubscription = JSON.parse(secondSocket.sent[0]) as { id: string, method: string }
        expect(secondSubscription.method).toBe('onActionRun')
        secondSocket.receive({ id: secondSubscription.id, result: { subscriptionId: 'action-events-2' } })
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(2))
        const snapshotRequest = JSON.parse(secondSocket.sent[1]) as { id: string, method: string }
        expect(snapshotRequest.method).toBe('loadActiveActionRunEvents')
        const event = {
            actionId: 'review',
            context: { file: 'design/F-1.md', kind: 'card' },
            runId: 'run-1',
            phase: 'main',
            rootActionId: 'review',
            sequence: 1,
            status: 'running',
            type: 'run',
        }
        secondSocket.receive({ id: snapshotRequest.id, result: [event] })

        await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(event))
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

    it('routes every server-push message and cleans persistent subscriptions', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const watchCallback = vi.fn()
        const agentCallback = vi.fn()
        const actionCallback = vi.fn()
        const rateLimitCallback = vi.fn()
        const worktreeCallback = vi.fn()
        const stopWatch = service.watchProject(project, watchCallback)
        const stopAction = service.onActionRun(actionCallback)
        const stopRateLimits = service.onCodexRateLimits(rateLimitCallback)
        const stopWorktrees = service.onWorktreesChanged(worktreeCallback)
        const agentRun = service.runSearchRegexpAgent('find cards', agentCallback)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const requests = socket.sent.map((message) => JSON.parse(message) as { id: string, method: string })
        const requestByMethod = new Map(requests.map((request) => [request.method, request]))
        const actionEvent = { runId: 'action-1', sequence: 1, status: 'running', type: 'run' }
        const agentEvent = { content: 'working', runId: 'agent-1', type: 'output' }
        const snapshot = { available: true, buckets: [], observedAt: 10, rateLimitResetCredits: null }
        const worktreeState = { error: null, primaryStatus: null, project, records: [] }
        const subscriptions = [
            ['watchProject', 'watch-1'],
            ['onActionRun', 'action-1'],
            ['onCodexRateLimits', 'limits-1'],
            ['onWorktreesChanged', 'worktrees-1'],
        ] as const

        socket.receive({
            event: 'watchProject',
            payload: { event: { changeKind: 'changed', path: 'design/F-1.md' }, requestId: requestByMethod.get('watchProject')?.id, subscriptionId: 'watch-1' },
        })
        socket.receive({ event: 'agentRun', payload: { event: agentEvent, requestId: requestByMethod.get('runSearchRegexpAgent')?.id } })
        socket.receive({
            event: 'actionRun',
            payload: { event: actionEvent, requestId: requestByMethod.get('onActionRun')?.id, subscriptionId: 'action-1' },
        })
        socket.receive({
            event: 'codexRateLimits',
            payload: { requestId: requestByMethod.get('onCodexRateLimits')?.id, snapshot, subscriptionId: 'limits-1' },
        })
        socket.receive({
            event: 'worktreesChanged',
            payload: { requestId: requestByMethod.get('onWorktreesChanged')?.id, state: worktreeState, subscriptionId: 'worktrees-1' },
        })
        for (const [method, subscriptionId] of subscriptions) {
            const request = requestByMethod.get(method)
            if (!request) throw new Error(`Missing ${method} request`)
            socket.receive({ id: request.id, result: { subscriptionId } })
        }
        const agentRequest = requestByMethod.get('runSearchRegexpAgent')
        if (!agentRequest) throw new Error('Missing runSearchRegexpAgent request')
        socket.receive({ id: agentRequest.id, result: 'agent-1' })
        await expect(agentRun).resolves.toBe('agent-1')

        expect(watchCallback).toHaveBeenCalledWith({ changeKind: 'changed', path: 'design/F-1.md' })
        expect(agentCallback).toHaveBeenCalledWith(agentEvent)
        expect(actionCallback).toHaveBeenCalledWith(actionEvent)
        expect(rateLimitCallback).toHaveBeenCalledWith(snapshot)
        expect(worktreeCallback).toHaveBeenCalledWith(worktreeState)

        stopWatch()
        stopAction()
        stopRateLimits()
        stopWorktrees()
        await vi.waitFor(() => expect(socket.sent).toHaveLength(requests.length + subscriptions.length))
        const unsubscribeIds = socket.sent.slice(requests.length).map((message) => {
            const request = JSON.parse(message) as { method: string, params: string[] }
            expect(request.method).toBe('unsubscribe')

            return request.params[0]
        })
        expect(unsubscribeIds).toEqual(expect.arrayContaining(subscriptions.map(([, subscriptionId]) => subscriptionId)))
    })

    it('unsubscribes a project watcher stopped before setup completes', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const callback = vi.fn()
        const stop = service.watchProject(project, callback)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const watchRequest = JSON.parse(socket.sent[0]) as { id: string }
        stop()
        socket.receive({ id: watchRequest.id, result: { subscriptionId: 'watch-1' } })
        await vi.waitFor(() => expect(socket.sent).toHaveLength(2))
        expect(JSON.parse(socket.sent[1])).toEqual(expect.objectContaining({ method: 'unsubscribe', params: ['watch-1'] }))
        socket.receive({
            event: 'watchProject',
            payload: { event: { changeKind: 'changed', path: 'design/F-1.md' }, requestId: watchRequest.id, subscriptionId: 'watch-1' },
        })

        expect(callback).not.toHaveBeenCalled()
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
