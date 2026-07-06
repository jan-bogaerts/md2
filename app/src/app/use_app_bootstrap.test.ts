import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppBootstrap } from './use_app_bootstrap'
import { LAST_PROJECT_STORAGE_KEY } from '../data/project_session'
import type { ElectronDataBridge } from '../data/electron_data_bridge'
import { configService } from '../services/config_service'

function createBridge(): ElectronDataBridge {
    const files = [
        { content: '---\nid: F-1\ntitle: Root\nstatus: active\naffects:\n---\n\n# Root', path: 'design/F-1-root.md' },
    ]

    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(),
        createProject: vi.fn(async (project) => project),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md']),
        loadActionFiles: vi.fn(async () => []),
        loadProject: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn(() => vi.fn()),
    }
}

describe('useAppBootstrap', () => {
    afterEach(() => {
        configService.clear()
        window.localStorage.clear()
        delete window.md2Data
    })

    it('reaches the ready phase with no session when nothing is stored', async () => {
        const { result } = renderHook(() => useAppBootstrap(null))

        await waitFor(() => expect(result.current.phase).toBe('ready'))
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
        window.md2Data = createBridge()
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            storageType: 'local',
        }))

        const { result } = renderHook(() => useAppBootstrap(null))

        await waitFor(() => expect(result.current.session).not.toBeNull())
        expect(result.current.session?.snapshot.activeCards).toHaveLength(1)
    })
})
