import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import { beforeEach } from 'vitest'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { LAST_PROJECT_STORAGE_KEY } from '../../data/project_session'
import { configureRemoteControlConnection, REMOTE_CONTROL_ENDPOINT_KEY, REMOTE_CONTROL_TOKEN_KEY } from '../../data/remote_control_connection'
import { RemoteControlStorageService } from '../data/remote_control_storage_service'
import { remoteConnectionService } from '../data/remote_connection_service'
import { configService } from '../config/config_service'
import { actionService } from '../actions/action_service'
import { dataService } from '../data/data_service'
import { ProjectSessionService } from './project_session_service'
import { projectPersistenceService } from './project_persistence_service'
import { openFilesService } from '../open_files_service'
import { createDeferred } from '../test_support/data_service_test_support'
import { agentCapabilitiesService } from '../agents/agent_capabilities_service'

function createActionBridge(): ElectronActionBridge {
    return {
        cancelActionRun: vi.fn(async () => {}),
        generateDiff: vi.fn(async () => ({ commit: 'commit-1', files: [] })),
        generateWorktreeDiff: vi.fn(async () => ({ files: [], repositoryRoot: 'C:/worktree' })),
        loadActionRunHistory: vi.fn(async () => []),
        onActionRun: vi.fn(() => () => {}),
        openInEditor: vi.fn(),
        prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        runSearchRegexpAgent: vi.fn(async () => ''),
        startAction: vi.fn(async () => 'action-1'),
    }
}

function createDataBridge(): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        hasPendingPush: vi.fn(async () => false),
        listBranches: vi.fn(async () => []),
        listRepositoryFiles: vi.fn(async () => []),
        listTopLevelFolders: vi.fn(async () => []),
        loadActionFiles: vi.fn(async () => []),
        loadFile: vi.fn(async (_project, path) => ({ content: '', path })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => null),
        push: vi.fn(),
        resolveProject: vi.fn(async (project) => project),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn(() => vi.fn()),
    }
}

function mockProjectOpen() {
    vi.spyOn(dataService, 'init').mockImplementation(() => undefined)
    vi.spyOn(dataService.projectLoading, 'openProject').mockResolvedValue({
        activeCards: [],
        backgroundCards: [],
        repositoryFiles: [],
        workingFolder: 'design',
    })
}

describe('ProjectSessionService storage activation', () => {
    beforeEach(() => {
        remoteConnectionService.disconnect()
        configService.init()
        vi.spyOn(RemoteControlStorageService.prototype, 'connect').mockResolvedValue()
        vi.spyOn(RemoteControlStorageService.prototype, 'getCodexRateLimits').mockResolvedValue(null)
        vi.spyOn(RemoteControlStorageService.prototype, 'loadActiveActionRunEvents').mockResolvedValue([])
        vi.spyOn(RemoteControlStorageService.prototype, 'onActionRun').mockReturnValue(() => undefined)
        vi.spyOn(RemoteControlStorageService.prototype, 'onCodexRateLimits').mockReturnValue(() => undefined)
        vi.spyOn(RemoteControlStorageService.prototype, 'loadDesktopConfig').mockResolvedValue({
            agent: 'custom',
            agentProfiles: [{ command: ['custom'], models: ['custom-model'], name: 'custom' }],
            codexSearchEnabled: true,
            editorCommand: 'code "{{file}}"',
            mergeConflictResolverCommand: '',
            model: 'custom-model',
            permissionMode: 'ask-for-approval',
            thinkingLevel: 'high',
        })
        vi.spyOn(RemoteControlStorageService.prototype, 'loadAgentAvailability')
            .mockResolvedValue({ custom: { available: true, error: null } })
        openFilesService.init({ actionService, dataService })
        projectPersistenceService.init({ actionService, dataService, openFilesService })
    })

    afterEach(() => {
        remoteConnectionService.disconnect()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        configService.clear()
        setActionBridgeOverride(null)
        delete window.md2Actions
        delete window.md2Data
        window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_TOKEN_KEY)
    })

    it('activates remote storage as the action bridge when opening a remote project', async () => {
        mockProjectOpen()
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
        const service = new ProjectSessionService()

        await service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null)

        expect(getElectronActionBridge()).toBeInstanceOf(RemoteControlStorageService)
        expect(configService.getDesktopValues()).toMatchObject({ agent: 'custom', model: 'custom-model', thinkingLevel: 'high' })
    })

    it('reuses an existing remote storage connection when opening a remote project', async () => {
        mockProjectOpen()
        const storage = new RemoteControlStorageService()
        storage.init({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
        const service = new ProjectSessionService()

        await service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null, storage)

        expect(getElectronActionBridge()).toBe(storage)
    })

    it('keeps remote connection activation pending until desktop config and availability are ready', async () => {
        const availability = createDeferred<void>()
        vi.spyOn(agentCapabilitiesService, 'reload').mockReturnValue(availability.promise)
        const storage = new RemoteControlStorageService()
        storage.init({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
        const service = new ProjectSessionService()
        const activation = service.activateRemoteConnection(storage)

        await Promise.resolve()
        expect(storage.loadDesktopConfig).toHaveBeenCalledOnce()
        await vi.waitFor(() => expect(configService.hasDesktopConfig()).toBe(true))
        expect(agentCapabilitiesService.reload).toHaveBeenCalledOnce()

        availability.resolve(undefined)
        await activation
    })

    it('keeps desktop config unavailable and does not open the project when host config loading fails', async () => {
        mockProjectOpen()
        vi.mocked(RemoteControlStorageService.prototype.loadDesktopConfig).mockRejectedValueOnce(new Error('host config unavailable'))
        const storage = new RemoteControlStorageService()
        storage.init({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
        const service = new ProjectSessionService()

        await expect(service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null, storage))
            .rejects.toThrow('Remote desktop config load failed: host config unavailable')
        expect(configService.hasDesktopConfig()).toBe(false)
        expect(dataService.projectLoading.openProject).not.toHaveBeenCalled()
    })

    it('clears remote desktop config and action bridge when the connection closes', async () => {
        mockProjectOpen()
        const storage = new RemoteControlStorageService()
        storage.init({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
        const connectionListeners: Array<(connected: boolean) => void> = []
        vi.spyOn(storage, 'onConnectionChanged').mockImplementation((callback) => {
            connectionListeners.push(callback)

            return () => true
        })
        const service = new ProjectSessionService()
        await service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null, storage)

        for (const listener of connectionListeners) listener(false)

        expect(configService.hasDesktopConfig()).toBe(false)
        expect(getElectronActionBridge()).toBeNull()
    })

    it('restores the preload action bridge when opening a local project after remote storage', async () => {
        mockProjectOpen()
        const preloadBridge = createActionBridge()
        window.md2Actions = preloadBridge
        window.md2Data = createDataBridge()
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
        const service = new ProjectSessionService()
        await service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null)

        await service.openProject('local', { branch: 'main', id: 'local', rootPath: 'C:/repo' }, null)

        expect(getElectronActionBridge()).toBe(preloadBridge)
    })

    it('restores the last local project once after resolving its current reference', async () => {
        mockProjectOpen()
        const bridge = createDataBridge()
        vi.mocked(bridge.resolveProject).mockResolvedValue({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' })
        window.md2Data = bridge
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            storageType: 'local',
        }))
        const service = new ProjectSessionService()

        await service.restoreLastProject(null)

        expect(bridge.resolveProject).toHaveBeenCalledOnce()
        expect(dataService.init).toHaveBeenCalledOnce()
        expect(dataService.projectLoading.openProject).toHaveBeenCalledOnce()
        expect(dataService.projectLoading.openProject).toHaveBeenCalledWith({
            branch: 'topic',
            id: 'C:/repo',
            rootPath: 'C:/repo',
        })
    })

    it('skips the last GitHub project when no restored token exists', async () => {
        mockProjectOpen()
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' },
            storageType: 'github',
        }))
        const service = new ProjectSessionService()

        await service.restoreLastProject(null)

        expect(dataService.init).not.toHaveBeenCalled()
        expect(dataService.projectLoading.openProject).not.toHaveBeenCalled()
    })

    it('restores the preload action bridge when opening a GitHub project after remote storage', async () => {
        mockProjectOpen()
        const preloadBridge = createActionBridge()
        window.md2Actions = preloadBridge
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
        const service = new ProjectSessionService()
        await service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null)
        const config = window.btoa(JSON.stringify({ backgroundShade: 'blue', projectFolder: '', workingFolder: 'design' }))
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({
            content: config,
            encoding: 'base64',
            path: 'md2.config.json',
            sha: 'config-sha',
        })))

        await service.openProject('github', { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }, 'token-1')

        expect(getElectronActionBridge()).toBe(preloadBridge)
    })

    it('does not change the active bridge when listing branches for a secondary local storage', async () => {
        const remoteBridge = createActionBridge()
        setActionBridgeOverride(remoteBridge)
        window.md2Data = createDataBridge()
        const service = new ProjectSessionService()

        await service.listBranches('local', { branch: 'main', id: 'local', rootPath: 'C:/repo' }, null)

        expect(getElectronActionBridge()).toBe(remoteBridge)
    })

    it('reports push progress until pending changes are flushed and pushed', async () => {
        let resolvePush: () => void = () => undefined
        const pendingPush = new Promise<void>((resolve) => {
            resolvePush = resolve
        })
        vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockResolvedValue()
        vi.spyOn(dataService.projectLoading, 'push').mockReturnValue(pendingPush)
        const service = new ProjectSessionService()

        const push = service.push()

        expect(service.getSnapshot()).toMatchObject({ isLoading: true, isPushing: true })
        resolvePush()
        await push
        expect(service.getSnapshot()).toMatchObject({ isLoading: false, isPushing: false })
    })

    it('flushes pending changes for a manual commit', async () => {
        const flushPendingChanges = vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockResolvedValue()
        const service = new ProjectSessionService()

        await service.commit()

        expect(flushPendingChanges).toHaveBeenCalledOnce()
        expect(service.getSnapshot()).toMatchObject({ isCommitting: false, isLoading: false })
    })

    it('reports pull progress while the primary worktree pull runs', async () => {
        const pendingPull = createDeferred<void>()
        vi.spyOn(dataService.projectLoading, 'pull').mockReturnValue(pendingPull.promise)
        const service = new ProjectSessionService()

        const pull = service.pull()

        expect(service.getSnapshot()).toMatchObject({ isLoading: true, isPulling: true })
        pendingPull.resolve()
        await pull
        expect(service.getSnapshot()).toMatchObject({ isLoading: false, isPulling: false })
    })

    it('returns shared project-folder setup when a local repository has no config', async () => {
        const bridge = createDataBridge()
        vi.mocked(bridge.loadProjectConfig).mockResolvedValue(null)
        vi.mocked(bridge.listTopLevelFolders).mockResolvedValue([{ name: 'docs', path: 'docs' }])
        window.md2Data = bridge
        const service = new ProjectSessionService()

        await expect(service.openProject('local', { branch: 'main', id: 'local', rootPath: 'C:/repo' }, null)).resolves.toEqual({
            folders: [{ name: 'docs', path: 'docs' }],
            kind: 'project-folder-setup',
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            storageType: 'local',
        })
    })

    it('returns the same project-folder setup for a GitHub repository without config', async () => {
        const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
            const url = input.toString()
            if (url.includes('/contents/md2.config.json')) return new Response('', { status: 404 })
            if (url.includes('/git/ref/heads/main')) {
                return Response.json({ object: { sha: 'commit-1', type: 'commit' }, ref: 'refs/heads/main' })
            }
            if (url.includes('/git/commits/commit-1')) return Response.json({ sha: 'commit-1', tree: { sha: 'tree-1' } })
            if (url.includes('/git/trees/tree-1')) {
                return Response.json({ tree: [{ path: 'docs', sha: 'tree-docs', type: 'tree' }], truncated: false })
            }

            return new Response('{}', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchImplementation)
        const service = new ProjectSessionService()
        const project = { branch: 'main', id: 'octo/demo', owner: 'octo', repository: 'demo' }

        await expect(service.openProject('github', project, 'token-1')).resolves.toEqual({
            folders: [{ name: 'docs', path: 'docs' }],
            kind: 'project-folder-setup',
            project,
            storageType: 'github',
        })
    })

    it('creates the active template folder and config under the chosen project folder', async () => {
        mockProjectOpen()
        configService.init()
        const bridge = createDataBridge()
        window.md2Data = bridge
        const service = new ProjectSessionService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await service.createProjectFolders({ folders: [], kind: 'project-folder-setup', project, storageType: 'local' }, 'design', null)

        expect(bridge.createProject).toHaveBeenCalledWith(project, 'design/active')
        expect(bridge.commit).toHaveBeenCalledWith({
            branch: 'main',
            files: expect.arrayContaining([
                expect.objectContaining({ path: 'design/actions/complete-card.json' }),
                expect.objectContaining({ path: 'design/actions/fix-bug.json' }),
                expect.objectContaining({ path: 'design/actions/implement.json' }),
                expect.objectContaining({ path: 'design/actions/prep-to-implement.json' }),
            ]),
            message: 'Add default MD² actions',
        })
        expect(bridge.saveProjectConfig).toHaveBeenCalledWith(project, expect.objectContaining({
            backgroundShade: expect.stringMatching(/^(amber|blue|green|purple|red)$/u),
            projectFolder: 'design',
            pushMode: 'manual',
            workingFolder: 'active',
        }))
        expect(dataService.projectLoading.openProject).toHaveBeenCalledWith(project)
    })
})
