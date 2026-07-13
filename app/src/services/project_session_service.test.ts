import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../data/electron_data_bridge'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from '../data/electron_action_bridge'
import { LAST_PROJECT_STORAGE_KEY } from '../data/project_session'
import { configureRemoteControlConnection, REMOTE_CONTROL_ENDPOINT_KEY, REMOTE_CONTROL_TOKEN_KEY } from '../data/remote_control_connection'
import { RemoteControlStorageService } from './remote_control_storage_service'
import { configService } from './config_service'
import { dataService } from './data_service'
import { ProjectSessionService } from './project_session_service'

function createActionBridge(): ElectronActionBridge {
    return {
        appendActionRunHistory: vi.fn(async () => []),
        generateDiff: vi.fn(async () => ({ commit: 'commit-1', files: [] })),
        loadActionRunHistory: vi.fn(async () => []),
        openInEditor: vi.fn(),
        runAgent: vi.fn(async () => ({
            command: 'agent',
            conversation: {
                cardPath: 'design/F-1.md',
                completedAt: '2026-01-01T00:00:00.000Z',
                continuedFrom: null,
                events: [],
                id: 'run-1',
                messages: [],
                nativeSessionId: null,
                path: '.md2-agent-logs/run-1.json',
                startedAt: '2026-01-01T00:00:00.000Z',
                status: 'completed' as const,
                title: 'Run',
            },
            exitCode: 0,
            prompt: 'run',
            reference: '.md2-agent-logs/run-1.json',
            runId: 'run-1',
            stderr: '',
            stdout: '',
        })),
        runCommand: vi.fn(async () => ({ command: 'npm test', exitCode: 0, stderr: '', stdout: 'ok' })),
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
