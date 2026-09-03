import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../data/action_run_types'
import { DEFAULT_PROJECT_CONFIG } from '../../data/data_types'
import { setActionBridgeOverride } from '../../data/electron_action_bridge'
import { createAgentTokenUsageSummary, serializeAgentTokenUsageSummary } from '../../../../shared/agent_token_usage_summary.mjs'
import { ActionRunRegistry } from '../actions/action_run_registry'
import { ProjectAgentTokenUsageService } from '../agents/project_agent_token_usage_service'
import { createDeferred } from '../test_support/data_service_test_support'
import { RemoteConnectionService, type RemoteConnectionServiceDependencies } from './remote_connection_service'
import { RemoteControlConnectionError, RemoteControlStorageService } from './remote_control_storage_service'

interface MockStorageControl {
    close(): void
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    retire: ReturnType<typeof vi.fn>
    storage: RemoteControlStorageService
}

function createMockStorage(connect: () => Promise<void> = async () => undefined): MockStorageControl {
    const storage = new RemoteControlStorageService()
    let connectionListener: ((connected: boolean) => void) | null = null
    const connectMock = vi.fn(connect)
    const disconnect = vi.fn()
    const retire = vi.spyOn(storage, 'retire')
    vi.spyOn(storage, 'connect').mockImplementation(connectMock)
    vi.spyOn(storage, 'disconnect').mockImplementation(disconnect)
    vi.spyOn(storage, 'onConnectionChanged').mockImplementation((listener) => {
        connectionListener = listener

        return () => {
            connectionListener = null

            return true
        }
    })

    return {
        close: () => connectionListener?.(false),
        connect: connectMock,
        disconnect,
        retire,
        storage,
    }
}

function createService(storageControls: MockStorageControl[]) {
    const activate = vi.fn<RemoteConnectionServiceDependencies['activate']>(async () => undefined)
    const clearActivation = vi.fn()
    const createStorage = vi.fn(() => {
        const control = storageControls.shift()
        if (!control) throw new Error('Missing mock remote storage')

        return control.storage
    })
    const dependencies: RemoteConnectionServiceDependencies = {
        activate,
        clearActivation,
        createStorage,
    }

    return { activate, clearActivation, createStorage, service: new RemoteConnectionService(dependencies) }
}

const SETTINGS = { endpoint: 'ws://desktop:1234' }

describe('RemoteConnectionService', () => {
    afterEach(() => {
        setActionBridgeOverride(null)
        vi.useRealTimers()
    })

    it('deduplicates identical connections while activation is in progress', async () => {
        const activation = createDeferred<void>()
        const first = createMockStorage()
        const setup = createService([first])
        setup.activate.mockReturnValue(activation.promise)

        const firstConnection = setup.service.connect(SETTINGS)
        const secondConnection = setup.service.connect(SETTINGS)
        await vi.waitFor(() => expect(setup.activate).toHaveBeenCalledOnce())
        expect(setup.createStorage).toHaveBeenCalledOnce()
        expect(setup.service.getSnapshot().status).toBe('connecting')

        activation.resolve(undefined)
        await expect(firstConnection).resolves.toBe(first.storage)
        await expect(secondConnection).resolves.toBe(first.storage)
        expect(setup.service.getSnapshot().status).toBe('ready')
    })

    it('reconnects the existing storage without replacing project transport', async () => {
        vi.useFakeTimers()
        const first = createMockStorage()
        const setup = createService([first])
        const firstActionCleanup = vi.fn()
        const firstRateLimitCleanup = vi.fn()
        const firstActionSubscription = vi.spyOn(first.storage, 'onActionRun').mockReturnValue(firstActionCleanup)
        const firstRateLimitSubscription = vi.spyOn(first.storage, 'onCodexRateLimits').mockReturnValue(firstRateLimitCleanup)
        let actionCleanup: (() => void) | null = null
        let rateLimitCleanup: (() => void) | null = null
        setup.activate.mockImplementation(async (storage) => {
            actionCleanup?.()
            rateLimitCleanup?.()
            actionCleanup = storage.onActionRun(() => undefined)
            rateLimitCleanup = storage.onCodexRateLimits(() => undefined)
        })
        await setup.service.connect(SETTINGS)
        setup.service.setProjectStorageActive(true)

        first.close()
        expect(setup.service.getSnapshot().status).toBe('reconnecting')
        expect(first.connect).toHaveBeenCalledOnce()
        await vi.advanceTimersByTimeAsync(999)
        expect(first.connect).toHaveBeenCalledOnce()
        await vi.advanceTimersByTimeAsync(1)

        await vi.waitFor(() => expect(setup.service.getSnapshot().status).toBe('ready'))
        expect(setup.createStorage).toHaveBeenCalledOnce()
        expect(first.connect).toHaveBeenCalledTimes(2)
        expect(first.retire).not.toHaveBeenCalled()
        expect(firstActionSubscription).toHaveBeenCalledTimes(2)
        expect(firstRateLimitSubscription).toHaveBeenCalledTimes(2)
        expect(firstActionCleanup).toHaveBeenCalledOnce()
        expect(firstRateLimitCleanup).toHaveBeenCalledOnce()
        expect(setup.activate).toHaveBeenNthCalledWith(2, first.storage, true)
    })

    it('keeps project-scoped token usage refreshes on the live storage after reconnect', async () => {
        vi.useFakeTimers()
        const first = createMockStorage()
        const setup = createService([first])
        const summaryPath = 'design/agent_token_usage.json'
        const summaryFile = { content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()), path: summaryPath }
        const listRepositoryFiles = vi.spyOn(first.storage, 'listRepositoryFiles').mockResolvedValue([summaryPath])
        const loadTextFile = vi.spyOn(first.storage, 'loadTextFile').mockResolvedValue(summaryFile)
        const consumer = new ProjectAgentTokenUsageService()
        const project = { branch: 'main', id: 'project' }
        const config = { ...DEFAULT_PROJECT_CONFIG, projectFolder: 'design', pushMode: 'manual' as const }
        await setup.service.connect(SETTINGS)
        await consumer.load(project, config, first.storage, vi.fn())

        first.close()
        await vi.advanceTimersByTimeAsync(1_000)
        await consumer.refresh()

        expect(first.retire).not.toHaveBeenCalled()
        expect(setup.createStorage).toHaveBeenCalledOnce()
        expect(listRepositoryFiles).toHaveBeenCalledTimes(2)
        expect(loadTextFile).toHaveBeenCalledTimes(2)
    })

    it('activates replacement bridge before registry recovers disconnected run', async () => {
        vi.useFakeTimers()
        const first = createMockStorage()
        const setup = createService([first])
        const registry = new ActionRunRegistry()
        const runningEvent: ActionRunEvent = {
            actionId: 'build', context: { kind: 'project' }, phase: 'main', rootActionId: 'build', runId: 'run-1',
            sequence: 1, status: 'running', type: 'run',
        }
        vi.spyOn(first.storage, 'onActionRun').mockReturnValue(vi.fn())
        const recovery = vi.spyOn(first.storage, 'loadActionRunRecoverySnapshot')
            .mockResolvedValueOnce({ activeRunEvents: [runningEvent], terminalResults: [] })
            .mockResolvedValue({
                activeRunEvents: [],
                terminalResults: [{ changedPaths: [], failure: null, runId: 'run-1', status: 'completed' }],
            })
        setup.activate.mockImplementation(async (storage, reconnecting) => {
            setActionBridgeOverride(storage)
            registry.start()
            if (reconnecting) await registry.recoverConnection()
        })
        setup.clearActivation.mockImplementation(() => setActionBridgeOverride(null))

        try {
            await setup.service.connect(SETTINGS)
            await vi.waitFor(() => expect(registry.getRunStore('run-1')).not.toBeNull())
            const store = registry.getRunStore('run-1')
            if (!store) throw new Error('Missing recovered run')
            const release = store.subscribe(vi.fn())

            first.close()
            await vi.advanceTimersByTimeAsync(1_000)

            await vi.waitFor(() => expect(store.getSnapshot().status).toBe('completed'))
            expect(recovery).toHaveBeenLastCalledWith(['run-1'])
            release()
        } finally {
            registry.stop()
            setup.service.disconnect()
        }
    })

    it('cancels delayed retries on explicit disconnect', async () => {
        vi.useFakeTimers()
        const first = createMockStorage()
        const setup = createService([first])
        await setup.service.connect(SETTINGS)
        first.connect.mockRejectedValueOnce(new RemoteControlConnectionError('offline'))

        first.close()
        await vi.advanceTimersByTimeAsync(1_000)
        expect(first.connect).toHaveBeenCalledTimes(2)
        setup.service.disconnect()
        await vi.advanceTimersByTimeAsync(60_000)

        expect(first.connect).toHaveBeenCalledTimes(2)
        expect(first.retire).toHaveBeenCalledOnce()
        expect(setup.service.getSnapshot().status).toBe('disconnected')
    })

    it('uses one capped exponential retry timer and resets delay after activation succeeds', async () => {
        vi.useFakeTimers()
        const first = createMockStorage()
        const setup = createService([first])
        await setup.service.connect(SETTINGS)
        setup.activate.mockRejectedValueOnce(new Error('activation offline'))
        first.close()
        first.close()

        await vi.advanceTimersByTimeAsync(999)
        expect(first.connect).toHaveBeenCalledOnce()
        await vi.advanceTimersByTimeAsync(1)
        expect(first.connect).toHaveBeenCalledTimes(2)
        expect(setup.service.getSnapshot()).toMatchObject({ errorMessage: 'activation offline', status: 'reconnecting' })

        await vi.advanceTimersByTimeAsync(1_999)
        expect(first.connect).toHaveBeenCalledTimes(2)
        await vi.advanceTimersByTimeAsync(1)
        expect(first.connect).toHaveBeenCalledTimes(3)
        expect(setup.service.getSnapshot().status).toBe('ready')

        first.close()
        await vi.advanceTimersByTimeAsync(999)
        expect(first.connect).toHaveBeenCalledTimes(3)
        await vi.advanceTimersByTimeAsync(1)
        expect(first.connect).toHaveBeenCalledTimes(4)
    })

    it('caps repeated failed retries at thirty seconds', async () => {
        vi.useFakeTimers()
        const first = createMockStorage()
        const setup = createService([first])
        await setup.service.connect(SETTINGS)
        first.connect.mockRejectedValue(new RemoteControlConnectionError('offline'))
        first.close()

        for (const delayMs of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
            const callsBeforeDelay = first.connect.mock.calls.length
            await vi.advanceTimersByTimeAsync(delayMs - 1)
            expect(first.connect).toHaveBeenCalledTimes(callsBeforeDelay)
            await vi.advanceTimersByTimeAsync(1)
            expect(first.connect).toHaveBeenCalledTimes(callsBeforeDelay + 1)
        }
    })

    it('retires old storage and cancels its retry when endpoint changes', async () => {
        vi.useFakeTimers()
        const first = createMockStorage()
        const second = createMockStorage()
        const setup = createService([first, second])
        await setup.service.connect(SETTINGS)
        first.close()

        const replacement = await setup.service.connect({ endpoint: 'ws://other-desktop:1234' })
        await vi.advanceTimersByTimeAsync(60_000)

        expect(replacement).toBe(second.storage)
        expect(first.retire).toHaveBeenCalledOnce()
        expect(first.connect).toHaveBeenCalledOnce()
        expect(second.connect).toHaveBeenCalledOnce()
        expect(setup.createStorage).toHaveBeenCalledTimes(2)
        expect(setup.service.getSnapshot()).toMatchObject({ endpoint: 'ws://other-desktop:1234', status: 'ready' })
    })
})
