import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../data/electron_data_bridge'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from '../data/electron_action_bridge'
import { LAST_PROJECT_STORAGE_KEY } from '../data/project_session'
import { configureRemoteControlConnection, REMOTE_CONTROL_ENDPOINT_KEY, REMOTE_CONTROL_TOKEN_KEY } from '../data/remote_control_connection'
import { RemoteControlStorageService } from './remote_control_storage_service'
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
        listBranches: vi.fn(async () => []),
        listRepositoryFiles: vi.fn(async () => []),
        listTopLevelFolders: vi.fn(async () => []),
        loadActionFiles: vi.fn(async () => []),
        loadFile: vi.fn(async (_project, path) => ({ content: '', path })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => null),
        push: vi.fn(),
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
})
