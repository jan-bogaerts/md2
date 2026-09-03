import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseGithubAuthResult } from '../../../auth/use_github_auth'
import type { StorageService } from '../../../data/data_types'
import type { ElectronDataBridge } from '../../../data/electron_data_bridge'
import { actionService } from '../../../services/actions/action_service'
import { configService } from '../../../services/config/config_service'
import { dataService } from '../../../services/data/data_service'
import { workspaceNavigationService } from '../../../services/project/workspace_navigation_service'
import { workspaceViewService } from '../../../services/project/workspace_view_service'
import { projectAccessService } from '../../../services/project/project_access_service'
import { projectPersistenceService } from '../../../services/project/project_persistence_service'
import { projectSessionService } from '../../../services/project/project_session_service'
import { openFilesService } from '../../../services/open_files_service'
import { sentryConnectionService } from '../../../services/sentry/sentry_connection_service'
import { sentryImportService } from '../../../services/sentry/sentry_import_service'
import { createDefaultSentryProjectSettings } from '../../../services/sentry/sentry_types'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { DialogDisplay } from '../../dialog_display'
import { AppMenu } from './app_menu'
import { createAgentTokenUsageSummary, serializeAgentTokenUsageSummary } from '../../../../../shared/agent_token_usage_summary.mjs'

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

const LOCAL_PROJECT = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

function createBridge(): ElectronDataBridge {
    const usageSummary = {
        content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()),
        path: 'agent_token_usage.json',
    }

    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        getMergeConflictSession: vi.fn(async () => null),
        hasPendingPush: vi.fn(async () => false),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositoryFiles: vi.fn(async () => [usageSummary.path]),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadFile: vi.fn(async () => ({ content: '', path: 'design/empty.md' })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'design' })),
        loadTextFile: vi.fn(async (_project, path) => {
            if (path !== usageSummary.path) throw new Error(`Missing file: ${path}`)

            return usageSummary
        }),
        onMergeConflictSessionChanged: vi.fn(() => vi.fn()),
        onWorktreesChanged: vi.fn(() => vi.fn()),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        pull: vi.fn(),
        push: vi.fn(),
        resolveProject: vi.fn(async (project) => project),
        saveProjectConfig: vi.fn(),
        addWorktree: vi.fn(async () => undefined),
        removeWorktree: vi.fn(async () => undefined),
        watchProject: vi.fn(() => vi.fn()),
    }
}

function createResetStorage(): StorageService {
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
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        moveFiles: vi.fn(),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
    }
}

function renderMenu(isMobile = false) {
    return render(
        <AppThemeProvider>
            <DialogDisplay />
            <AppMenu
                accessToken="token"
                auth={auth}
                extraActions={null}
                initialProjectOpenResolution={null}
                isGithubAuthenticated={false}
                isMobile={isMobile}
                onOpenConfig={vi.fn()}
                onOpenMobileMenu={vi.fn()}
                search={<input aria-label="Search project" />}
            />
        </AppThemeProvider>,
    )
}

async function openLocalProject() {
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Folder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose local repository folder' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open project' })).toBeNull())
}

async function activateLocalProject(bridge: ElectronDataBridge) {
    window.md2Data = bridge
    await projectSessionService.openProject('local', LOCAL_PROJECT, null)
}

function completeSentrySettings() {
    return {
        ...createDefaultSentryProjectSettings(),
        apiToken: 'token',
        cardState: 'to fix',
        cardType: 'Bug',
        organization: 'acme',
        project: 'frontend',
    }
}

async function connectSentry() {
    sentryConnectionService.setProject(LOCAL_PROJECT)
    await act(async () => {
        await sentryConnectionService.connect(completeSentrySettings())
    })
}

async function renderProjectWithPendingChanges() {
    const bridge = createBridge()
    const files = [{ content: '---\nid: F-1\ninternalId: f-1\ntitle: Root\nstatus: active\n---\n\n# Root', path: 'design/F-1-root.md' }]
    bridge.loadProject = vi.fn(async () => ({ files, workingFolder: 'design' }))
    bridge.loadProjectRoot = vi.fn(async () => ({ files, workingFolder: 'design' }))
    await activateLocalProject(bridge)
    const renderResult = renderMenu()

    act(() => {
        dataService.cards.updateCardBody('design/F-1-root.md', 'Changed body')
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Commit' })).toBeEnabled())

    return { bridge, renderResult }
}

describe('AppMenu', () => {
    beforeEach(() => {
        configService.init({ desktopConfig: null })
        actionService.clear()
        openFilesService.init({ actionService, dataService })
        projectPersistenceService.init({ actionService, dataService, openFilesService })
        dataService.init({ storage: createResetStorage() })
        sentryConnectionService.init({ apiClient: { validateProject: vi.fn(async () => undefined) }, storage: window.localStorage })
        projectAccessService.setReadOnly(false)
        workspaceViewService.setViewMode('cards')
        const { selectedPath } = workspaceViewService.getSnapshot()
        if (selectedPath) workspaceViewService.clearSelectedPath(selectedPath)
    })

    afterEach(() => {
        cleanup()
        configService.clear()
        actionService.clear()
        window.localStorage.clear()
        delete window.md2Data
        vi.restoreAllMocks()
    })

    it('renders the requested top-level menu tabs and home sections', () => {
        renderMenu()

        expect(screen.getByRole('tab', { name: 'Home' })).toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Edit' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Format' })).not.toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Run' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Open project' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Commit' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Push' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Pull' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Config' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cards view' })).toHaveTextContent('Board')
        expect(screen.getByRole('button', { name: 'Text view' })).toHaveTextContent('List')
        expect(screen.getByRole('button', { name: 'Diagrams view' })).toHaveTextContent('Diagrams')
        expect(screen.getByRole('button', { name: 'Stats view' })).toHaveTextContent('Stats')
        expect(screen.getByRole('button', { name: 'New action' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'New card' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'GitHub account' })).toBeInTheDocument()

        const settingsSection = screen.getByRole('group', { name: 'Settings' })
        const viewSection = screen.getByRole('group', { name: 'View' })
        expect(within(viewSection).getAllByRole('button').map((button) => button.textContent)).toEqual(['Board', 'List', 'Diagrams', 'Stats'])
        expect(settingsSection.compareDocumentPosition(viewSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

        expect(screen.queryByRole('button', { name: 'Complete release' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))

        const completeReleaseButton = screen.getByRole('button', { name: 'Complete release' })
        const newCardButton = screen.getByRole('button', { name: 'New card', hidden: true })
        expect(completeReleaseButton).toBeInTheDocument()
        expect(newCardButton).not.toBeVisible()
        expect(screen.getByRole('button', { name: 'New action', hidden: true })).not.toBeVisible()
    })

    it('shows the Commit shortcut in its tooltip without changing the accessible name or other tooltips', async () => {
        renderMenu()

        const commitButton = screen.getByRole('button', { name: 'Commit' })
        fireEvent.mouseOver(commitButton)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Commit (Ctrl+S)')
        fireEvent.mouseOut(commitButton)
        await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

        fireEvent.mouseOver(screen.getByRole('button', { name: 'Open project' }))
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Open project')
    })

    it('uses the Commit operation for Ctrl+S from a focused control and prevents native save', async () => {
        await renderProjectWithPendingChanges()
        const commit = vi.spyOn(projectSessionService, 'commit').mockResolvedValue()
        const searchInput = screen.getByRole('textbox', { name: 'Search project' })

        fireEvent.click(screen.getByRole('button', { name: 'Commit' }))
        searchInput.focus()
        const shortcutEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 's' })
        fireEvent(searchInput, shortcutEvent)

        expect(searchInput).toHaveFocus()
        expect(shortcutEvent.defaultPrevented).toBe(true)
        expect(commit).toHaveBeenCalledTimes(2)
    })

    it('prevents exact Ctrl+S without committing while Commit is disabled', async () => {
        const commit = vi.spyOn(projectSessionService, 'commit').mockResolvedValue()
        const bridge = createBridge()
        renderMenu()
        const noProjectEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 's' })
        fireEvent(window, noProjectEvent)
        expect(noProjectEvent.defaultPrevented).toBe(true)

        await activateLocalProject(bridge)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Commit' })).toBeDisabled())
        const noChangesEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 's' })
        fireEvent(window, noChangesEvent)

        expect(noChangesEvent.defaultPrevented).toBe(true)
        expect(commit).not.toHaveBeenCalled()
    })

    it('does not commit during read-only or loading states', async () => {
        await renderProjectWithPendingChanges()
        const commit = vi.spyOn(projectSessionService, 'commit').mockResolvedValue()

        act(() => projectAccessService.setReadOnly(true))
        const readOnlyEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 's' })
        fireEvent(window, readOnlyEvent)

        const loadingSnapshot = { ...projectSessionService.getSnapshot(), isLoading: true }
        vi.spyOn(projectSessionService, 'getSnapshot').mockReturnValue(loadingSnapshot)
        act(() => {
            projectAccessService.setReadOnly(false)
            projectSessionService.dispatchEvent(new Event('changed'))
        })
        await waitFor(() => expect(screen.getByRole('button', { name: 'Commit' })).toBeDisabled())
        const loadingEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 's' })
        fireEvent(window, loadingEvent)

        expect(readOnlyEvent.defaultPrevented).toBe(true)
        expect(loadingEvent.defaultPrevented).toBe(true)
        expect(commit).not.toHaveBeenCalled()
    })

    it('ignores save shortcuts with Alt, Meta, or Shift modifiers', async () => {
        await renderProjectWithPendingChanges()
        const commit = vi.spyOn(projectSessionService, 'commit').mockResolvedValue()
        const events = [
            new KeyboardEvent('keydown', { altKey: true, bubbles: true, cancelable: true, ctrlKey: true, key: 's' }),
            new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 's', metaKey: true }),
            new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 's', shiftKey: true }),
        ]

        events.forEach((event) => fireEvent(window, event))

        expect(events.every((event) => !event.defaultPrevented)).toBe(true)
        expect(commit).not.toHaveBeenCalled()
    })

    it('removes the Ctrl+S listener when AppMenu unmounts', async () => {
        const { renderResult } = await renderProjectWithPendingChanges()
        const commit = vi.spyOn(projectSessionService, 'commit').mockResolvedValue()
        renderResult.unmount()
        const shortcutEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, key: 's' })

        fireEvent(window, shortcutEvent)

        expect(shortcutEvent.defaultPrevented).toBe(false)
        expect(commit).not.toHaveBeenCalled()
    })

    it('renders mobile Home controls in responsive order and hides desktop-only actions', () => {
        renderMenu(true)

        const viewSection = screen.getByRole('group', { name: 'View' })
        const projectSection = screen.getByRole('group', { name: 'Project' })
        const openProjectButton = screen.getByRole('button', { name: 'Open project' })
        const branchSelect = screen.getByRole('combobox', { name: 'Switch branch' })
        expect(viewSection.compareDocumentPosition(projectSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(openProjectButton.compareDocumentPosition(branchSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'New action' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'New card' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'GitHub account' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
    })

    it('keeps the mobile create menu on Home and preserves the Run toolbar', () => {
        renderMenu(true)

        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
        expect(screen.getByRole('menuitem', { name: 'New action' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('menuitem', { name: 'New card' })).toHaveAttribute('aria-disabled', 'true')
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))

        expect(screen.queryByRole('button', { name: 'Create' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Complete release' })).toBeInTheDocument()
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

        fireEvent.click(screen.getByRole('button', { name: 'Diagrams view' }))
        expect(workspaceViewService.getSnapshot().viewMode).toBe('diagrams')

        fireEvent.click(screen.getByRole('button', { name: 'Stats view' }))
        expect(workspaceViewService.getSnapshot().viewMode).toBe('stats')
    })

    it('creates a valid action and opens its text-view tab from the Home tab', async () => {
        const bridge = createBridge()
        await activateLocalProject(bridge)
        const listener = vi.fn()
        workspaceNavigationService.addEventListener('open', listener)
        renderMenu()

        fireEvent.click(screen.getByRole('button', { name: 'New action' }))

        await waitFor(() => expect(listener).toHaveBeenCalledOnce())
        await projectPersistenceService.flushPendingChanges()
        const commitRequest = vi.mocked(bridge.commit).mock.calls.at(-1)?.[0]
        const actionFile = commitRequest?.files[0]
        if (!actionFile) throw new Error('Missing persisted action file')
        const persistedDefinition = JSON.parse(actionFile.content) as { id: string, label: string }

        expect(actionFile.content).toMatch(/\{\n {2}"description": "Describe this action\.",/u)
        expect(actionService.getActionByPath(actionFile.path)).toMatchObject({
            id: persistedDefinition.id,
            label: persistedDefinition.label,
            sourcePath: actionFile.path,
        })
        expect(workspaceViewService.getSnapshot().viewMode).toBe('text')
        expect(listener).toHaveBeenCalledOnce()
        expect((listener.mock.calls[0][0] as CustomEvent<{ path: string }>).detail.path).toBe(actionFile.path)

        actionService.loadFromFiles([actionFile])
        expect(actionService.getActionByPath(actionFile.path)).toMatchObject({
            id: persistedDefinition.id,
            label: persistedDefinition.label,
            sourcePath: actionFile.path,
        })
        workspaceNavigationService.removeEventListener('open', listener)
    })

    it('shows a Run button for every explicitly project-scoped action', async () => {
        const bridge = createBridge()
        bridge.loadActionFiles = vi.fn(async () => [
            {
                content: JSON.stringify({
                    appliesTo: { kind: 'project' }, command: 'review', description: 'Review project',
                    id: 'project-review', label: 'Review project', type: 'command',
                }),
                path: 'design/actions/project-review.json',
            },
            {
                content: JSON.stringify({
                    appliesTo: { kind: 'card' }, command: 'review', description: 'Review card',
                    id: 'card-review', label: 'Review card', type: 'command',
                }),
                path: 'design/actions/card-review.json',
            },
        ])
        await activateLocalProject(bridge)

        renderMenu()
        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))

        expect(screen.getByRole('button', { name: 'Review project' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Review card' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Custom prompt' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Review project' }))
        const dialog = within(screen.getByRole('dialog', { name: 'Run actions for Project' }))
        expect(dialog.getByRole('button', { name: 'Review project' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('shows and refreshes the default agent settings', async () => {
        configService.clear()
        configService.init({
            desktopConfig: {
                agentProfiles: [
                    { command: ['codex'], defaultThinkingLevel: 'none', modelArgument: '--model', models: ['gpt-5'], name: 'codex' },
                    { command: ['local-agent'], defaultThinkingLevel: 'none', modelArgument: '--model', models: ['local-model'], name: 'local' },
                ],
                agentSelection: {
                    activeAgent: 'codex', permissionMode: 'ask-for-approval',
                    settingsByAgent: {
                        codex: { model: 'gpt-5', thinkingLevel: 'high' },
                        local: { model: 'local-model', thinkingLevel: 'low' },
                    },
                },
            },
        })

        renderMenu()
        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))

        expect(screen.getByRole('combobox', { name: 'Default agent' })).toHaveTextContent('codex')
        expect(screen.getByRole('combobox', { name: 'Default model' })).toHaveTextContent('gpt-5')
        expect(screen.getByRole('combobox', { name: 'Default reasoning level' })).toHaveTextContent('high')
        expect(screen.getByRole('combobox', { name: 'Default permission mode' })).toHaveTextContent('Ask for approval')

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Default permission mode' }))
        fireEvent.click(screen.getByRole('option', { name: 'Full access — disables approvals' }))
        expect(configService.get('desktop.agentSelection').permissionMode).toBe('full-access')

        fireEvent.mouseOver(screen.getByRole('combobox', { name: 'Default reasoning level' }))
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Default reasoning level')

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Default reasoning level' }))
        fireEvent.click(screen.getByRole('option', { name: 'max' }))
        expect(configService.get('desktop.agentSelection').settingsByAgent.codex.thinkingLevel).toBe('max')

        act(() => {
            const selection = configService.get('desktop.agentSelection')
            configService.set('desktop.agentSelection', { ...selection, activeAgent: 'local' })
        })

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Default agent' })).toHaveTextContent('local'))
        expect(screen.getByRole('combobox', { name: 'Default model' })).toHaveTextContent('local-model')
        expect(screen.getByRole('combobox', { name: 'Default reasoning level' })).toHaveTextContent('low')
        expect(screen.getByDisplayValue('Permissions unsupported')).toBeDisabled()
    })

    it('keeps unavailable remembered global values visible with validation tooltip', async () => {
        configService.clear()
        configService.init({
            desktopConfig: {
                agentProfiles: [],
                agentSelection: {
                    activeAgent: 'removed-agent',
                    permissionMode: 'ask-for-approval',
                    settingsByAgent: { 'removed-agent': { model: 'removed-model', thinkingLevel: 'high' } },
                },
            },
        })

        renderMenu()
        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))

        const agent = screen.getByRole('combobox', { name: 'Default agent' })
        expect(agent).toHaveTextContent('removed-agent — unavailable')
        expect(screen.getByRole('textbox', { name: 'Default model' })).toHaveValue('removed-model')
        expect(screen.getByText('Unavailable')).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Default reasoning level' })).toHaveTextContent('high — unavailable')
        fireEvent.mouseOver(agent)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Unknown agent profile in desktop agent selection: removed-agent')
    })

    it('commits pending changes before enabling manual push', async () => {
        const bridge = createBridge()
        const files = [{ content: '---\nid: F-1\ninternalId: f-1\ntitle: Root\nstatus: active\n---\n\n# Root', path: 'design/F-1-root.md' }]
        bridge.loadProjectConfig = vi.fn(async () => ({
            backgroundShade: 'blue' as const,
            projectFolder: '',
            pushMode: 'manual' as const,
            workingFolder: 'design',
        }))
        bridge.loadProject = vi.fn(async () => ({ files, workingFolder: 'design' }))
        bridge.loadProjectRoot = vi.fn(async () => ({ files, workingFolder: 'design' }))
        await activateLocalProject(bridge)

        renderMenu()
        const commitButton = screen.getByRole('button', { name: 'Commit' })
        const pushButton = screen.getByRole('button', { name: 'Push' })
        expect(commitButton).toBeDisabled()
        expect(pushButton).toBeDisabled()

        act(() => {
            dataService.cards.updateCardBody('design/F-1-root.md', 'Changed before push')
        })

        await waitFor(() => expect(commitButton).toBeEnabled())
        expect(pushButton).toBeDisabled()
        fireEvent.click(commitButton)

        await waitFor(() => expect(bridge.commit).toHaveBeenCalled())
        await waitFor(() => expect(pushButton).toBeEnabled())
        fireEvent.click(pushButton)

        await waitFor(() => expect(bridge.push).toHaveBeenCalledWith(expect.objectContaining({ id: 'local' })))
        expect(pushButton).toBeDisabled()
    })

    it('hides the Sentry import button until the project has a complete authenticated connection', async () => {
        await activateLocalProject(createBridge())
        renderMenu()
        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))
        expect(screen.queryByRole('button', { name: 'Import Sentry issues' })).not.toBeInTheDocument()

        await connectSentry()

        expect(await screen.findByRole('button', { name: 'Import Sentry issues' })).toBeEnabled()
    })

    it('keeps the Sentry import button hidden while settings are incomplete', async () => {
        await activateLocalProject(createBridge())
        await connectSentry()
        act(() => {
            sentryConnectionService.saveSettings({ ...completeSentrySettings(), cardType: '' })
        })

        renderMenu()
        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))

        expect(screen.queryByRole('button', { name: 'Import Sentry issues' })).not.toBeInTheDocument()
    })

    it('disables the Sentry import button while an import runs', async () => {
        await activateLocalProject(createBridge())
        await connectSentry()
        vi.spyOn(sentryImportService, 'getSnapshot').mockReturnValue({
            confirmation: null,
            isPolling: true,
            lastImportCount: null,
            lastSuccessfulPollAt: null,
            latestError: null,
        })

        renderMenu()
        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))

        const importButton = screen.getByRole('button', { name: 'Import Sentry issues' })
        expect(importButton).toBeDisabled()
        fireEvent.mouseOver(importButton.parentElement as HTMLElement)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Checking Sentry...')
    })

    it('disables the Sentry import button for a read-only project', async () => {
        await activateLocalProject(createBridge())
        await connectSentry()
        renderMenu()
        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))
        expect(screen.getByRole('button', { name: 'Import Sentry issues' })).toBeEnabled()

        act(() => projectAccessService.setReadOnly(true))

        expect(screen.getByRole('button', { name: 'Import Sentry issues' })).toBeDisabled()
    })

    it('runs one manual Sentry import per click from the Run menu', async () => {
        await activateLocalProject(createBridge())
        await connectSentry()
        const importNow = vi.spyOn(sentryImportService, 'importNow').mockResolvedValue(0)

        renderMenu()
        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))
        fireEvent.click(screen.getByRole('button', { name: 'Import Sentry issues' }))

        expect(importNow).toHaveBeenCalledTimes(1)
    })

    it('pulls only when the primary worktree monitor reports clean incoming commits', async () => {
        let onWorktreesChanged: ((state: {
            error: string | null
            primaryStatus: {
                ahead: number
                baseAhead: number
                baseBehind: number
                behind: number
                dirty: boolean
                hasUpstream: boolean
            }
            project: { branch: string, id: string, rootPath: string }
            records: []
        }) => void) | null = null
        const bridge = createBridge()
        bridge.onWorktreesChanged = vi.fn((callback) => {
            onWorktreesChanged = callback

            return vi.fn()
        })
        await activateLocalProject(bridge)
        renderMenu()
        const pullButton = screen.getByRole('button', { name: 'Pull' })
        expect(pullButton).toBeDisabled()

        act(() => {
            onWorktreesChanged?.({
                error: null,
                primaryStatus: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 1, dirty: false, hasUpstream: true },
                project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
                records: [],
            })
        })

        await waitFor(() => expect(pullButton).toBeEnabled())
        fireEvent.click(pullButton)
        await waitFor(() => expect(bridge.pull).toHaveBeenCalledWith(expect.objectContaining({ id: 'local' })))
    })
})
