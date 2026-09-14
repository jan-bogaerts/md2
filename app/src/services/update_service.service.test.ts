import { describe, expect, it, vi } from 'vitest'
import type { ElectronUpdateBridge, UpdateSnapshot } from '../data/electron_update_bridge'
import { INITIAL_UPDATE_SNAPSHOT, UpdateService } from './update_service'

const availableSnapshot: UpdateSnapshot = {
    error: null,
    received: 0,
    state: 'available',
    total: null,
    version: '0.6.0',
}

function createBridge(snapshot: UpdateSnapshot = INITIAL_UPDATE_SNAPSHOT) {
    let changedCallback: (nextSnapshot: UpdateSnapshot) => void = () => undefined
    const bridge: ElectronUpdateBridge = {
        dismiss: vi.fn().mockResolvedValue(undefined),
        getSnapshot: vi.fn().mockResolvedValue(snapshot),
        install: vi.fn().mockResolvedValue(undefined),
        onChanged: vi.fn((callback) => {
            changedCallback = callback

            return vi.fn()
        }),
    }

    return { bridge, emitChanged: (nextSnapshot: UpdateSnapshot) => changedCallback(nextSnapshot) }
}

describe('UpdateService', () => {
    it('loads current Electron snapshot after renderer subscribes late', async () => {
        const { bridge } = createBridge(availableSnapshot)
        const service = new UpdateService(() => bridge)
        const changed = vi.fn()
        service.subscribe(changed)

        await service.start()

        expect(service.getSnapshot()).toBe(availableSnapshot)
        expect(changed).toHaveBeenCalledOnce()
    })

    it('keeps newer notification when initial snapshot read finishes later', async () => {
        let resolveSnapshot: (snapshot: UpdateSnapshot) => void = () => undefined
        const initialSnapshot = new Promise<UpdateSnapshot>((resolve) => {
            resolveSnapshot = resolve
        })
        const { bridge, emitChanged } = createBridge()
        vi.mocked(bridge.getSnapshot).mockReturnValue(initialSnapshot)
        const service = new UpdateService(() => bridge)
        const start = service.start()
        const downloadingSnapshot: UpdateSnapshot = {
            error: null,
            received: 20,
            state: 'downloading',
            total: 100,
            version: '0.6.0',
        }

        emitChanged(downloadingSnapshot)
        resolveSnapshot(availableSnapshot)
        await start

        expect(service.getSnapshot()).toBe(downloadingSnapshot)
    })

    it('owns progress state delivered by Electron', async () => {
        const { bridge, emitChanged } = createBridge(availableSnapshot)
        const service = new UpdateService(() => bridge)
        await service.start()
        const progressSnapshot: UpdateSnapshot = {
            error: null,
            received: 25,
            state: 'downloading',
            total: 100,
            version: '0.6.0',
        }

        emitChanged(progressSnapshot)

        expect(service.getSnapshot()).toBe(progressSnapshot)
    })

    it('starts one install and sends no renderer-selected URL', async () => {
        let resolveInstall: () => void = () => undefined
        const install = new Promise<void>((resolve) => {
            resolveInstall = resolve
        })
        const { bridge } = createBridge(availableSnapshot)
        vi.mocked(bridge.install).mockReturnValue(install)
        const service = new UpdateService(() => bridge)
        await service.start()

        const firstInstall = service.install()
        await service.install()

        expect(bridge.install).toHaveBeenCalledOnce()
        expect(bridge.install).toHaveBeenCalledWith()
        expect(service.getSnapshot().state).toBe('downloading')
        resolveInstall()
        await firstInstall
    })

    it('dismisses offer locally and through Electron', async () => {
        const { bridge } = createBridge(availableSnapshot)
        const service = new UpdateService(() => bridge)
        await service.start()

        service.dismiss()

        expect(service.getSnapshot()).toBe(INITIAL_UPDATE_SNAPSHOT)
        expect(bridge.dismiss).toHaveBeenCalledOnce()
    })

    it('exposes retryable error when install IPC rejects', async () => {
        const { bridge } = createBridge(availableSnapshot)
        vi.mocked(bridge.install).mockRejectedValue(new Error('IPC failed'))
        const service = new UpdateService(() => bridge)
        await service.start()

        await service.install()

        expect(service.getSnapshot()).toEqual({
            error: 'Could not install version 0.6.0. Try again.',
            received: 0,
            state: 'error',
            total: null,
            version: '0.6.0',
        })
    })
})
