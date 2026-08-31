import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from './electron_data_bridge'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from './electron_action_bridge'
import { createStorageService, LAST_PROJECT_STORAGE_KEY, readLastProject } from './project_session'
import { configureRemoteControlConnection, REMOTE_CONTROL_ENDPOINT_KEY } from './remote_control_connection'

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
        loadProjectConfig: vi.fn(async () => null),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => null),
        push: vi.fn(),
        resolveProject: vi.fn(async (project) => project),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn(() => vi.fn()),
    }
}

describe('createStorageService', () => {
    afterEach(() => {
        setActionBridgeOverride(null)
        delete window.md2Actions
        delete window.md2Data
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
    })

    it('does not register remote storage as the action bridge override', () => {
        const preloadBridge = createActionBridge()
        window.md2Actions = preloadBridge
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234' })

        createStorageService('remote', null)

        expect(getElectronActionBridge()).toBe(preloadBridge)
        expect(window.md2Actions).toBe(preloadBridge)
    })

    it('does not clear an existing override when creating GitHub storage', () => {
        const overrideBridge = createActionBridge()
        setActionBridgeOverride(overrideBridge)

        createStorageService('github', 'token-1')

        expect(getElectronActionBridge()).toBe(overrideBridge)
    })

    it('creates distinct read-only GitHub storage', () => {
        const storage = createStorageService('github-readonly', 'token-1')

        expect(storage).toMatchObject({ isReadOnly: true })
    })

    it('does not clear an existing override when creating local storage', () => {
        const overrideBridge = createActionBridge()
        setActionBridgeOverride(overrideBridge)
        window.md2Data = createDataBridge()

        createStorageService('local', null)

        expect(getElectronActionBridge()).toBe(overrideBridge)
    })
})

describe('readLastProject', () => {
    afterEach(() => {
        window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY)
    })

    it('removes garbage JSON and returns no project', () => {
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, '{bad-json')

        expect(readLastProject()).toBeNull()
        expect(window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY)).toBeNull()
    })

    it('removes invalid project shapes and returns no project', () => {
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: { id: 'local' },
            storageType: 'folder',
        }))

        expect(readLastProject()).toBeNull()
        expect(window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY)).toBeNull()
    })

    it('returns valid stored project data', () => {
        const lastProject = {
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            storageType: 'local',
        }
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify(lastProject))

        expect(readLastProject()).toEqual(lastProject)
        expect(JSON.parse(window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY) ?? '{}')).toEqual(lastProject)
    })

    it('keeps read-only GitHub storage type during restoration', () => {
        const lastProject = {
            project: { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' },
            storageType: 'github-readonly',
        }
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify(lastProject))

        expect(readLastProject()).toEqual(lastProject)
    })
})
