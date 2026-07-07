import { describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../data/electron_data_bridge'
import type { CommitRequest, DeleteFileRequest } from '../data/data_types'
import { LocalGitStorageService } from './local_git_storage_service'

function createBridge(overrides: Partial<ElectronDataBridge> = {}): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(),
        commit: vi.fn().mockResolvedValue([]),
        createProject: vi.fn(),
        createWorkingFolderFromTemplate: vi.fn(),
        deleteFile: vi.fn().mockResolvedValue(undefined),
        listBranches: vi.fn(),
        listRepositoryFiles: vi.fn(),
        listTopLevelFolders: vi.fn(),
        loadFile: vi.fn().mockResolvedValue({ content: '# Root', path: 'design/F-1-card.md' }),
        loadProjectAsset: vi.fn().mockResolvedValue({ content: 'aWNvbg==', contentType: 'image/png', encoding: 'base64', path: 'actions/icon.png' }),
        loadActionFiles: vi.fn(),
        loadProject: vi.fn(),
        loadProjectRoot: vi.fn(),
        loadProjectConfig: vi.fn(),
        moveFiles: vi.fn().mockResolvedValue(undefined),
        openProjectFolder: vi.fn(),
        push: vi.fn().mockResolvedValue(undefined),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn().mockReturnValue(() => undefined),
        ...overrides,
    }
}

describe('LocalGitStorageService binary write path', () => {
    it('forwards base64 asset files to the bridge unchanged', async () => {
        const commit = vi.fn().mockResolvedValue([])
        const bridge = createBridge({ commit })
        const service = new LocalGitStorageService()
        service.init({ bridge })

        const request: CommitRequest = {
            branch: 'main',
            files: [
                { content: '# Card', encoding: 'utf-8', path: 'design/F-1-card.md' },
                { content: 'aW1hZ2U=', encoding: 'base64', path: 'design/note.png' },
            ],
            message: 'Import Remarkable images',
        }

        const result = await service.commit(request)

        expect(commit).toHaveBeenCalledWith(request)
        expect(commit.mock.calls[0][0].files[1].encoding).toBe('base64')
        expect(result).toEqual([])
    })

    it('forwards file moves to the bridge unchanged', async () => {
        const moveFiles = vi.fn().mockResolvedValue(undefined)
        const bridge = createBridge({ moveFiles })
        const service = new LocalGitStorageService()
        service.init({ bridge })
        const request = {
            branch: 'main',
            message: 'Complete release v1',
            moves: [{ content: '# Card', fromPath: 'design/F-1-card.md', toPath: 'design/history/v1/F-1-card.md' }],
        }

        await service.moveFiles(request)

        expect(moveFiles).toHaveBeenCalledWith(request)
    })

    it('forwards file deletion to the bridge unchanged', async () => {
        const deleteFile = vi.fn().mockResolvedValue(undefined)
        const bridge = createBridge({ deleteFile })
        const service = new LocalGitStorageService()
        service.init({ bridge })
        const request: DeleteFileRequest = {
            branch: 'main',
            message: 'Delete obsolete card',
            path: 'design/F-1-card.md',
            sha: 'sha-1',
        }

        await service.deleteFile(request)

        expect(deleteFile).toHaveBeenCalledWith(request)
    })

    it('forwards single file reads to the bridge unchanged', async () => {
        const loadFile = vi.fn().mockResolvedValue({ content: '# Root', path: 'design/F-1-card.md' })
        const bridge = createBridge({ loadFile })
        const service = new LocalGitStorageService()
        service.init({ bridge })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        const file = await service.loadFile(project, 'design/F-1-card.md')

        expect(loadFile).toHaveBeenCalledWith(project, 'design/F-1-card.md')
        expect(file).toEqual({ content: '# Root', path: 'design/F-1-card.md' })
    })

    it('forwards project asset reads to the bridge unchanged', async () => {
        const loadProjectAsset = vi.fn().mockResolvedValue({
            content: 'aWNvbg==',
            contentType: 'image/png',
            encoding: 'base64',
            path: 'actions/icon.png',
        })
        const bridge = createBridge({ loadProjectAsset })
        const service = new LocalGitStorageService()
        service.init({ bridge })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        const asset = await service.loadProjectAsset(project, 'actions/icon.png')

        expect(loadProjectAsset).toHaveBeenCalledWith(project, 'actions/icon.png')
        expect(asset).toEqual({ content: 'aWNvbg==', contentType: 'image/png', encoding: 'base64', path: 'actions/icon.png' })
    })
})
