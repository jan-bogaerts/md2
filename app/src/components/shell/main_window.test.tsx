import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { within } from '@testing-library/react'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import type { ElectronActionBridge } from '../../data/electron_action_bridge'
import type { MarkdownFile, StorageService } from '../../data/data_types'
import { configService } from '../../services/config/config_service'
import { actionService } from '../../services/actions/action_service'
import { dataService } from '../../services/data/data_service'
import { projectPersistenceService } from '../../services/project/project_persistence_service'
import { openFilesService } from '../../services/open_files_service'
import * as searchRegexpAgent from '../../services/search/search_regexp_agent'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { DialogDisplay } from '../dialog_display'
import { MainWindow } from './main_window'

const auth: UseGithubAuthResult = {
    accessToken: null,
    errorMessage: null,
    isAuthenticated: false,
    isLoadingUser: false,
    logout: vi.fn(),
    savePersonalAccessToken: vi.fn(),
    status: 'idle',
    user: null,
}

function mainWindowElement(overrides?: Partial<Parameters<typeof MainWindow>[0]>) {
    return (
        <AppThemeProvider>
            <DialogDisplay />
            <MainWindow
                auth={auth}
                toolbarAction={<button type="button">Action</button>}
                {...overrides}
            />
        </AppThemeProvider>
    )
}

function renderWindow(overrides?: Partial<Parameters<typeof MainWindow>[0]>) {
    return render(mainWindowElement(overrides))
}

function installAgentBridge(stdout: string) {
    const bridge: ElectronActionBridge = {
        cancelActionExecution: vi.fn(async () => {}),
        generateDiff: vi.fn(async () => ({ commit: '', files: [] })),
        loadActionRunHistory: vi.fn(async () => []),
        onActionExecution: vi.fn(() => () => {}),
        openInEditor: vi.fn(async () => {}),
        prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        runSearchRegexpAgent: vi.fn(async () => stdout),
        startAction: vi.fn(async () => 'action-1'),
    }
    window.md2Actions = bridge

    return bridge
}

function createStorage(files: MarkdownFile[] = []): StorageService {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        listBranches: vi.fn(async () => []),
        listRepositories: vi.fn(async () => []),
        listRepositoryFiles: vi.fn(async () => []),
        listTopLevelFolders: vi.fn(async () => []),
        loadActionFiles: vi.fn(async () => []),
        loadProject: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'design' })),
        moveFiles: vi.fn(),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
    }
}

async function openProjectWithCards() {
    const files = [
        { content: '---\nid: F-1\ntitle: Root\nstatus: active\naffects:\n---\n\n# Root', path: 'design/F-1-root.md' },
        { content: '# Old', path: 'design/history/F-2-old.md' },
    ]
    openFilesService.init({ actionService, dataService })
    projectPersistenceService.init({ actionService, dataService, openFilesService })
    dataService.init({ storage: createStorage(files) })
    const project = { branch: 'main', id: 'project', rootPath: 'C:/project' }
    const snapshot = await dataService.projectLoading.openProject(project)

    return { project, snapshot, storageType: 'local' as const }
}

function typeQuery(value: string) {
    fireEvent.focus(screen.getByRole('textbox', { name: 'Search project' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search project' }), { target: { value } })
}

function mockMatchMedia(matches: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

describe('MainWindow', () => {
    beforeEach(() => {
        configService.init({ desktopConfig: null })
        openFilesService.init({ actionService, dataService })
        projectPersistenceService.init({ actionService, dataService, openFilesService })
        dataService.init({ storage: createStorage() })
    })

    afterEach(() => {
        cleanup()
        dataService.init({ storage: createStorage() })
        configService.clear()
        delete window.md2Actions
        window.location.hash = ''
        workspaceViewService.setViewMode('cards')
        mockMatchMedia(false)
    })

    it('shows the workspace and status bar on desktop', () => {
        mockMatchMedia(false)
        renderWindow()

        expect(screen.getByRole('button', { name: 'GitHub account' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Open project' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'No project open' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Running agents: 0' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    })

    it('shows card columns without a left navigation panel in card view', async () => {
        mockMatchMedia(false)
        await openProjectWithCards()
        renderWindow()

        expect(screen.getByLabelText('Card columns')).toHaveTextContent('active')
        expect(within(screen.getByLabelText('Card columns')).getByText('Root')).toBeInTheDocument()
        expect(screen.getByRole('contentinfo')).toHaveTextContent('2cards')
        expect(screen.getByRole('contentinfo')).toHaveTextContent('1active')
        expect(screen.queryByText('No project navigation available.')).toBeNull()
        expect(screen.queryByRole('separator', { name: 'Resize panels' })).toBeNull()
        expect(screen.getByLabelText('File tree')).not.toBeVisible()
    })

    it('keeps text navigation hidden when the first project opens in card view', async () => {
        mockMatchMedia(false)
        renderWindow()

        expect(screen.queryByRole('separator', { name: 'Resize panels' })).toBeNull()

        await openProjectWithCards()

        await waitFor(() => {
            expect(screen.getByLabelText('Card columns')).toHaveTextContent('active')
            expect(screen.queryByRole('separator', { name: 'Resize panels' })).toBeNull()
            expect(screen.getByLabelText('File tree')).not.toBeVisible()
        })
    })

    it('switches from card view to text view on desktop without resetting back to cards', async () => {
        mockMatchMedia(false)
        await openProjectWithCards()
        renderWindow()

        fireEvent.click(screen.getByRole('button', { name: 'Text view' }))

        expect(await screen.findByLabelText('File tree')).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Files' })).toBeNull()
        expect(screen.getByRole('separator', { name: 'Resize panels' })).toBeInTheDocument()
    })

    it('keeps the project workspace mounted while switching desktop views', async () => {
        mockMatchMedia(false)
        await openProjectWithCards()
        renderWindow()
        const workspace = screen.getByLabelText('Project workspace')

        fireEvent.click(screen.getByRole('button', { name: 'Text view' }))
        await screen.findByLabelText('File tree')

        expect(screen.getByLabelText('Project workspace')).toBe(workspace)

        fireEvent.click(screen.getByRole('button', { name: 'Cards view' }))

        expect(screen.getByLabelText('Project workspace')).toBe(workspace)
    })

    it('moves the left panel content into a hamburger drawer on mobile', () => {
        mockMatchMedia(true)
        renderWindow()

        expect(screen.queryByLabelText('Personal access token')).toBeNull()
        expect(screen.queryByRole('button', { name: /Switch to (dark|light) theme/ })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
        expect(screen.getByText('No project navigation available.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeInTheDocument()
        expect(screen.queryByLabelText('Personal access token')).toBeNull()
    })

    it('opens mobile search from a toolbar icon', () => {
        mockMatchMedia(true)
        renderWindow()

        expect(screen.queryByRole('textbox', { name: 'Search project' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Search' }))

        expect(screen.getByRole('textbox', { name: 'Search project' })).toHaveFocus()
    })

    it('keeps GitHub authentication in the mobile drawer footer', () => {
        mockMatchMedia(true)
        renderWindow()

        expect(screen.queryByRole('button', { name: 'GitHub account' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
        const drawerFooter = screen.getByRole('contentinfo')
        fireEvent.click(within(drawerFooter).getByRole('button', { name: 'GitHub account' }))

        expect(screen.getByLabelText('Personal access token')).toBeInTheDocument()
    })

    it('opens the config page from the toolbar', () => {
        mockMatchMedia(false)
        renderWindow()

        fireEvent.click(screen.getByRole('button', { name: 'Config' }))

        expect(screen.getByRole('heading', { name: 'Config' })).toBeInTheDocument()
        expect(window.location.hash).toBe('#/config')
    })

    it('closes the config page and confirms a successful save', async () => {
        mockMatchMedia(false)
        renderWindow()

        fireEvent.click(screen.getByRole('button', { name: 'Config' }))
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        await waitFor(() => {
            expect(screen.queryByRole('heading', { name: 'Config' })).toBeNull()
            expect(screen.getByRole('alert')).toHaveTextContent('Config saved')
        })
        expect(window.location.hash).toBe('')
        expect(configService.get('react.showStartupSplash')).toBe(false)
    })

    it('opens the config page directly from the URL', () => {
        window.location.hash = '#/config/desktop'
        mockMatchMedia(false)
        renderWindow()

        expect(screen.getByRole('heading', { name: 'Config' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Desktop' })).toBeInTheDocument()
    })

    it('populates the search query from a real agent run when the Electron bridge is available', async () => {
        mockMatchMedia(false)
        installAgentBridge('Beta')
        renderWindow()

        typeQuery('find the beta card')
        fireEvent.click(screen.getByRole('button', { name: 'Ask agent to build a RegExp' }))

        await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search project' })).toHaveValue('Beta'))
    })

    it('does not recreate the search RegExp agent on window re-render', () => {
        mockMatchMedia(false)
        installAgentBridge('Beta')
        const createSearchRegexpAgent = vi.spyOn(searchRegexpAgent, 'createSearchRegexpAgent')
        const { rerender } = renderWindow()

        rerender(mainWindowElement({ toolbarAction: <button type="button">Changed</button> }))

        expect(createSearchRegexpAgent).toHaveBeenCalledTimes(1)
    })

    it('reports the RegExp agent as unavailable without the Electron bridge', async () => {
        mockMatchMedia(false)
        delete window.md2Actions
        renderWindow()

        typeQuery('alpha only')
        fireEvent.click(screen.getByRole('button', { name: 'Ask agent to build a RegExp' }))

        await waitFor(() => expect(screen.getByText('RegExp agent is not available')).toBeInTheDocument())
        expect(screen.getByRole('textbox', { name: 'Search project' })).toHaveValue('alpha only')
    })
})
