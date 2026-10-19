import { describe, expect, it, vi } from 'vitest'
import { ApplicationStartupService, type ApplicationStartupDependencies } from './application_startup_service'

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
})
