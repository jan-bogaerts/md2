import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './app'
import { LAST_PROJECT_STORAGE_KEY } from './data/project_session'
import type { ElectronDataBridge } from './data/electron_data_bridge'
import type { StorageService } from './data/data_types'
import { configService, REACT_CONFIG_STORAGE_KEY } from './services/config_service'
import { dataService } from './services/data_service'

vi.mock('./auth/use_github_auth', () => ({
    useGithubAuth: () => ({
        accessToken: null,
        errorMessage: null,
        isAuthenticated: false,
        isLoadingUser: false,
        logout: vi.fn(),
        savePersonalAccessToken: vi.fn(),
        status: 'idle',
        user: null,
    }),
}))

function createFailingBridge(): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        hasPendingPush: vi.fn(async () => false),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositoryFiles: vi.fn(async () => []),
        listTopLevelFolders: vi.fn(async () => []),
        loadActionFiles: vi.fn(async () => []),
        loadFile: vi.fn(async () => ({ content: '', path: 'design/empty.md' })),
        loadProject: vi.fn(async () => {
            throw new Error('repository folder moved')
        }),
        loadProjectRoot: vi.fn(async () => {
            throw new Error('repository folder moved')
        }),
        loadProjectConfig: vi.fn(async () => null),
        loadWorktrees: vi.fn(async () => []),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => null),
        push: vi.fn(),
        resolveProject: vi.fn(async (project) => project),
        saveProjectConfig: vi.fn(),
        saveWorktrees: vi.fn(async () => []),
        selectWorktreeFolder: vi.fn(async () => null),
        watchProject: vi.fn(() => vi.fn()),
    }
}

function createResetStorage(): StorageService {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        hasPendingPush: vi.fn(() => false),
        listBranches: vi.fn(async () => []),
        listRepositories: vi.fn(async () => []),
        listRepositoryFiles: vi.fn(async () => []),
        listTopLevelFolders: vi.fn(async () => []),
        loadActionFiles: vi.fn(async () => []),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        moveFiles: vi.fn(),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
    }
}

describe('App', () => {
    beforeEach(() => {
        window.localStorage.clear()
        configService.init({ desktopConfig: null })
        dataService.init({ storage: createResetStorage() })
    })

    afterEach(() => {
        cleanup()
        configService.clear()
        window.localStorage.clear()
        delete window.md2Data
    })

    it('shows the shell with GitHub authentication reachable once startup finishes', async () => {
        render(<App />)

        fireEvent.click(await screen.findByRole('button', { name: 'GitHub account' }))

        expect(screen.getByLabelText('Personal access token')).toBeInTheDocument()
    })

    it('renders the toolbar theme toggle', async () => {
        render(<App />)

        await screen.findByRole('button', { name: 'GitHub account' })
        expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
    })

    it('shows the startup splash while bootstrapping by default', () => {
        render(<App />)

        expect(screen.getByText('Starting MD²...')).toBeInTheDocument()
    })

    it('skips the startup splash when the preference is disabled', () => {
        window.localStorage.setItem(REACT_CONFIG_STORAGE_KEY, JSON.stringify({ 'react.showStartupSplash': false }))

        render(<App />)

        expect(screen.queryByText('Starting MD²...')).not.toBeInTheDocument()
    })

    it('shows a dismissible restore error when the last project fails to open', async () => {
        window.md2Data = createFailingBridge()
        window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, JSON.stringify({
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            storageType: 'local',
        }))

        render(<App />)

        expect(await screen.findByText('Could not restore last project: repository folder moved')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'No project open' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(screen.queryByText('Could not restore last project: repository folder moved')).toBeNull()
    })

    it('does not show a restore error when no previous project exists', async () => {
        render(<App />)

        expect(await screen.findByRole('heading', { name: 'No project open' })).toBeInTheDocument()
        expect(screen.queryByText(/Could not restore last project/)).toBeNull()
    })
})
