import { renderHook, waitFor } from '@testing-library/react'
import { createElement, StrictMode, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppBootstrap } from './use_app_bootstrap'
import { LAST_PROJECT_STORAGE_KEY } from '../data/project_session'
import type { ElectronDataBridge } from '../data/electron_data_bridge'
import { getElectronActionBridge, setActionBridgeOverride, type ElectronActionBridge } from '../data/electron_action_bridge'
import { configService } from '../services/config/config_service'
import { agentCapabilitiesService } from '../services/agents/agent_capabilities_service'

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

function createBridge(): ElectronDataBridge {
    const files = [
        { content: '---\nid: F-1\ntitle: Root\nstatus: active\naffects:\n---\n\n# Root', path: 'design/F-1-root.md' },
    ]

    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        hasPendingPush: vi.fn(async () => false),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md']),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadFile: vi.fn(async () => files[0]),
        loadProject: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'design' })),
        loadWorktrees: vi.fn(async () => []),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
        resolveProject: vi.fn(async (project) => project),
        saveProjectConfig: vi.fn(),
        saveWorktrees: vi.fn(async () => []),
        selectWorktreeFolder: vi.fn(async () => null),
        watchProject: vi.fn(() => vi.fn()),
    }
}

function StrictModeWrapper(props: { children: ReactNode }) {
    const { children } = props

    return createElement(StrictMode, null, children)
}

describe('useAppBootstrap', () => {
    afterEach(() => {
        configService.clear()
        setActionBridgeOverride(null)
        window.localStorage.clear()
        delete window.md2Actions
        delete window.md2Data
    })

    it('reaches the ready phase with no session when nothing is stored', async () => {
        const initializeCapabilities = vi.spyOn(agentCapabilitiesService, 'initialize')
        const { result } = renderHook(() => useAppBootstrap(null))

        await waitFor(() => expect(result.current.phase).toBe('ready'))
        expect(initializeCapabilities).toHaveBeenCalledOnce()
        expect(result.current.session).toBeNull()
    })

    it('initializes config once during StrictMode bootstrap without a stored project', async () => {
        const init = vi.spyOn(configService, 'init')
        const { result } = renderHook(() => useAppBootstrap(null), { wrapper: StrictModeWrapper })

        await waitFor(() => expect(result.current.phase).toBe('ready'))
        expect(init).toHaveBeenCalledTimes(1)
        expect(result.current.session).toBeNull()
    })

    it('skips a GitHub project when no access token is available', async () => {
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' },
            storageType: 'github',
        }))

        const { result } = renderHook(() => useAppBootstrap(null))

        await waitFor(() => expect(result.current.phase).toBe('ready'))
        expect(result.current.session).toBeNull()
    })

    it('loads the last local project before becoming ready', async () => {
        const bridge = createBridge()
        vi.mocked(bridge.resolveProject).mockResolvedValue({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' })
        window.md2Data = bridge
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            storageType: 'local',
        }))

        const { result } = renderHook(() => useAppBootstrap(null))

        await waitFor(() => expect(result.current.session).not.toBeNull())
        expect(bridge.resolveProject).toHaveBeenCalledWith({ branch: 'main', id: 'local', rootPath: 'C:/repo' })
        expect(result.current.session?.project.branch).toBe('topic')
        expect(result.current.session?.snapshot.activeCards).toHaveLength(1)
    })

    it('finishes startup without a project when local repository revalidation fails', async () => {
        const bridge = createBridge()
        vi.mocked(bridge.resolveProject).mockRejectedValue(new Error('Stored project folder is no longer a Git work tree'))
        window.md2Data = bridge
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: { branch: 'main', id: 'local', rootPath: 'C:/missing' },
            storageType: 'local',
        }))

        const { result } = renderHook(() => useAppBootstrap(null))

        await waitFor(() => expect(result.current.phase).toBe('ready'))
        expect(result.current.session).toBeNull()
        expect(result.current.error).toBe('Stored project folder is no longer a Git work tree')
    })

    it('restores the preload action bridge when loading the last local project', async () => {
        const staleRemoteBridge = createActionBridge()
        const preloadBridge = createActionBridge()
        setActionBridgeOverride(staleRemoteBridge)
        window.md2Actions = preloadBridge
        window.md2Data = createBridge()
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            storageType: 'local',
        }))

        const { result } = renderHook(() => useAppBootstrap(null))

        await waitFor(() => expect(result.current.session).not.toBeNull())
        expect(getElectronActionBridge()).toBe(preloadBridge)
    })
})
