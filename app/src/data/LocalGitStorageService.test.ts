import { describe, expect, it, vi } from 'vitest'
import { LocalGitStorageService } from './LocalGitStorageService'
import type { ElectronDataBridge } from './electronDataBridge'

function createBridge(): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(),
        createProject: vi.fn(async (project) => project),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
        watchProject: vi.fn(() => vi.fn()),
    }
}

describe('LocalGitStorageService', () => {
    it('delegates project operations to the Electron bridge', async () => {
        const bridge = createBridge()
        const service = new LocalGitStorageService({ bridge })

        const project = await service.openProjectFolder()
        await service.loadProject(project!, 'design')
        await service.checkoutBranch(project!, 'feature')
        await service.commit({ branch: 'feature', files: [{ content: '# Test', path: 'design/F-1-test.md' }], message: 'Update test' })
        await service.push(project!)

        expect(bridge.openProjectFolder).toHaveBeenCalled()
        expect(bridge.loadProject).toHaveBeenCalledWith(project, 'design')
        expect(bridge.checkoutBranch).toHaveBeenCalledWith(project, 'feature')
        expect(bridge.commit).toHaveBeenCalled()
        expect(bridge.push).toHaveBeenCalledWith(project)
    })
})
