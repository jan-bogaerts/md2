import { describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import type { AgentConversation, CommitRequest, DeleteFileRequest, DeleteFolderRequest } from '../../data/data_types'
import { LocalGitStorageService } from './local_git_storage_service'

function createBridge(overrides: Partial<ElectronDataBridge> = {}): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(),
        commit: vi.fn().mockResolvedValue([]),
        createProject: vi.fn(),
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
        loadTextFile: vi.fn().mockResolvedValue({ content: '{"version":2}', path: 'design/activity/card__card-1.json' }),
        loadProjectConfig: vi.fn(),
        moveFiles: vi.fn().mockResolvedValue(undefined),
        openProjectFolder: vi.fn(),
        pull: vi.fn().mockResolvedValue(undefined),
        push: vi.fn().mockResolvedValue(undefined),
        resolveProject: vi.fn(),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn().mockReturnValue(() => undefined),
        ...overrides,
    }
}

describe('LocalGitStorageService binary write path', () => {
    it('forwards project root exclusion to the Electron bridge', async () => {
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const loadProject = vi.fn().mockResolvedValue({ files: [], workingFolder: 'design' })
        const service = new LocalGitStorageService()
        service.init({ bridge: createBridge({ loadProject }) })

        await service.loadProject(project, 'design', 'design/active')

        expect(loadProject).toHaveBeenCalledWith(project, 'design', 'design/active')
    })

    it('routes project watcher failures to the storage error callback', () => {
        let notify: Parameters<ElectronDataBridge['watchProject']>[1] = () => undefined
        const watchProject = vi.fn((_project, callback: Parameters<ElectronDataBridge['watchProject']>[1]) => {
            notify = callback

            return () => undefined
        })
        const service = new LocalGitStorageService()
        service.init({ bridge: createBridge({ watchProject }) })
        const onChange = vi.fn()
        const onError = vi.fn()

        service.watchProject({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, onChange, vi.fn(), onError)
        notify({ error: 'Native watcher unavailable' })

        expect(onChange).not.toHaveBeenCalled()
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Native watcher unavailable' }))
    })

    it('forwards worktree state subscription and cleanup to the bridge', () => {
        const cleanup = vi.fn()
        const onWorktreesChanged = vi.fn(() => cleanup)
        const service = new LocalGitStorageService()
        service.init({ bridge: createBridge({ onWorktreesChanged }) })
        const callback = vi.fn()

        const unsubscribe = service.onWorktreesChanged(callback)
        unsubscribe()

        expect(onWorktreesChanged).toHaveBeenCalledWith(callback)
        expect(cleanup).toHaveBeenCalledOnce()
    })

    it('forwards linked worktree mutations to the bridge', async () => {
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const worktree = { branch: 'feature', error: null, path: 'C:/feature', valid: true }
        const addWorktree = vi.fn().mockResolvedValue(undefined)
        const commitWorktree = vi.fn().mockResolvedValue(undefined)
        const discardWorktreeChanges = vi.fn().mockResolvedValue(undefined)
        const deleteLocalBranch = vi.fn().mockResolvedValue(undefined)
        const integrateWorktree = vi.fn().mockResolvedValue({ status: 'completed' })
        const parkWorktree = vi.fn().mockResolvedValue(undefined)
        const prepareWorktree = vi.fn().mockResolvedValue(undefined)
        const pullWorktree = vi.fn().mockResolvedValue(undefined)
        const pushWorktree = vi.fn().mockResolvedValue(undefined)
        const refreshWorktrees = vi.fn().mockResolvedValue(undefined)
        const removeWorktree = vi.fn().mockResolvedValue(undefined)
        const selectWorktreeFolder = vi.fn().mockResolvedValue('C:/feature')
        const service = new LocalGitStorageService()
        service.init({
            bridge: createBridge({
                addWorktree, commitWorktree, deleteLocalBranch, discardWorktreeChanges, integrateWorktree, parkWorktree, prepareWorktree,
                pullWorktree, pushWorktree, refreshWorktrees, removeWorktree, selectWorktreeFolder,
            }),
        })
        const preparationRequest = { branchName: 'card-title', project, worktree: 1 }
        const operationRequest = { project, worktree: 1 }
        const commitRequest = { ...operationRequest, message: 'F-1: Card' }

        await expect(service.selectWorktreeFolder()).resolves.toBe('C:/feature')
        await expect(service.addWorktree(project, worktree.path)).resolves.toBeUndefined()
        await expect(service.commitWorktree(commitRequest)).resolves.toBeUndefined()
        await expect(service.discardWorktreeChanges(operationRequest)).resolves.toBeUndefined()
        await expect(service.deleteLocalBranch(project, 'feature')).resolves.toBeUndefined()
        await expect(service.integrateWorktree(operationRequest)).resolves.toEqual({ status: 'completed' })
        await expect(service.parkWorktree(operationRequest)).resolves.toBeUndefined()
        await expect(service.prepareWorktree(preparationRequest)).resolves.toBeUndefined()
        await expect(service.pullWorktree(operationRequest)).resolves.toBeUndefined()
        await expect(service.pushWorktree(operationRequest)).resolves.toBeUndefined()
        await expect(service.refreshWorktrees(project)).resolves.toBeUndefined()
        await expect(service.removeWorktree(project, worktree.path, 'unregister')).resolves.toBeUndefined()
        expect(selectWorktreeFolder).toHaveBeenCalledOnce()
        expect(addWorktree).toHaveBeenCalledWith(project, worktree.path)
        expect(commitWorktree).toHaveBeenCalledWith(commitRequest)
        expect(discardWorktreeChanges).toHaveBeenCalledWith(operationRequest)
        expect(deleteLocalBranch).toHaveBeenCalledWith(project, 'feature')
        expect(integrateWorktree).toHaveBeenCalledWith(operationRequest)
        expect(service.hasPendingPush(project)).toBe(true)
        expect(parkWorktree).toHaveBeenCalledWith(operationRequest)
        expect(prepareWorktree).toHaveBeenCalledWith(preparationRequest)
        expect(pullWorktree).toHaveBeenCalledWith(operationRequest)
        expect(pushWorktree).toHaveBeenCalledWith(operationRequest)
        expect(refreshWorktrees).toHaveBeenCalledWith(project)
        expect(removeWorktree).toHaveBeenCalledWith(project, worktree.path, 'unregister')
    })

    it('forwards merge conflict lifecycle and subscription to the bridge', async () => {
        const session = {
            conflictedPaths: ['src/file.ts'], externalResolverConfigured: true, id: 'session-1',
            operation: 'rebase' as const, phase: 'rebase' as const, repositoryRoot: 'C:/repo', worktree: 1,
        }
        const abortMergeConflict = vi.fn().mockResolvedValue(undefined)
        const continueMergeConflict = vi.fn().mockResolvedValue({ status: 'completed' })
        const getMergeConflictSession = vi.fn().mockResolvedValue(session)
        const launchMergeConflictResolver = vi.fn().mockResolvedValue(undefined)
        const markMergeConflictResolved = vi.fn().mockResolvedValue({ ...session, conflictedPaths: [] })
        const cleanup = vi.fn()
        const onMergeConflictSessionChanged = vi.fn(() => cleanup)
        const rescanMergeConflict = vi.fn().mockResolvedValue(session)
        const service = new LocalGitStorageService()
        service.init({
            bridge: createBridge({
                abortMergeConflict, continueMergeConflict, getMergeConflictSession, launchMergeConflictResolver,
                markMergeConflictResolved, onMergeConflictSessionChanged, rescanMergeConflict,
            }),
        })
        const sessionRequest = { sessionId: session.id }
        const pathRequest = { path: session.conflictedPaths[0], sessionId: session.id }
        const callback = vi.fn()

        await expect(service.getMergeConflictSession()).resolves.toEqual(session)
        await expect(service.launchMergeConflictResolver(pathRequest)).resolves.toBeUndefined()
        await expect(service.markMergeConflictResolved(pathRequest)).resolves.toMatchObject({ conflictedPaths: [] })
        await expect(service.rescanMergeConflict(sessionRequest)).resolves.toEqual(session)
        await expect(service.continueMergeConflict(sessionRequest)).resolves.toEqual({ status: 'completed' })
        await expect(service.abortMergeConflict(sessionRequest)).resolves.toBeUndefined()
        const unsubscribe = service.onMergeConflictSessionChanged(callback)
        unsubscribe()

        expect(onMergeConflictSessionChanged).toHaveBeenCalledWith(callback)
        expect(cleanup).toHaveBeenCalledOnce()
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

    it('forwards primary pull to the bridge', async () => {
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const pull = vi.fn().mockResolvedValue(undefined)
        const service = new LocalGitStorageService()
        service.init({ bridge: createBridge({ pull }) })

        await expect(service.pull(project)).resolves.toBeUndefined()

        expect(pull).toHaveBeenCalledWith(project)
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

    it('forwards repository text file reads to the bridge unchanged', async () => {
        const path = 'design/activity/card__card-1.json'
        const loadTextFile = vi.fn().mockResolvedValue({ content: '{"version":2}', path })
        const bridge = createBridge({ loadTextFile })
        const service = new LocalGitStorageService()
        service.init({ bridge })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await expect(service.loadTextFile(project, path)).resolves.toEqual({ content: '{"version":2}', path })
        expect(loadTextFile).toHaveBeenCalledWith(project, path)
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

    it('forwards activity-file conversation loading to the bridge', async () => {
        const conversations: AgentConversation[] = []
        const loadActivityConversations = vi.fn().mockResolvedValue(conversations)
        const service = new LocalGitStorageService()
        service.init({ bridge: createBridge({ loadActivityConversations }) })
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        const path = 'design/activity/card__card-1.json'

        await expect(service.loadActivityConversations(project, path)).resolves.toEqual(conversations)
        expect(loadActivityConversations).toHaveBeenCalledWith(path)
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
