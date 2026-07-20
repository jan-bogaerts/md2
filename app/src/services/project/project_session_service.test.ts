import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import { beforeEach } from 'vitest'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { LAST_PROJECT_STORAGE_KEY } from '../../data/project_session'
import { configureRemoteControlConnection, REMOTE_CONTROL_ENDPOINT_KEY, REMOTE_CONTROL_TOKEN_KEY } from '../../data/remote_control_connection'
import { RemoteControlStorageService } from '../data/remote_control_storage_service'
import { configService } from '../config/config_service'
import { actionService } from '../actions/action_service'
import { dataService } from '../data/data_service'
import { ProjectSessionService } from './project_session_service'
import { projectPersistenceService } from './project_persistence_service'

function createActionBridge(): ElectronActionBridge {
    return {
        cancelActionExecution: vi.fn(async () => {}),
        generateDiff: vi.fn(async () => ({ commit: 'commit-1', files: [] })),
        loadActionRunHistory: vi.fn(async () => []),
        onActionExecution: vi.fn(() => () => {}),
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
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
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
        projectPersistenceService.init({ actionService, dataService })
    })

    afterEach(() => {
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
    })

    it('reuses an existing remote storage connection when opening a remote project', async () => {
        mockProjectOpen()
        const storage = new RemoteControlStorageService()
        storage.init({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
        const service = new ProjectSessionService()

        await service.openProject('remote', { branch: 'main', id: 'remote', rootPath: '/repo' }, null, storage)

        expect(getElectronActionBridge()).toBe(storage)
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

        expect(bridge.createWorkingFolderFromTemplate).toHaveBeenCalledWith(project, 'design/active')
        expect(bridge.saveProjectConfig).toHaveBeenCalledWith(project, expect.objectContaining({
            backgroundShade: expect.stringMatching(/^(amber|blue|green|purple|red)$/u),
            projectFolder: 'design',
            workingFolder: 'active',
        }))
        expect(dataService.projectLoading.openProject).toHaveBeenCalledWith(project)
    })
})
