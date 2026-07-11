import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseGithubAuthResult } from '../../../auth/use_github_auth'
import type { StorageService } from '../../../data/data_types'
import type { ElectronDataBridge } from '../../../data/electron_data_bridge'
import { configService } from '../../../services/config_service'
import { dataService } from '../../../services/data_service'
import { workspaceViewService } from '../../../services/workspace_view_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { DialogDisplay } from '../../dialog_display'
import { AppMenu } from './app_menu'

const auth: UseGithubAuthResult = {
    accessToken: null,
    authMethod: null,
    deviceCode: null,
    errorMessage: null,
    isAuthenticated: false,
    isDeviceFlowAvailable: true,
    isLoadingUser: false,
    login: vi.fn(),
    logout: vi.fn(),
    savePersonalAccessToken: vi.fn(),
    status: 'idle',
    user: null,
}

function createBridge(): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositoryFiles: vi.fn(async () => []),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadFile: vi.fn(async () => ({ content: '', path: 'design/empty.md' })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'design' })),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
        resolveProject: vi.fn(async (project) => project),
        saveProjectConfig: vi.fn(),
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

function renderMenu() {
    return render(
        <AppThemeProvider>
            <DialogDisplay />
            <AppMenu
                accessToken="token"
                auth={auth}
                extraActions={null}
                isGithubAuthenticated={false}
                isMobile={false}
                onOpenConfig={vi.fn()}
                onOpenMobileMenu={vi.fn()}
                search={<input aria-label="Search project" />}
            />
        </AppThemeProvider>,
    )
}

async function openLocalProject() {
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open project' })).toBeNull())
}

describe('AppMenu', () => {
    beforeEach(() => {
        configService.init({ desktopConfig: null })
        dataService.init({ storage: createResetStorage() })
        workspaceViewService.setViewMode('cards')
        const { selectedPath } = workspaceViewService.getSnapshot()
        if (selectedPath) workspaceViewService.clearSelectedPath(selectedPath)
    })

    afterEach(() => {
        cleanup()
        configService.clear()
        window.localStorage.clear()
        delete window.md2Data
        vi.restoreAllMocks()
    })

    it('renders the requested top-level menu tabs and home sections', () => {
        renderMenu()

        expect(screen.getByRole('tab', { name: 'Home' })).toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Edit' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Format' })).not.toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Options' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Open project' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cards view' })).toHaveTextContent('Board')
        expect(screen.getByRole('button', { name: 'Text view' })).toHaveTextContent('List')
        expect(screen.getByRole('button', { name: 'New card' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'GitHub account' })).toBeInTheDocument()
    })

    it('opens a local project from the Home project section', async () => {
        const bridge = createBridge()
        window.md2Data = bridge

        renderMenu()
        await openLocalProject()

        expect(dataService.getState().project?.id).toBe('local')
    })

    it('updates the shared workspace view mode from the Home view toggle', () => {
        renderMenu()

        fireEvent.click(screen.getByRole('button', { name: 'Text view' }))

        expect(workspaceViewService.getSnapshot().viewMode).toBe('text')
    })

    it('refreshes selected agent and model when config changes elsewhere', async () => {
        configService.clear()
        configService.init({
            desktopConfig: {
                agent: 'codex',
                agentSlotCommand: '',
                agentProfiles: [
                    { command: 'codex', modelArgument: '--model', models: ['gpt-5'], name: 'codex' },
                    { command: 'local-agent', modelArgument: '--model', models: ['local-model'], name: 'local' },
                ],
                model: 'gpt-5',
                projectLocationMode: 'folder',
            },
        })

        renderMenu()
        fireEvent.click(screen.getByRole('tab', { name: 'Options' }))

        expect(screen.getByRole('combobox', { name: 'Default agent' })).toHaveTextContent('codex')
        expect(screen.getByRole('combobox', { name: 'Default model' })).toHaveTextContent('gpt-5')

        act(() => {
            configService.set('desktop.agent', 'local')
            configService.set('desktop.model', 'local-model')
        })

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Default agent' })).toHaveTextContent('local'))
        expect(screen.getByRole('combobox', { name: 'Default model' })).toHaveTextContent('local-model')
    })
})
