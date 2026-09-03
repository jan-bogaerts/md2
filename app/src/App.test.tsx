import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './app'
import type { StorageService } from './data/data_types'
import {
    ApplicationStartupService,
    type ApplicationStartupDependencies,
} from './services/application_startup_service'
import { configService, REACT_CONFIG_STORAGE_KEY } from './services/config/config_service'
import { dataService } from './services/data/data_service'
import { createDeferred } from './services/test_support/data_service_test_support'

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

function createStartupService(overrides: Partial<ApplicationStartupDependencies> = {}) {
    const dependencies: ApplicationStartupDependencies = {
        getGithubAccessToken: vi.fn(() => null),
        initializeAgentCapabilities: vi.fn(async () => {}),
        initializeServices: vi.fn(),
        restoreGithubSession: vi.fn(async () => {}),
        restoreLastProject: vi.fn(async () => null),
        ...overrides,
    }

    return new ApplicationStartupService(dependencies)
}

function createPendingStartupService() {
    const pendingRestore = createDeferred<null>()

    return createStartupService({ restoreLastProject: vi.fn(() => pendingRestore.promise) })
}

function createFailingStartupService() {
    return createStartupService({
        restoreLastProject: vi.fn(async () => {
            throw new Error('repository folder moved')
        }),
    })
}

function createResetStorage(): StorageService {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
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
    })

    it('shows the shell with GitHub authentication reachable once startup finishes', async () => {
        const startupService = createStartupService()
        void startupService.start()
        render(<App startupService={startupService} />)

        fireEvent.click(await screen.findByRole('button', { name: 'GitHub account' }))

        expect(screen.getByLabelText('Personal access token')).toBeInTheDocument()
    })

    it('renders the toolbar theme toggle', async () => {
        const startupService = createStartupService()
        void startupService.start()
        render(<App startupService={startupService} />)

        await screen.findByRole('button', { name: 'GitHub account' })
        expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
    })

    it('shows the startup splash while bootstrapping by default', () => {
        const startupService = createPendingStartupService()
        void startupService.start()
        render(<App startupService={startupService} />)

        expect(screen.getByText('Starting MD²...')).toBeInTheDocument()
    })

    it('skips the startup splash when the preference is disabled', () => {
        window.localStorage.setItem(REACT_CONFIG_STORAGE_KEY, JSON.stringify({ 'react.showStartupSplash': false }))
        const startupService = createPendingStartupService()
        void startupService.start()

        render(<App startupService={startupService} />)

        expect(screen.queryByText('Starting MD²...')).not.toBeInTheDocument()
    })

    it('shows a dismissible restore error when the last project fails to open', async () => {
        const startupService = createFailingStartupService()
        void startupService.start()
        render(<App startupService={startupService} />)

        expect(await screen.findByText(/repository folder moved/u)).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'No project open' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(screen.queryByText(/repository folder moved/u)).toBeNull()
    })

    it('does not show a restore error when no previous project exists', async () => {
        const startupService = createStartupService()
        void startupService.start()
        render(<App startupService={startupService} />)

        expect(await screen.findByRole('heading', { name: 'No project open' })).toBeInTheDocument()
        expect(screen.queryByText(/Could not restore last project/)).toBeNull()
    })

    it('opens folder setup after startup restores a project with a missing working folder', async () => {
        const resolution = {
            existingFolderPaths: ['design'],
            folders: [{ name: 'design', path: 'design' }],
            hasProjectConfig: true,
            kind: 'project-folder-setup' as const,
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            storageType: 'local' as const,
            values: {
                actionsFolder: 'actions',
                archivedFolder: 'archived',
                diagramsFolder: 'diagrams',
                projectFolder: 'design',
                releasesFolder: 'history',
                workingFolder: 'feature_descriptions',
            },
        }
        const startupService = createStartupService({ restoreLastProject: vi.fn(async () => resolution) })
        void startupService.start()

        render(<App startupService={startupService} />)

        expect(await screen.findByRole('dialog', { name: 'Project folders' })).toBeInTheDocument()
        expect(screen.getByLabelText('Working folder')).toHaveValue('feature_descriptions')
        expect(screen.queryByText(/Could not restore last project/)).toBeNull()
    })
})
