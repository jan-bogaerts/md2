import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import { DEFAULT_PROJECT_CONFIG, MissingWorkingFolderError } from '../../data/data_types'
import { beforeEach } from 'vitest'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { getElectronClaudeRuntimeBridge, setClaudeRuntimeBridgeOverride } from '../../data/electron_claude_runtime_bridge'
import { LAST_PROJECT_STORAGE_KEY } from '../../data/project_session'
import { configureRemoteControlConnection, REMOTE_CONTROL_ENDPOINT_KEY } from '../../data/remote_control_connection'
import { RemoteControlStorageService } from '../data/remote_control_storage_service'
import { remoteConnectionService } from '../data/remote_connection_service'
import { configService } from '../config/config_service'
import { actionService } from '../actions/action_service'
import { dataService } from '../data/data_service'
import { ProjectSessionService, requireProjectFolderValues } from './project_session_service'
import { projectPersistenceService } from './project_persistence_service'
import { openFilesService } from '../open_files_service'
import { createDeferred } from '../test_support/data_service_test_support'
import { agentCapabilitiesService } from '../agents/agent_capabilities_service'
import { claudeRateLimitService } from '../agents/claude_rate_limit_service'
import { projectAccessService, READ_ONLY_PROJECT_ERROR } from './project_access_service'

const DEFAULT_FOLDER_VALUES = {
    actionsFolder: 'actions',
    archivedFolder: 'archived',
    diagramsFolder: 'diagrams',
    projectFolder: 'design',
    releasesFolder: 'history',
    workingFolder: 'active',
}

describe('project folder validation', () => {
    it('rejects absolute project and sub-folder values', () => {
        expect(() => requireProjectFolderValues({ ...DEFAULT_FOLDER_VALUES, projectFolder: 'C:\\repo\\design' }))
            .toThrow('Project folder must be a root folder name')
        expect(() => requireProjectFolderValues({ ...DEFAULT_FOLDER_VALUES, workingFolder: '/outside' }))
            .toThrow('Working folder must stay inside the project folder')
    })
})

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
        vi.spyOn(RemoteControlStorageService.prototype, 'getClaudeRateLimits').mockResolvedValue(null)
        vi.spyOn(RemoteControlStorageService.prototype, 'getCodexRateLimits').mockResolvedValue(null)
        vi.spyOn(RemoteControlStorageService.prototype, 'loadActionRunRecoverySnapshot')
            .mockResolvedValue({ activeRunEvents: [], terminalResults: [] })
        vi.spyOn(RemoteControlStorageService.prototype, 'onActionRun').mockReturnValue(() => undefined)
        vi.spyOn(RemoteControlStorageService.prototype, 'onClaudeRateLimits').mockReturnValue(() => undefined)
        vi.spyOn(RemoteControlStorageService.prototype, 'onCodexRateLimits').mockReturnValue(() => undefined)
        vi.spyOn(claudeRateLimitService, 'start')
        vi.spyOn(RemoteControlStorageService.prototype, 'loadDesktopConfig').mockResolvedValue({
            agentSelection: { activeAgent: 'custom', permissionMode: 'ask-for-approval', settingsByAgent: { custom: { model: 'custom-model', thinkingLevel: 'high' } } },
            agentProfiles: [{ command: ['custom'], defaultThinkingLevel: 'none', models: ['custom-model'], name: 'custom' }],
            codexSearchEnabled: true,
            editorCommand: 'code "{{file}}"',
            mergeConflictResolverCommand: '',
            remoteControlPort: 20877,
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
        setClaudeRuntimeBridgeOverride(null)
        delete window.md2Actions
        delete window.md2Config
        delete window.md2Data
        window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
        projectAccessService.setReadOnly(false)
    })

    it('activates remote storage as the action and Claude runtime bridges when opening a remote project', async () => {
        mockProjectOpen()
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234' })
        const service = new ProjectSessionService()

        await service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null)

        expect(getElectronActionBridge()).toBeInstanceOf(RemoteControlStorageService)
        expect(getElectronClaudeRuntimeBridge()).toBeInstanceOf(RemoteControlStorageService)
        expect(claudeRateLimitService.start).toHaveBeenCalled()
        expect(configService.getDesktopValues()).toMatchObject({
            agentSelection: {
                activeAgent: 'custom',
                settingsByAgent: { custom: { model: 'custom-model', thinkingLevel: 'high' } },
            },
        })
    })

    it('reuses an existing remote storage connection when opening a remote project', async () => {
        mockProjectOpen()
        const storage = new RemoteControlStorageService()
        storage.init({ endpoint: 'ws://127.0.0.1:1234' })
        const service = new ProjectSessionService()

        await service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null, storage)

        expect(getElectronActionBridge()).toBe(storage)
    })

    it('keeps remote connection activation pending until desktop config and availability are ready', async () => {
        const availability = createDeferred<void>()
        vi.spyOn(agentCapabilitiesService, 'reload').mockReturnValue(availability.promise)
        const storage = new RemoteControlStorageService()
        storage.init({ endpoint: 'ws://127.0.0.1:1234' })
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
        storage.init({ endpoint: 'ws://127.0.0.1:1234' })
        const service = new ProjectSessionService()

        await expect(service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null, storage))
            .rejects.toThrow('Remote desktop config load failed: host config unavailable')
        expect(configService.hasDesktopConfig()).toBe(false)
        expect(dataService.projectLoading.openProject).not.toHaveBeenCalled()
    })

    it('clears remote desktop config, action bridge, and Claude runtime bridge when connection closes', async () => {
        mockProjectOpen()
        const storage = new RemoteControlStorageService()
        storage.init({ endpoint: 'ws://127.0.0.1:1234' })
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
        expect(getElectronClaudeRuntimeBridge()).toBeNull()
    })

    it('restores the preload action bridge when opening a local project after remote storage', async () => {
        mockProjectOpen()
        const preloadBridge = createActionBridge()
        window.md2Actions = preloadBridge
        window.md2Data = createDataBridge()
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234' })
        const service = new ProjectSessionService()
        await service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null)

        await service.openProject('local', { branch: 'main', id: 'local', rootPath: 'C:/repo' }, null)

        expect(getElectronActionBridge()).toBe(preloadBridge)
    })

    it('restores the last local project once after resolving its current reference', async () => {
        mockProjectOpen()
        const desktopConfig = {
            agentSelection: { activeAgent: 'codex', permissionMode: 'ask-for-approval' as const, settingsByAgent: { codex: { model: 'gpt-5', thinkingLevel: 'high' as const } } },
            agentProfiles: [{ command: ['codex'], defaultThinkingLevel: 'none' as const, models: ['gpt-5'], name: 'codex' }],
            codexSearchEnabled: true,
            editorCommand: 'code "{{file}}"',
            mergeConflictResolverCommand: '',
            remoteControlPort: 20877,
        }
        const bridge = createDataBridge()
        vi.mocked(bridge.resolveProject).mockResolvedValue({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' })
        window.md2Config = {
            getDesktopConfig: () => desktopConfig,
            setDesktopConfig: vi.fn(async (values) => values),
        }
        window.md2Data = bridge
        configService.init({ desktopConfig })
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
        expect(configService.hasDesktopConfig()).toBe(true)
        expect(configService.getDesktopValues()).toEqual(desktopConfig)
    })

    it('returns folder setup when restored local project has a missing working folder', async () => {
        vi.spyOn(dataService, 'init').mockImplementation(() => undefined)
        vi.spyOn(dataService.projectLoading, 'openProject').mockImplementation(async () => {
            configService.loadProjectConfig({ ...DEFAULT_PROJECT_CONFIG, workingFolder: 'feature_descriptions' })
            throw new MissingWorkingFolderError('design/feature_descriptions')
        })
        const bridge = createDataBridge()
        vi.mocked(bridge.loadProjectConfig).mockResolvedValue({
            ...DEFAULT_PROJECT_CONFIG,
            workingFolder: 'feature_descriptions',
        })
        vi.mocked(bridge.listRepositoryFiles).mockResolvedValue(['design/archived/README.md'])
        vi.mocked(bridge.listTopLevelFolders).mockResolvedValue([{ name: 'design', path: 'design' }])
        window.md2Data = bridge
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({ project, storageType: 'local' }))
        const service = new ProjectSessionService()

        await expect(service.restoreLastProject(null)).resolves.toMatchObject({
            existingFolderPaths: ['design', 'design/archived'],
            hasProjectConfig: true,
            kind: 'project-folder-setup',
            project,
            storageType: 'local',
            values: { projectFolder: 'design', workingFolder: 'feature_descriptions' },
        })
    })

    it('restores the desktop active project instead of a stale stored remote project', async () => {
        mockProjectOpen()
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234' })
        const storedProject = { branch: 'main', id: 'stale', rootPath: 'C:/stale' }
        const activeProject = { branch: 'topic', id: 'active', rootPath: 'C:/active' }
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: storedProject,
            storageType: 'remote',
        }))
        const getActiveProject = vi.spyOn(RemoteControlStorageService.prototype, 'getActiveProject')
            .mockResolvedValue(activeProject)
        const service = new ProjectSessionService()

        await service.restoreLastProject(null)

        expect(getActiveProject).toHaveBeenCalledOnce()
        expect(dataService.projectLoading.openProject).toHaveBeenCalledOnce()
        expect(dataService.projectLoading.openProject).toHaveBeenCalledWith(activeProject)
        expect(JSON.parse(window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY) ?? '{}')).toEqual({
            project: activeProject,
            storageType: 'remote',
        })
    })

    it('falls back to the stored remote project when the desktop has no active project', async () => {
        mockProjectOpen()
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234' })
        const storedProject = { branch: 'main', id: 'stored', rootPath: 'C:/stored' }
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: storedProject,
            storageType: 'remote',
        }))
        vi.spyOn(RemoteControlStorageService.prototype, 'getActiveProject').mockResolvedValue(null)
        const service = new ProjectSessionService()

        await service.restoreLastProject(null)

        expect(dataService.projectLoading.openProject).toHaveBeenCalledOnce()
        expect(dataService.projectLoading.openProject).toHaveBeenCalledWith(storedProject)
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

    it('opens a public GitHub project with default config as read-only', async () => {
        mockProjectOpen()
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
        const service = new ProjectSessionService()
        const project = { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }

        await expect(service.openProject('github-readonly', project, 'token-1')).resolves.toBeNull()

        expect(service.isReadOnly).toBe(true)
        expect(JSON.parse(window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY) ?? '{}')).toEqual({
            project,
            storageType: 'github-readonly',
        })
    })

    it('restores public GitHub access mode as read-only', async () => {
        mockProjectOpen()
        const project = { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({ project, storageType: 'github-readonly' }))
        const service = new ProjectSessionService()

        await service.restoreLastProject('token-1')

        expect(service.isReadOnly).toBe(true)
        expect(dataService.projectLoading.openProject).toHaveBeenCalledWith(project)
    })

    it('blocks direct session mutations while public project is read-only', async () => {
        projectAccessService.setReadOnly(true)
        const service = new ProjectSessionService()

        await expect(service.commit()).rejects.toThrow(READ_ONLY_PROJECT_ERROR)
        await expect(service.push()).rejects.toThrow(READ_ONLY_PROJECT_ERROR)
        await expect(service.pull()).rejects.toThrow(READ_ONLY_PROJECT_ERROR)
        await expect(service.createCard({ body: '', title: 'Blocked', type: 'feature' }, 'new')).rejects.toThrow(READ_ONLY_PROJECT_ERROR)
        await expect(service.completeRelease('v1', [])).rejects.toThrow(READ_ONLY_PROJECT_ERROR)
    })

    it('restores the preload action bridge when opening a GitHub project after remote storage', async () => {
        mockProjectOpen()
        const preloadBridge = createActionBridge()
        window.md2Actions = preloadBridge
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234' })
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

    it('reports card creation separately from project-wide loading', async () => {
        const pendingCreation = createDeferred<void>()
        vi.spyOn(dataService.cards, 'createCard').mockImplementation(async () => {
            await pendingCreation.promise

            return { content: '', path: 'design/F-4-new-card.md' }
        })
        const service = new ProjectSessionService()
        const changed = vi.fn()
        const cardCreationChanged = vi.fn()
        service.addEventListener('changed', changed)
        service.addEventListener('cardCreationChanged', cardCreationChanged)

        const creation = service.createCard({ body: '', title: 'New Card', type: 'feature' }, 'new')

        expect(service.getSnapshot().isLoading).toBe(false)
        expect(service.getCardCreationSnapshot().isCreatingCard).toBe(true)
        expect(changed).not.toHaveBeenCalled()
        expect(cardCreationChanged).toHaveBeenCalledOnce()

        pendingCreation.resolve()
        await creation
        expect(service.getCardCreationSnapshot().isCreatingCard).toBe(false)
        expect(cardCreationChanged).toHaveBeenCalledTimes(2)
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
            existingFolderPaths: [],
            folders: [{ name: 'docs', path: 'docs' }],
            hasProjectConfig: false,
            kind: 'project-folder-setup',
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            storageType: 'local',
            values: {
                actionsFolder: 'actions',
                archivedFolder: 'archived',
                diagramsFolder: 'diagrams',
                projectFolder: 'design',
                releasesFolder: 'history',
                workingFolder: 'active',
            },
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
            existingFolderPaths: [],
            folders: [{ name: 'docs', path: 'docs' }],
            hasProjectConfig: false,
            kind: 'project-folder-setup',
            project,
            storageType: 'github',
            values: {
                actionsFolder: 'actions',
                archivedFolder: 'archived',
                diagramsFolder: 'diagrams',
                projectFolder: 'design',
                releasesFolder: 'history',
                workingFolder: 'active',
            },
        })
    })

    it('creates the active template folder and config under the chosen project folder', async () => {
        mockProjectOpen()
        configService.init()
        const bridge = createDataBridge()
        window.md2Data = bridge
        const service = new ProjectSessionService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await service.confirmProjectFolderSetup(
            {
                existingFolderPaths: [],
                folders: [],
                hasProjectConfig: false,
                kind: 'project-folder-setup',
                project,
                storageType: 'local',
                values: DEFAULT_FOLDER_VALUES,
            },
            DEFAULT_FOLDER_VALUES,
            null,
        )

        expect(bridge.createProject).toHaveBeenCalledWith(
            project,
            ['design/active', 'design/archived', 'design/actions', 'design/history', 'design/diagrams'],
        )
        expect(bridge.commit).toHaveBeenCalledWith({
            branch: 'main',
            files: expect.arrayContaining([
                expect.objectContaining({ path: 'design/actions/complete.json' }),
                expect.objectContaining({ path: 'design/actions/fix-bug.json' }),
                expect.objectContaining({ path: 'design/actions/implement.json' }),
                expect.objectContaining({ path: 'design/actions/plan.json' }),
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

    it('seeds only missing default actions and leaves existing folders untouched', async () => {
        mockProjectOpen()
        configService.init()
        const bridge = createDataBridge()
        vi.mocked(bridge.listRepositoryFiles).mockResolvedValue([
            'design/actions/complete.json',
            'design/active/README.md',
            'design/archived/README.md',
            'design/history/README.md',
            'design/diagrams/README.md',
        ])
        window.md2Data = bridge
        const service = new ProjectSessionService()
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        await service.confirmProjectFolderSetup(
            {
                existingFolderPaths: ['design', 'design/actions', 'design/active', 'design/archived', 'design/history', 'design/diagrams'],
                folders: [{ name: 'design', path: 'design' }],
                hasProjectConfig: false,
                kind: 'project-folder-setup',
                project,
                storageType: 'local',
                values: DEFAULT_FOLDER_VALUES,
            },
            DEFAULT_FOLDER_VALUES,
            null,
        )

        expect(bridge.createProject).toHaveBeenCalledWith(project, [])
        const commitRequest = vi.mocked(bridge.commit).mock.calls[0][0]
        expect(commitRequest.files.some(({ path }) => path === 'design/actions/complete.json')).toBe(false)
        expect(commitRequest.files).toContainEqual(expect.objectContaining({ path: 'design/actions/implement.json' }))
    })

    it('waits for an in-flight draft image save before cancellation deletes the asset', async () => {
        const savedImage = createDeferred<{ fileName: string; path: string }>()
        vi.spyOn(dataService.cards, 'savePastedImageForNewCard').mockReturnValue(savedImage.promise)
        const deleteImage = vi.spyOn(dataService.cards, 'deletePastedImage').mockResolvedValue()
        const service = new ProjectSessionService()
        const insertMarkdown = vi.fn()

        const paste = service.pasteNewCardImage({ type: 'image/png' } as File, insertMarkdown)
        const discard = service.discardNewCardDraftImages()
        expect(service.hasNewCardDraftImages()).toBe(true)
        expect(deleteImage).not.toHaveBeenCalled()

        savedImage.resolve({ fileName: 'saved.png', path: 'design/saved.png' })
        await paste
        await discard

        expect(insertMarkdown).toHaveBeenCalledWith('![pasted image](<saved.png>)')
        expect(deleteImage).toHaveBeenCalledWith('design/saved.png')
        expect(service.hasNewCardDraftImages()).toBe(false)
    })

    it('transfers draft image ownership only after successful card creation', async () => {
        vi.spyOn(dataService.cards, 'savePastedImageForNewCard').mockResolvedValue({
            fileName: 'saved.png',
            path: 'design/saved.png',
        })
        vi.spyOn(dataService.cards, 'createCard').mockResolvedValue({ content: '', path: 'design/F-1-card.md' })
        const deleteImage = vi.spyOn(dataService.cards, 'deletePastedImage').mockResolvedValue()
        const service = new ProjectSessionService()
        await service.pasteNewCardImage({ type: 'image/png' } as File, vi.fn())

        await service.createCard({ body: '![pasted image](<saved.png>)', title: 'Card', type: 'feature' }, 'new')
        await service.discardNewCardDraftImages()

        expect(deleteImage).not.toHaveBeenCalled()
        expect(service.hasNewCardDraftImages()).toBe(false)
    })

    it('keeps failed draft image deletions owned so cancellation can retry', async () => {
        vi.spyOn(dataService.cards, 'savePastedImageForNewCard').mockResolvedValue({
            fileName: 'saved.png',
            path: 'design/saved.png',
        })
        const deletionError = new Error('delete failed')
        vi.spyOn(dataService.cards, 'deletePastedImage').mockRejectedValue(deletionError)
        const service = new ProjectSessionService()
        await service.pasteNewCardImage({ type: 'image/png' } as File, vi.fn())

        await expect(service.discardNewCardDraftImages()).rejects.toBe(deletionError)

        expect(service.hasNewCardDraftImages()).toBe(true)
    })

    it('waits for copied draft attachments and removes them during cancellation', async () => {
        const savedAttachments = createDeferred<Array<{ fileName: string; path: string }>>()
        vi.spyOn(dataService.cards, 'copyAttachmentsForNewCard').mockReturnValue(savedAttachments.promise)
        const deleteAttachments = vi.spyOn(dataService.cards, 'deleteCopiedAttachments').mockResolvedValue()
        const service = new ProjectSessionService()

        const copy = service.copyNewCardAttachments([{ name: 'report.pdf' } as File])
        const discard = service.discardNewCardDraftAssets()
        expect(service.hasNewCardDraftAssets()).toBe(true)
        expect(deleteAttachments).not.toHaveBeenCalled()

        savedAttachments.resolve([{ fileName: 'report.pdf', path: 'design/report.pdf' }])
        await copy
        await discard

        expect(deleteAttachments).toHaveBeenCalledWith(['design/report.pdf'])
        expect(service.hasNewCardDraftAssets()).toBe(false)
    })

    it('transfers copied draft attachment ownership only after card creation succeeds', async () => {
        vi.spyOn(dataService.cards, 'copyAttachmentsForNewCard').mockResolvedValue([
            { fileName: 'report.pdf', path: 'design/report.pdf' },
        ])
        vi.spyOn(dataService.cards, 'createCard').mockResolvedValue({ content: '', path: 'design/F-1-card.md' })
        const deleteAttachments = vi.spyOn(dataService.cards, 'deleteCopiedAttachments').mockResolvedValue()
        const service = new ProjectSessionService()
        await service.copyNewCardAttachments([{ name: 'report.pdf' } as File])

        await service.createCard({ body: '[report](<report.pdf>)', title: 'Card', type: 'feature' }, 'new')
        await service.discardNewCardDraftAssets()

        expect(deleteAttachments).not.toHaveBeenCalled()
        expect(service.hasNewCardDraftAssets()).toBe(false)
    })
})
