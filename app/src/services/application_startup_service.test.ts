import { describe, expect, it, vi } from 'vitest'
import { ApplicationStartupService, type ApplicationStartupDependencies } from './application_startup_service'
import { RemoteControlConnectionError } from './data/remote_control_storage_service'

function createDependencies(overrides: Partial<ApplicationStartupDependencies> = {}): ApplicationStartupDependencies {
    return {
        getGithubAccessToken: vi.fn(() => 'token-1'),
        initializeAgentCapabilities: vi.fn(async () => {}),
        refreshStartupModelCatalogs: vi.fn(async () => {}),
        initializeServices: vi.fn(),
        openStartupProject: vi.fn(async () => {}),
        readStartupProjectPath: vi.fn(() => null),
        restoreGithubSession: vi.fn(async () => {}),
        restoreLastProject: vi.fn(async () => null),
        ...overrides,
    }
}

describe('ApplicationStartupService', () => {
    it('opens the startup project instead of restoring the last project', async () => {
        const dependencies = createDependencies({ readStartupProjectPath: vi.fn(() => 'C:\\repo') })
        const service = new ApplicationStartupService(dependencies)

        await service.start()

        expect(dependencies.openStartupProject).toHaveBeenCalledWith('C:\\repo')
        expect(dependencies.restoreLastProject).not.toHaveBeenCalled()
        expect(service.getSnapshot()).toEqual({ error: null, phase: 'ready', projectOpenResolution: null })
    })

    it('restores the last project without a startup project path', async () => {
        const dependencies = createDependencies()
        const service = new ApplicationStartupService(dependencies)

        await service.start()

        expect(dependencies.restoreLastProject).toHaveBeenCalledWith('token-1')
        expect(dependencies.openStartupProject).not.toHaveBeenCalled()
    })

    it('completes remaining startup work after remote last-project restoration cannot connect', async () => {
        const dependencies = createDependencies({
            restoreLastProject: vi.fn(async () => {
                throw new RemoteControlConnectionError('Remote-control connection failed')
            }),
        })
        const service = new ApplicationStartupService(dependencies)

        await service.start()

        expect(dependencies.refreshStartupModelCatalogs).toHaveBeenCalledOnce()
        expect(dependencies.restoreLastProject).toHaveBeenCalledBefore(vi.mocked(dependencies.refreshStartupModelCatalogs))
        expect(service.getSnapshot()).toEqual({ error: null, phase: 'ready', projectOpenResolution: null })
    })

    it('retains unexpected last-project restoration failures', async () => {
        const dependencies = createDependencies({
            restoreLastProject: vi.fn(async () => {
                throw new Error('Stored project is unavailable')
            }),
        })
        const service = new ApplicationStartupService(dependencies)

        await service.start()

        expect(dependencies.refreshStartupModelCatalogs).not.toHaveBeenCalled()
        expect(service.getSnapshot()).toEqual({
            error: 'Stored project is unavailable',
            phase: 'ready',
            projectOpenResolution: null,
        })
    })
})
