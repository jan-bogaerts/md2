import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from './electron_data_bridge'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from './electron_action_bridge'
import { createStorageService } from './project_session'
import { configureRemoteControlConnection, REMOTE_CONTROL_ENDPOINT_KEY, REMOTE_CONTROL_TOKEN_KEY } from './remote_control_connection'

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
                status: 'completed',
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

describe('createStorageService action bridge override', () => {
    afterEach(() => {
        setActionBridgeOverride(null)
        delete window.md2Actions
        delete window.md2Data
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_TOKEN_KEY)
    })

    it('registers remote storage as the action bridge override', () => {
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })

        const storage = createStorageService('remote', null)

        expect(getElectronActionBridge()).toBe(storage)
        expect(window.md2Actions).toBeUndefined()
    })

    it('clears the remote override when switching to GitHub storage', () => {
        const preloadBridge = createActionBridge()
        window.md2Actions = preloadBridge
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
        createStorageService('remote', null)

        createStorageService('github', 'token-1')

        expect(getElectronActionBridge()).toBe(preloadBridge)
    })

    it('clears the remote override when switching to local storage', () => {
        const preloadBridge = createActionBridge()
        window.md2Actions = preloadBridge
        window.md2Data = createDataBridge()
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
        createStorageService('remote', null)

        createStorageService('local', null)

        expect(getElectronActionBridge()).toBe(preloadBridge)
    })
})
