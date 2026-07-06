import { describe, expect, it, vi } from 'vitest'
import { LocalGitStorageService } from './local_git_storage_service'
import type { ElectronDataBridge } from './electron_data_bridge'

function createBridge(): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md']),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn(() => vi.fn()),
    }
}

describe('LocalGitStorageService', () => {
    it('delegates project operations to the Electron bridge', async () => {
        const bridge = createBridge()
        const service = new LocalGitStorageService()
        service.init({ bridge })

        const project = await service.openProjectFolder()
        await service.loadProject(project!, 'design')
        await service.loadProjectConfig(project!)
        await service.listRepositoryFiles(project!)
        await service.listTopLevelFolders(project!)
        await service.createWorkingFolderFromTemplate(project!, 'design')
        await service.checkoutBranch(project!, 'feature')
        const commitResult = await service.commit({ branch: 'feature', files: [{ content: '# Test', path: 'design/F-1-test.md' }], message: 'Update test' })
        await service.deleteFile({ branch: 'feature', message: 'Delete test', path: 'design/F-1-test.md', sha: 'sha-1' })
        await service.moveFiles({
            branch: 'feature',
            message: 'Complete release v1',
            moves: [{ content: '# Test', fromPath: 'design/F-1-test.md', toPath: 'design/history/v1/F-1-test.md' }],
        })
        await service.saveProjectConfig(project!, {
            actionsFolder: 'actions',
            cardBodyTemplate: '# Template',
            cardTypes: [],
            diffCommand: 'git show {{commit}}',
            pushMode: 'auto',
            workingFolder: 'design',
        })
        await service.push(project!)

        expect(bridge.openProjectFolder).toHaveBeenCalled()
        expect(bridge.loadProject).toHaveBeenCalledWith(project, 'design')
        expect(bridge.loadProjectConfig).toHaveBeenCalledWith(project)
        expect(bridge.listRepositoryFiles).toHaveBeenCalledWith(project)
        expect(bridge.listTopLevelFolders).toHaveBeenCalledWith(project)
        expect(bridge.createWorkingFolderFromTemplate).toHaveBeenCalledWith(project, 'design')
        expect(bridge.checkoutBranch).toHaveBeenCalledWith(project, 'feature')
        expect(bridge.commit).toHaveBeenCalled()
        expect(commitResult).toEqual([])
        expect(bridge.deleteFile).toHaveBeenCalled()
        expect(bridge.moveFiles).toHaveBeenCalled()
        expect(bridge.saveProjectConfig).toHaveBeenCalled()
        expect(bridge.push).toHaveBeenCalledWith(project)
    })
})
