import { describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import type { CommitRequest, DeleteFileRequest, DeleteFolderRequest } from '../../data/data_types'
import { LocalGitStorageService } from './local_git_storage_service'

function createBridge(overrides: Partial<ElectronDataBridge> = {}): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(),
        commit: vi.fn().mockResolvedValue([]),
        createProject: vi.fn(),
        createWorkingFolderFromTemplate: vi.fn(),
        deleteFile: vi.fn().mockResolvedValue(undefined),
        deleteFolder: vi.fn().mockResolvedValue(undefined),
        hasPendingPush: vi.fn().mockResolvedValue(false),
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
        resolveProject: vi.fn(),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn().mockReturnValue(() => undefined),
        ...overrides,
    }
}

describe('LocalGitStorageService binary write path', () => {
    it('forwards linked worktree mutations to the bridge', async () => {
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const worktree = { branch: 'feature', error: null, path: 'C:/feature', valid: true }
        const addWorktree = vi.fn().mockResolvedValue([worktree])
        const removeWorktree = vi.fn().mockResolvedValue([])
        const service = new LocalGitStorageService()
        service.init({ bridge: createBridge({ addWorktree, removeWorktree }) })

        await expect(service.addWorktree(project)).resolves.toEqual([worktree])
        await expect(service.removeWorktree(project, worktree.path)).resolves.toEqual([])
        expect(addWorktree).toHaveBeenCalledWith(project)
        expect(removeWorktree).toHaveBeenCalledWith(project, worktree.path)
    })

    it('forwards stored project revalidation to the bridge', async () => {
        const project = { branch: 'main', id: 'C:/nested', rootPath: 'C:/nested' }
        const resolvedProject = { branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' }
        const resolveProject = vi.fn().mockResolvedValue(resolvedProject)
        const service = new LocalGitStorageService()
        service.init({ bridge: createBridge({ resolveProject }) })

        await expect(service.resolveProject(project)).resolves.toEqual(resolvedProject)
        expect(resolveProject).toHaveBeenCalledWith(project)
    })

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

    it('tracks committed changes until the branch is pushed', async () => {
        const service = new LocalGitStorageService()
        service.init({ bridge: createBridge() })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const request: CommitRequest = {
            branch: 'main',
            files: [{ content: '# Card', path: 'design/F-1-card.md' }],
            message: 'Update card',
        }

        expect(service.hasPendingPush(project)).toBe(false)

        await service.commit(request)

        expect(service.hasPendingPush(project)).toBe(true)

        await service.push(project)

        expect(service.hasPendingPush(project)).toBe(false)
    })

    it('restores pending push state from the local repository', async () => {
        const hasPendingPush = vi.fn().mockResolvedValue(true)
        const service = new LocalGitStorageService()
        service.init({ bridge: createBridge({ hasPendingPush }) })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await service.loadPendingPush(project)

        expect(hasPendingPush).toHaveBeenCalledWith(project)
        expect(service.hasPendingPush(project)).toBe(true)
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

    it('forwards recursive folder deletion to the bridge unchanged', async () => {
        const deleteFolder = vi.fn().mockResolvedValue(undefined)
        const bridge = createBridge({ deleteFolder })
        const service = new LocalGitStorageService()
        service.init({ bridge })
        const request: DeleteFolderRequest = {
            branch: 'main',
            message: 'Delete design/notes',
            path: 'design/notes',
        }

        await service.deleteFolder(request)

        expect(deleteFolder).toHaveBeenCalledWith(request)
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

    it('forwards agent conversation reference listing to the bridge', async () => {
        const references = ['design/activity/project.json#conversation=conversation-1']
        const listAgentConversationReferences = vi.fn().mockResolvedValue(references)
        const service = new LocalGitStorageService()
        service.init({ bridge: createBridge({ listAgentConversationReferences }) })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await expect(service.listAgentConversationReferences(project, 'design')).resolves.toEqual(references)
        expect(listAgentConversationReferences).toHaveBeenCalledWith(project, 'design')
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
