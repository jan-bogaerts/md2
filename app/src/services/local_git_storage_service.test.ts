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
        loadActionFiles: vi.fn(),
        loadProject: vi.fn(),
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
})
