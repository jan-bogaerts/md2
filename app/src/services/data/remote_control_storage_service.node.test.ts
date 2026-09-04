import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteControlStorageService } from './remote_control_storage_service'
import { MissingWorkingFolderError } from '../../data/data_types'

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
    service.init({ endpoint: 'ws://127.0.0.1:1234' })

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

interface PersistentSubscriptionCase {
    method: string
    name: string
    subscribe(service: RemoteControlStorageService): () => void
}

const persistentSubscriptionCases: PersistentSubscriptionCase[] = [
    {
        method: 'onMergeConflictSessionChanged',
        name: 'merge-conflict',
        subscribe: (service) => service.onMergeConflictSessionChanged(() => undefined),
    },
    { method: 'onActionRun', name: 'action-run', subscribe: (service) => service.onActionRun(() => undefined) },
    { method: 'onClaudeRateLimits', name: 'Claude-rate-limit', subscribe: (service) => service.onClaudeRateLimits(() => undefined) },
    { method: 'onCodexRateLimits', name: 'Codex-rate-limit', subscribe: (service) => service.onCodexRateLimits(() => undefined) },
    {
        method: 'watchProject',
        name: 'project-watch',
        subscribe: (service) => service.watchProject(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            () => undefined,
            () => undefined,
            () => undefined,
        ),
    },
    { method: 'onWorktreesChanged', name: 'worktree', subscribe: (service) => service.onWorktreesChanged(() => undefined) },
]

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

    it('forwards project root exclusion to the remote host', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const result = service.loadProject(project, 'design', 'design/active')
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const request = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }

        expect(request).toMatchObject({ method: 'loadProject', params: [project, 'design', 'design/active'] })
        socket.receive({ id: request.id, result: { files: [], workingFolder: 'design' } })
        await expect(result).resolves.toEqual({ files: [], workingFolder: 'design' })
    })

    it('forwards a move whose source may already be absent for host-side recovery', async () => {
        installWebSocket()
        const service = createService()
        const commitRequest = {
            branch: 'main',
            files: [],
            message: 'Rename action',
            moves: [{
                content: '{"id":"review"}',
                fromPath: 'actions/new-action.json',
                toPath: 'actions/review.json',
            }],
        }
        const result = service.commit(commitRequest)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const request = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(request).toMatchObject({ method: 'commit', params: [commitRequest] })
        socket.receive({ id: request.id, result: [] })
        await expect(result).resolves.toEqual([])
    })

    it.each(persistentSubscriptionCases)('cleans retired $name subscriptions locally without reconnecting', async ({ method, subscribe }) => {
        installWebSocket()
        const service = createService()
        const cleanup = subscribe(service)
        const socket = lastSocket()
        const unhandledRejections: unknown[] = []
        const handleUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason)

        process.on('unhandledRejection', handleUnhandledRejection)
        try {
            socket.open()
            await flushPromises()
            const subscriptionRequest = JSON.parse(socket.sent[0]) as { id: string, method: string }
            expect(subscriptionRequest.method).toBe(method)
            socket.receive({ id: subscriptionRequest.id, result: { subscriptionId: `${method}-1` } })
            await flushPromises()
            service.retire()

            cleanup()
            cleanup()
            await new Promise((resolve) => setTimeout(resolve, 0))

            expect(socket.sent).toHaveLength(1)
            expect(MockWebSocket.instances).toHaveLength(1)
            expect(unhandledRejections).toEqual([])
        } finally {
            process.off('unhandledRejection', handleUnhandledRejection)
        }
    })

    it.each(persistentSubscriptionCases)('sends one unsubscribe for repeated active $name cleanup', async ({ method, subscribe }) => {
        installWebSocket()
        const service = createService()
        const cleanup = subscribe(service)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const subscriptionRequest = JSON.parse(socket.sent[0]) as { id: string, method: string }
        expect(subscriptionRequest.method).toBe(method)
        socket.receive({ id: subscriptionRequest.id, result: { subscriptionId: `${method}-1` } })
        await flushPromises()

        cleanup()
        cleanup()

        expect(socket.sent).toHaveLength(2)
        expect(JSON.parse(socket.sent[1])).toEqual(expect.objectContaining({
            method: 'unsubscribe',
            params: [`${method}-1`],
        }))
    })

    it.each(persistentSubscriptionCases)('unsubscribes one active $name response received after cancellation', async ({ method, subscribe }) => {
        installWebSocket()
        const service = createService()
        const cleanup = subscribe(service)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const subscriptionRequest = JSON.parse(socket.sent[0]) as { id: string, method: string }
        expect(subscriptionRequest.method).toBe(method)
        cleanup()
        cleanup()
        socket.receive({ id: subscriptionRequest.id, result: { subscriptionId: `${method}-1` } })
        await vi.waitFor(() => expect(socket.sent).toHaveLength(2))

        expect(JSON.parse(socket.sent[1])).toEqual(expect.objectContaining({
            method: 'unsubscribe',
            params: [`${method}-1`],
        }))
    })

    it('keeps normal requests through retired storage rejected without creating a socket', async () => {
        installWebSocket()
        const service = createService()
        service.retire()

        await expect(service.getActiveProject()).rejects.toThrow('Remote-control connection was replaced')
        expect(MockWebSocket.instances).toEqual([])
    })

    it('loads and saves complete host desktop config through remote control', async () => {
        installWebSocket()
        const service = createService()
        const desktopConfig = {
            agentSelection: { activeAgent: 'custom', permissionMode: 'full-access' as const, settingsByAgent: { custom: { model: 'custom-model', thinkingLevel: 'high' as const } } },
            agentProfiles: [{ command: ['custom'], defaultThinkingLevel: 'none' as const, models: ['custom-model'], name: 'custom' }],
            codexSearchEnabled: false,
            editorCommand: 'code "{{file}}"',
            mergeConflictResolverCommand: '',
            remoteControlPort: 20877,
        }
        const load = service.loadDesktopConfig()
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const loadRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(loadRequest).toMatchObject({ method: 'loadDesktopConfig', params: [] })
        socket.receive({ id: loadRequest.id, result: desktopConfig })
        await expect(load).resolves.toEqual(desktopConfig)

        const save = service.saveDesktopConfig(desktopConfig)
        await flushPromises()
        const saveRequest = JSON.parse(socket.sent[1]) as { id: string, method: string, params: unknown[] }
        expect(saveRequest).toMatchObject({ method: 'saveDesktopConfig', params: [desktopConfig] })
        socket.receive({ id: saveRequest.id, result: desktopConfig })
        await expect(save).resolves.toEqual(desktopConfig)
    })

    it('reads current Claude rate limits through remote control', async () => {
        installWebSocket()
        const service = createService()
        const load = service.getClaudeRateLimits()
        const socket = lastSocket()
        const snapshot = { available: true, observedAt: 10, windows: [] }

        socket.open()
        await flushPromises()
        const request = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(request).toMatchObject({ method: 'getClaudeRateLimits', params: [] })
        socket.receive({ id: request.id, result: snapshot })

        await expect(load).resolves.toEqual(snapshot)
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

    it('loads a repository text file through remote control', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const path = 'design/activity/card__card-1.json'
        const load = service.loadTextFile(project, path)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const request = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(request).toMatchObject({ method: 'loadTextFile', params: [project, path] })
        socket.receive({ id: request.id, result: { content: '{"version":2}', path } })

        await expect(load).resolves.toEqual({ content: '{"version":2}', path })
    })

    it('loads current worktree diff through remote control', async () => {
        installWebSocket()
        const service = createService()
        const load = service.generateWorktreeDiff({ worktree: 2 })
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const request = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(request).toMatchObject({ method: 'generateWorktreeDiff', params: [{ worktree: 2 }] })
        socket.receive({ id: request.id, result: { files: [], repositoryRoot: 'C:/worktree' } })

        await expect(load).resolves.toEqual({ files: [], repositoryRoot: 'C:/worktree' })
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

    it('receives account-wide Claude runtime snapshots through dedicated remote subscription', async () => {
        installWebSocket()
        const service = createService()
        const callback = vi.fn()
        service.onClaudeRateLimits(callback)
        const socket = lastSocket()
        const snapshot = { available: true, observedAt: 10, windows: [] }

        socket.open()
        await flushPromises()
        const subscriptionRequest = JSON.parse(socket.sent[0]) as { id: string, method: string }
        expect(subscriptionRequest.method).toBe('onClaudeRateLimits')
        socket.receive({
            event: 'claudeRateLimits',
            payload: { requestId: subscriptionRequest.id, snapshot, subscriptionId: 'claude-rate-limits-1' },
        })
        socket.receive({ id: subscriptionRequest.id, result: { subscriptionId: 'claude-rate-limits-1' } })
        await flushPromises()

        expect(callback).toHaveBeenCalledWith(snapshot)
    })

    it('proxies linked worktree mutations', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const selection = service.selectWorktreeFolder()
        const addition = service.addWorktree(project, 'C:/feature')
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
        const removal = service.removeWorktree(project, 'C:/feature', 'files')
        const deletion = service.deleteLocalBranch(project, 'feature')
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const selectionRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        const addRequest = JSON.parse(socket.sent[1]) as { id: string, method: string, params: unknown[] }
        const commitSentRequest = JSON.parse(socket.sent[2]) as { id: string, method: string, params: unknown[] }
        const discardRequest = JSON.parse(socket.sent[3]) as { id: string, method: string, params: unknown[] }
        const integrateRequest = JSON.parse(socket.sent[4]) as { id: string, method: string, params: unknown[] }
        const parkRequest = JSON.parse(socket.sent[5]) as { id: string, method: string, params: unknown[] }
        const prepareRequest = JSON.parse(socket.sent[6]) as { id: string, method: string, params: unknown[] }
        const pullRequest = JSON.parse(socket.sent[7]) as { id: string, method: string, params: unknown[] }
        const pushRequest = JSON.parse(socket.sent[8]) as { id: string, method: string, params: unknown[] }
        const refreshRequest = JSON.parse(socket.sent[9]) as { id: string, method: string, params: unknown[] }
        const removeRequest = JSON.parse(socket.sent[10]) as { id: string, method: string, params: unknown[] }
        const deleteRequest = JSON.parse(socket.sent[11]) as { id: string, method: string, params: unknown[] }
        expect(selectionRequest).toMatchObject({ method: 'selectWorktreeFolder', params: [] })
        expect(addRequest).toMatchObject({ method: 'addWorktree', params: [project, 'C:/feature'] })
        expect(commitSentRequest).toMatchObject({ method: 'commitWorktree', params: [commitRequest] })
        expect(discardRequest).toMatchObject({ method: 'discardWorktreeChanges', params: [operationRequest] })
        expect(integrateRequest).toMatchObject({ method: 'integrateWorktree', params: [integrationRequest] })
        expect(parkRequest).toMatchObject({ method: 'parkWorktree', params: [operationRequest] })
        expect(prepareRequest).toMatchObject({ method: 'prepareWorktree', params: [preparationRequest] })
        expect(pullRequest).toMatchObject({ method: 'pullWorktree', params: [operationRequest] })
        expect(pushRequest).toMatchObject({ method: 'pushWorktree', params: [operationRequest] })
        expect(refreshRequest).toMatchObject({ method: 'refreshWorktrees', params: [project] })
        expect(removeRequest).toMatchObject({ method: 'removeWorktree', params: [project, 'C:/feature', 'files'] })
        expect(deleteRequest).toMatchObject({ method: 'deleteLocalBranch', params: [project, 'feature'] })
        for (const request of [
            selectionRequest, addRequest, commitSentRequest, discardRequest, integrateRequest, parkRequest, prepareRequest,
            pullRequest, pushRequest, refreshRequest, removeRequest, deleteRequest,
        ]) {
            const result = request === selectionRequest
                ? 'C:/feature'
                : request === integrateRequest ? { status: 'completed' } : undefined
            socket.receive({ id: request.id, result })
        }
        await expect(selection).resolves.toBe('C:/feature')

        await expect(addition).resolves.toBeUndefined()
        await expect(commit).resolves.toBeUndefined()
        await expect(discard).resolves.toBeUndefined()
        await expect(integration).resolves.toEqual({ status: 'completed' })
        await expect(parking).resolves.toBeUndefined()
        await expect(preparation).resolves.toBeUndefined()
        await expect(pull).resolves.toBeUndefined()
        await expect(push).resolves.toBeUndefined()
        await expect(refresh).resolves.toBeUndefined()
        await expect(removal).resolves.toBeUndefined()
        await expect(deletion).resolves.toBeUndefined()
    })

    it('proxies merge conflict lifecycle and session events', async () => {
        installWebSocket()
        const service = createService()
        const session = {
            conflictedPaths: ['src/file.ts'], externalResolverConfigured: true, id: 'session-1',
            operation: 'rebase' as const, phase: 'rebase' as const, repositoryRoot: 'C:/repo', worktree: 1,
        }
        const callback = vi.fn()
        service.onMergeConflictSessionChanged(callback)
        const socket = lastSocket()
        socket.open()
        await flushPromises()
        const subscriptionRequest = JSON.parse(socket.sent[0]) as { id: string, method: string }
        expect(subscriptionRequest.method).toBe('onMergeConflictSessionChanged')
        socket.receive({ event: 'mergeConflictSessionChanged', payload: { requestId: subscriptionRequest.id, session, subscriptionId: 'conflict-1' } })
        socket.receive({ id: subscriptionRequest.id, result: { subscriptionId: 'conflict-1' } })
        await flushPromises()
        expect(callback).toHaveBeenCalledWith(session)

        const loaded = service.getMergeConflictSession()
        await flushPromises()
        const loadRequest = JSON.parse(socket.sent[1]) as { id: string, method: string }
        expect(loadRequest.method).toBe('getMergeConflictSession')
        socket.receive({ id: loadRequest.id, result: session })
        await expect(loaded).resolves.toEqual(session)

        const pathRequest = { path: 'src/file.ts', sessionId: 'session-1' }
        const launch = service.launchMergeConflictResolver(pathRequest)
        await flushPromises()
        const launchRequest = JSON.parse(socket.sent[2]) as { id: string, method: string, params: unknown[] }
        expect(launchRequest).toMatchObject({ method: 'launchMergeConflictResolver', params: [pathRequest] })
        socket.receive({ id: launchRequest.id })
        await expect(launch).resolves.toBeUndefined()
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

    it('restores one worktree subscription and delivers replacement snapshots once after reconnect', async () => {
        installWebSocket()
        const service = createService()
        const callback = vi.fn()
        const unsubscribe = service.onWorktreesChanged(callback)
        const firstSocket = lastSocket()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const dirtyState = {
            error: null,
            primaryStatus: null,
            project,
            records: [{ baseAhead: 0, baseBehind: 1, branch: 'feature', dirty: true, folderPath: 'C:/feature', worktree: 1 }],
        }
        const cleanState = {
            error: null,
            primaryStatus: null,
            project,
            records: [{ baseAhead: 0, baseBehind: 0, branch: 'feature', dirty: false, folderPath: 'C:/feature', worktree: 1 }],
        }

        firstSocket.open()
        await flushPromises()
        const firstRequest = JSON.parse(firstSocket.sent[0]) as { id: string, method: string }
        firstSocket.receive({ id: firstRequest.id, result: { subscriptionId: 'worktrees-1' } })
        await flushPromises()
        firstSocket.close()

        const reconnection = service.connect()
        const secondSocket = lastSocket()
        secondSocket.open()
        await reconnection
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(1))
        const replacementRequest = JSON.parse(secondSocket.sent[0]) as { id: string, method: string }
        expect(replacementRequest.method).toBe('onWorktreesChanged')
        await service.connect()
        await flushPromises()
        expect(secondSocket.sent).toHaveLength(1)

        secondSocket.receive({
            event: 'worktreesChanged',
            payload: { requestId: replacementRequest.id, state: dirtyState, subscriptionId: 'worktrees-2' },
        })
        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenLastCalledWith(dirtyState)
        secondSocket.receive({ id: replacementRequest.id, result: { subscriptionId: 'worktrees-2' } })
        await flushPromises()
        secondSocket.receive({
            event: 'worktreesChanged',
            payload: { requestId: replacementRequest.id, state: cleanState, subscriptionId: 'worktrees-2' },
        })
        expect(callback).toHaveBeenCalledTimes(2)
        expect(callback).toHaveBeenLastCalledWith(cleanState)

        unsubscribe()
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(2))
        expect(JSON.parse(secondSocket.sent[1])).toEqual(expect.objectContaining({ method: 'unsubscribe', params: ['worktrees-2'] }))
        secondSocket.receive({
            event: 'worktreesChanged',
            payload: { requestId: replacementRequest.id, state: dirtyState, subscriptionId: 'worktrees-2' },
        })
        expect(callback).toHaveBeenCalledTimes(2)

        secondSocket.close()
        const finalReconnection = service.connect()
        const thirdSocket = lastSocket()
        thirdSocket.open()
        await finalReconnection
        await flushPromises()
        expect(thirdSocket.sent).toEqual([])
    })

    it('unsubscribes a replacement worktree subscription stopped during setup', async () => {
        installWebSocket()
        const service = createService()
        const callback = vi.fn()
        const unsubscribe = service.onWorktreesChanged(callback)
        const firstSocket = lastSocket()

        firstSocket.open()
        await flushPromises()
        const firstRequest = JSON.parse(firstSocket.sent[0]) as { id: string }
        firstSocket.receive({ id: firstRequest.id, result: { subscriptionId: 'worktrees-1' } })
        await flushPromises()
        firstSocket.close()

        const reconnection = service.connect()
        const secondSocket = lastSocket()
        secondSocket.open()
        await reconnection
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(1))
        const replacementRequest = JSON.parse(secondSocket.sent[0]) as { id: string }
        unsubscribe()
        secondSocket.receive({
            event: 'worktreesChanged',
            payload: {
                requestId: replacementRequest.id,
                state: { error: null, primaryStatus: null, project: null, records: [] },
                subscriptionId: 'worktrees-2',
            },
        })
        secondSocket.receive({ id: replacementRequest.id, result: { subscriptionId: 'worktrees-2' } })
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(2))

        expect(JSON.parse(secondSocket.sent[1])).toEqual(expect.objectContaining({ method: 'unsubscribe', params: ['worktrees-2'] }))
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
        const settingsRequest = {
            actionId: 'review', cardInternalId: 'card-1',
            settings: { activeAgent: 'codex', permissionMode: 'ask-for-approval' as const, settingsByAgent: { codex: { model: 'gpt-5', thinkingLevel: 'high' as const } } },
        }
        const activity = service.loadCardActivity(activityRequest)
        const historicalFile = service.readFileAtCommit(fileRequest)
        const settingsUpdate = service.updateCardActionSettings(settingsRequest)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const activityMessage = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        const fileMessage = JSON.parse(socket.sent[1]) as { id: string, method: string, params: unknown[] }
        const settingsMessage = JSON.parse(socket.sent[2]) as { id: string, method: string, params: unknown[] }
        expect(activityMessage).toMatchObject({ method: 'loadCardActivity', params: [activityRequest] })
        expect(fileMessage).toMatchObject({ method: 'readFileAtCommit', params: [fileRequest] })
        expect(settingsMessage).toMatchObject({ method: 'updateCardActionSettings', params: [settingsRequest] })
        socket.receive({ id: activityMessage.id, result: { actionSettings: {}, conversations: [], origin: { cardInternalId: 'card-1', kind: 'card' }, records: [], version: 5 } })
        socket.receive({ id: fileMessage.id, result: { content: '# Card', exists: true } })
        socket.receive({ id: settingsMessage.id, result: undefined })

        await expect(activity).resolves.toMatchObject({ version: 5 })
        await expect(historicalFile).resolves.toEqual({ content: '# Card', exists: true })
        await expect(settingsUpdate).resolves.toBeUndefined()
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

    it('loads one activity file through remote control', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const path = 'design/activity/card__card-1.json'
        const conversations = service.loadActivityConversations(project, path)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(sentRequest).toMatchObject({ method: 'loadActivityConversations', params: [path] })
        socket.receive({ id: sentRequest.id, result: [] })

        await expect(conversations).resolves.toEqual([])
    })

    it('adds remote method context while preserving response error as cause', async () => {
        installWebSocket()
        const service = createService()
        const request = service.sendActionMessage('unknown-run', 'continue')
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string }
        socket.receive({ error: { message: 'Unknown action run: unknown-run' }, id: sentRequest.id })

        const error = await request.catch((caughtError: unknown) => caughtError)

        expect(error).toMatchObject({
            cause: expect.objectContaining({ message: 'Unknown action run: unknown-run' }),
            message: 'Remote method sendActionMessage failed: Unknown action run: unknown-run',
        })
    })

    it('preserves permission-mode overrides in remote action requests', async () => {
        installWebSocket()
        const service = createService()
        const actionRequest = {
            ...actionStartRequest(),
            runInput: { permissionMode: 'approve-for-me' as const },
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

    it('reserves card agent conversations through remote control', async () => {
        installWebSocket()
        const service = createService()
        const actionRequest = actionStartRequest()
        const reservationRequest = service.reserveActionConversation(actionRequest)
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(sentRequest).toMatchObject({ method: 'reserveActionConversation', params: [actionRequest] })
        const reservation = {
            activityPath: 'design/activity/card.json',
            conversationId: 'conversation-1',
            reference: 'design/activity/card.json#conversation=conversation-1',
        }
        socket.receive({ id: sentRequest.id, result: reservation })

        await expect(reservationRequest).resolves.toEqual(reservation)
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
            service.enqueueActionPrompt('action-1', 'next'),
            service.editActionQueuedPrompt('action-1', 'prompt-1', 0, 'edited'),
            service.deleteActionQueuedPrompt('action-1', 'prompt-1', 1),
            service.answerActionApproval('action-1', 41, 'accept'),
            service.answerActionQuestion('action-1', 7, { confirm: ['Yes'] }),
            service.dismissActionQuestions('action-1', 7),
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
            { method: 'enqueueActionPrompt', params: ['action-1', 'next'] },
            { method: 'editActionQueuedPrompt', params: ['action-1', 'prompt-1', 0, 'edited'] },
            { method: 'deleteActionQueuedPrompt', params: ['action-1', 'prompt-1', 1] },
            { method: 'answerActionApproval', params: ['action-1', 41, 'accept'] },
            { method: 'answerActionQuestion', params: ['action-1', 7, { confirm: ['Yes'] }] },
            { method: 'dismissActionQuestions', params: ['action-1', 7] },
            { method: 'closeWaitingActionConversation', params: ['activity.json#conversation=one', 'completed'] },
            { method: 'updateActionConversationViewed', params: ['activity.json#conversation=one', false] },
            { method: 'finishActionRun', params: ['action-1'] },
            { method: 'restartActionRun', params: ['action-1', { actionId: 'review', context: { kind: 'project' }, runInput: {} }] },
            { method: 'notifyActionCardStateChange', params: ['card-1', 'ready'] },
        ])
        requests.forEach(({ id, method }) => {
            const result = method === 'enqueueActionPrompt' || method === 'editActionQueuedPrompt'
                ? { content: 'next', dispatchState: 'queued', id: 'prompt-1', revision: 0 }
                : method === 'deleteActionQueuedPrompt' ? { deleted: true } : null
            socket.receive({ id, result })
        })

        await Promise.all(operations)
    })

    it('loads authoritative action recovery for renderer run IDs', async () => {
        installWebSocket()
        const service = createService()
        const recovery = service.loadActionRunRecoverySnapshot(['run-active', 'run-ended'])
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string, method: string, params: unknown[] }
        expect(sentRequest).toMatchObject({
            method: 'loadActionRunRecoverySnapshot',
            params: [['run-active', 'run-ended']],
        })
        const snapshot = {
            activeRunEvents: [],
            terminalResults: [{ changedPaths: [], failure: null, runId: 'run-ended', status: 'completed' }],
        }
        socket.receive({ id: sentRequest.id, result: snapshot })

        await expect(recovery).resolves.toEqual(snapshot)
    })

    it('reattaches action run subscription after reconnect', async () => {
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
        secondSocket.receive({
            event: 'actionRun',
            payload: { event, requestId: secondSubscription.id, subscriptionId: 'action-events-2' },
        })

        await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(event))
    })

    it('restores one live merge-conflict subscription after reconnect', async () => {
        installWebSocket()
        const service = createService()
        const callback = vi.fn()
        service.onMergeConflictSessionChanged(callback)
        const firstSocket = lastSocket()
        firstSocket.open()
        await flushPromises()
        const firstSubscription = JSON.parse(firstSocket.sent[0]) as { id: string }
        firstSocket.receive({ id: firstSubscription.id, result: { subscriptionId: 'conflict-1' } })
        await flushPromises()
        firstSocket.close()

        const reconnection = service.connect()
        const secondSocket = lastSocket()
        secondSocket.open()
        await reconnection
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(1))
        const secondSubscription = JSON.parse(secondSocket.sent[0]) as { id: string, method: string }
        expect(secondSubscription.method).toBe('onMergeConflictSessionChanged')
        secondSocket.receive({ id: secondSubscription.id, result: { subscriptionId: 'conflict-2' } })
        const session = { id: 'session-2', paths: ['design/F-1.md'] }
        secondSocket.receive({
            event: 'mergeConflictSessionChanged',
            payload: { requestId: secondSubscription.id, session, subscriptionId: 'conflict-2' },
        })

        expect(callback).toHaveBeenCalledOnce()
        expect(callback).toHaveBeenCalledWith(session)
    })

    it('clears stale Claude callback state and restores one subscription after reconnect', async () => {
        installWebSocket()
        const service = createService()
        const callback = vi.fn()
        service.onClaudeRateLimits(callback)
        const firstSocket = lastSocket()
        firstSocket.open()
        await flushPromises()
        const firstSubscription = JSON.parse(firstSocket.sent[0]) as { id: string }
        firstSocket.receive({ id: firstSubscription.id, result: { subscriptionId: 'claude-limits-1' } })
        await flushPromises()
        firstSocket.close()
        firstSocket.receive({
            event: 'claudeRateLimits',
            payload: {
                requestId: firstSubscription.id,
                snapshot: { available: true, observedAt: 10, windows: [] },
                subscriptionId: 'claude-limits-1',
            },
        })

        const reconnection = service.connect()
        const secondSocket = lastSocket()
        secondSocket.open()
        await reconnection
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(1))
        const secondSubscription = JSON.parse(secondSocket.sent[0]) as { id: string, method: string }
        expect(secondSubscription.method).toBe('onClaudeRateLimits')
        secondSocket.receive({ id: secondSubscription.id, result: { subscriptionId: 'claude-limits-2' } })
        const snapshot = { available: true, observedAt: 11, windows: [] }
        secondSocket.receive({
            event: 'claudeRateLimits',
            payload: { requestId: secondSubscription.id, snapshot, subscriptionId: 'claude-limits-2' },
        })

        await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
        expect(callback).toHaveBeenCalledWith(snapshot)
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
        const watchError = vi.fn()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        service.watchProject(project, watchCallback, vi.fn(), watchError)
        const socket = lastSocket()
        socket.open()
        await flushPromises()
        const watchRequest = JSON.parse(socket.sent[0]) as { id: string }
        socket.receive({ id: watchRequest.id, result: { subscriptionId: 'sub-1' } })
        socket.receive({
            event: 'watchProject',
            payload: { event: { changeKind: 'changed', path: 'design/F-1.md' }, requestId: watchRequest.id, subscriptionId: 'sub-1' },
        })
        socket.receive({
            event: 'watchProject',
            payload: { event: { error: 'Native watcher unavailable' }, requestId: watchRequest.id, subscriptionId: 'sub-1' },
        })
        expect(watchCallback).toHaveBeenCalledWith({ changeKind: 'changed', path: 'design/F-1.md' })
        expect(watchError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Native watcher unavailable' }))
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
        const stopWatch = service.watchProject(project, watchCallback, vi.fn(), vi.fn())
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
        const stop = service.watchProject(project, callback, vi.fn(), vi.fn())
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

    it('restores each live project watch once per reconnect and never restores a stopped watch', async () => {
        installWebSocket()
        const service = createService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const callback = vi.fn()
        const restored = vi.fn()
        const stop = service.watchProject(project, callback, restored, vi.fn())
        const firstSocket = lastSocket()

        firstSocket.open()
        await flushPromises()
        const firstRequest = JSON.parse(firstSocket.sent[0]) as { id: string, method: string }
        expect(firstRequest.method).toBe('watchProject')
        firstSocket.receive({ id: firstRequest.id, result: { subscriptionId: 'watch-1' } })
        await flushPromises()
        expect(restored).not.toHaveBeenCalled()

        firstSocket.close()
        const firstReconnect = service.connect()
        const secondSocket = lastSocket()
        secondSocket.open()
        await firstReconnect
        await vi.waitFor(() => expect(secondSocket.sent).toHaveLength(1))
        const secondRequest = JSON.parse(secondSocket.sent[0]) as { id: string, method: string }
        expect(secondRequest.method).toBe('watchProject')
        secondSocket.receive({ id: secondRequest.id, result: { subscriptionId: 'watch-2' } })
        await vi.waitFor(() => expect(restored).toHaveBeenCalledTimes(1))
        secondSocket.receive({
            event: 'watchProject',
            payload: {
                event: { changeKind: 'changed', path: 'design/F-1.md' },
                requestId: secondRequest.id,
                subscriptionId: 'watch-2',
            },
        })
        expect(callback).toHaveBeenCalledWith({ changeKind: 'changed', path: 'design/F-1.md' })

        secondSocket.close()
        const secondReconnect = service.connect()
        const thirdSocket = lastSocket()
        thirdSocket.open()
        await secondReconnect
        await vi.waitFor(() => expect(thirdSocket.sent).toHaveLength(1))
        const thirdRequest = JSON.parse(thirdSocket.sent[0]) as { id: string, method: string }
        expect(thirdRequest.method).toBe('watchProject')
        thirdSocket.receive({ id: thirdRequest.id, result: { subscriptionId: 'watch-3' } })
        await vi.waitFor(() => expect(restored).toHaveBeenCalledTimes(2))

        stop()
        await vi.waitFor(() => expect(thirdSocket.sent).toHaveLength(2))
        expect(JSON.parse(thirdSocket.sent[1])).toEqual(expect.objectContaining({ method: 'unsubscribe', params: ['watch-3'] }))
        thirdSocket.close()
        const thirdReconnect = service.connect()
        const fourthSocket = lastSocket()
        fourthSocket.open()
        await thirdReconnect
        await flushPromises()

        expect(fourthSocket.sent).toEqual([])
        expect(restored).toHaveBeenCalledTimes(2)
    })

    it('fails an in-flight request once and does not replay it after reconnect', async () => {
        installWebSocket()
        const service = createService()
        const request = service.startAction(actionStartRequest())
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        socket.close()

        await expect(request).rejects.toThrow('Remote-control connection closed')
        const reconnection = service.connect()
        const replacementSocket = lastSocket()
        replacementSocket.open()
        await reconnection
        await flushPromises()

        expect(replacementSocket.sent).toEqual([])
    })

    it('holds requests started during reconnection for the shared socket attempt', async () => {
        installWebSocket()
        const service = createService()
        const firstConnection = service.connect()
        const firstSocket = lastSocket()
        firstSocket.open()
        await firstConnection
        firstSocket.close()

        const request = service.getActiveProject()
        await flushPromises()
        expect(MockWebSocket.instances).toHaveLength(1)

        const reconnection = service.connect()
        const secondSocket = lastSocket()
        expect(MockWebSocket.instances).toHaveLength(2)
        secondSocket.open()
        await reconnection
        await flushPromises()

        expect(secondSocket.sent).toHaveLength(1)
        const sentRequest = JSON.parse(secondSocket.sent[0]) as { id: string, method: string }
        expect(sentRequest.method).toBe('getActiveProject')
        secondSocket.receive({ id: sentRequest.id, result: null })
        await expect(request).resolves.toBeNull()
    })

    it('fails requests waiting for reconnection when explicitly disconnected', async () => {
        installWebSocket()
        const service = createService()
        const connection = service.connect()
        const socket = lastSocket()
        socket.open()
        await connection
        socket.close()

        const request = service.getActiveProject()
        service.disconnect()

        await expect(request).rejects.toThrow('Remote-control connection closed')
        expect(MockWebSocket.instances).toHaveLength(1)
    })

    it('ignores late close and error events from an older socket', async () => {
        installWebSocket()
        const service = createService()
        const connectionChanges = vi.fn()
        service.onConnectionChanged(connectionChanges)
        const firstConnection = service.connect()
        const firstSocket = lastSocket()
        firstSocket.open()
        await firstConnection
        firstSocket.close()

        const reconnection = service.connect()
        const secondSocket = lastSocket()
        secondSocket.open()
        await reconnection
        firstSocket.dispatchEvent(new Event('close'))
        firstSocket.dispatchEvent(new Event('error'))

        const request = service.getActiveProject()
        await flushPromises()
        const sentRequest = JSON.parse(secondSocket.sent[0]) as { id: string }
        secondSocket.receive({ id: sentRequest.id, result: null })

        await expect(request).resolves.toBeNull()
        expect(connectionChanges.mock.calls).toEqual([[true], [false], [true]])
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

    it('constructs WebSocket with endpoint only', async () => {
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
        expect(socket.protocol).toBeUndefined()
    })
    it('rebuilds a missing working folder error from the remote response marker', async () => {
        installWebSocket()
        const service = createService()
        const request = service.loadProject({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, 'design/feature_descriptions')
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string }
        socket.receive({
            error: {
                code: 'missing-working-folder',
                fields: { workingFolder: 'design/feature_descriptions' },
                message: 'Working folder is missing: design/feature_descriptions',
                name: 'Error',
            },
            id: sentRequest.id,
        })

        const error = await request.catch((failure: unknown) => failure) as MissingWorkingFolderError

        expect(error).toBeInstanceOf(MissingWorkingFolderError)
        expect(error.code).toBe('missing-working-folder')
        expect(error.workingFolder).toBe('design/feature_descriptions')
    })

    it('keeps reporting unmarked remote failures with the remote method prefix', async () => {
        installWebSocket()
        const service = createService()
        const request = service.startAction(actionStartRequest())
        const socket = lastSocket()

        socket.open()
        await flushPromises()
        const sentRequest = JSON.parse(socket.sent[0]) as { id: string }
        socket.receive({ error: { message: 'Action failed' }, id: sentRequest.id })

        await expect(request).rejects.toThrow('Remote method startAction failed: Action failed')
    })
})
