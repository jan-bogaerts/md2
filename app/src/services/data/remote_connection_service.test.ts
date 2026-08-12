import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../test_support/data_service_test_support'
import { RemoteConnectionService, type RemoteConnectionServiceDependencies } from './remote_connection_service'
import { RemoteControlConnectionError, RemoteControlStorageService } from './remote_control_storage_service'

interface MockStorageControl {
    close(): void
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    storage: RemoteControlStorageService
}

function createMockStorage(connect: () => Promise<void> = async () => undefined): MockStorageControl {
    const storage = new RemoteControlStorageService()
    let connectionListener: ((connected: boolean) => void) | null = null
    const connectMock = vi.fn(connect)
    const disconnect = vi.fn()
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
        storage,
    }
}

function createService(storageControls: MockStorageControl[]) {
    const activate = vi.fn(async (): Promise<void> => undefined)
    const clearActivation = vi.fn()
    const replaceProjectStorage = vi.fn()
    const createStorage = vi.fn(() => {
        const control = storageControls.shift()
        if (!control) throw new Error('Missing mock remote storage')

        return control.storage
    })
    const dependencies: RemoteConnectionServiceDependencies = {
        activate,
        clearActivation,
        createStorage,
        replaceProjectStorage,
    }

    return { activate, clearActivation, createStorage, replaceProjectStorage, service: new RemoteConnectionService(dependencies) }
}

const SETTINGS = { endpoint: 'ws://desktop:1234' }

describe('RemoteConnectionService', () => {
    afterEach(() => vi.useRealTimers())

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

    it('creates a fresh storage and replaces project transport after unexpected close', async () => {
        const first = createMockStorage()
        const second = createMockStorage()
        const setup = createService([first, second])
        await setup.service.connect(SETTINGS)
        setup.service.setProjectStorageActive(true)

        first.close()

        await vi.waitFor(() => expect(setup.service.getSnapshot().status).toBe('ready'))
        expect(setup.createStorage).toHaveBeenCalledTimes(2)
        expect(setup.replaceProjectStorage).toHaveBeenCalledOnce()
        expect(setup.replaceProjectStorage.mock.calls[0][0]).toBe(second.storage)
        expect(setup.replaceProjectStorage.mock.calls[0][0]).not.toBe(first.storage)
        await expect(first.storage.getActiveProject()).rejects.toThrow('Remote-control connection was replaced')
    })

    it('cancels delayed retries on explicit disconnect', async () => {
        vi.useFakeTimers()
        const first = createMockStorage()
        const failedReconnect = createMockStorage(async () => {
            throw new RemoteControlConnectionError('offline')
        })
        const unused = createMockStorage()
        const setup = createService([first, failedReconnect, unused])
        await setup.service.connect(SETTINGS)

        first.close()
        await vi.waitFor(() => expect(failedReconnect.connect).toHaveBeenCalledOnce())
        setup.service.disconnect()
        await vi.advanceTimersByTimeAsync(60_000)

        expect(setup.createStorage).toHaveBeenCalledTimes(2)
        expect(setup.service.getSnapshot().status).toBe('disconnected')
    })
})
