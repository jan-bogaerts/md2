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
import { projectPersistenceService } from '../../../services/project/project_persistence_service'
import { openFilesService } from '../../../services/open_files_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { DialogDisplay } from '../../dialog_display'
import { AppMenu } from './app_menu'

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

function createBridge(): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        hasPendingPush: vi.fn(async () => false),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositoryFiles: vi.fn(async () => []),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadFile: vi.fn(async () => ({ content: '', path: 'design/empty.md' })),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'design' })),
        onWorktreesChanged: vi.fn(() => vi.fn()),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        pull: vi.fn(),
        push: vi.fn(),
        resolveProject: vi.fn(async (project) => project),
        saveProjectConfig: vi.fn(),
        addWorktree: vi.fn(async () => false),
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
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open project' })).toBeNull())
}

describe('AppMenu', () => {
    beforeEach(() => {
        configService.init({ desktopConfig: null })
        actionService.clear()
        openFilesService.init({ actionService, dataService })
        projectPersistenceService.init({ actionService, dataService, openFilesService })
        dataService.init({ storage: createResetStorage() })
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
        expect(screen.getByRole('button', { name: 'New action' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'New card' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'GitHub account' })).toBeInTheDocument()

        const settingsSection = screen.getByRole('group', { name: 'Settings' })
        const viewSection = screen.getByRole('group', { name: 'View' })
        expect(settingsSection.compareDocumentPosition(viewSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

        expect(screen.queryByRole('button', { name: 'Complete release' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))

        const completeReleaseButton = screen.getByRole('button', { name: 'Complete release' })
        const newCardButton = screen.getByRole('button', { name: 'New card', hidden: true })
        expect(completeReleaseButton).toBeInTheDocument()
        expect(newCardButton).not.toBeVisible()
        expect(screen.getByRole('button', { name: 'New action', hidden: true })).not.toBeVisible()
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
    })

    it('creates a valid action and opens its text-view tab from the Home tab', async () => {
        const bridge = createBridge()
        window.md2Data = bridge
        const listener = vi.fn()
        workspaceNavigationService.addEventListener('open', listener)
        renderMenu()
        await openLocalProject()

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
        window.md2Data = bridge

        renderMenu()
        await openLocalProject()
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
                agent: 'codex',
                agentProfiles: [
                    { command: ['codex'], modelArgument: '--model', models: ['gpt-5'], name: 'codex' },
                    { command: ['local-agent'], modelArgument: '--model', models: ['local-model'], name: 'local' },
                ],
                model: 'gpt-5',
                thinkingLevel: 'high',
            },
        })

        renderMenu()
        fireEvent.click(screen.getByRole('tab', { name: 'Run' }))

        expect(screen.getByRole('combobox', { name: 'Default agent' })).toHaveTextContent('codex')
        expect(screen.getByRole('combobox', { name: 'Default model' })).toHaveTextContent('gpt-5')
        expect(screen.getByRole('combobox', { name: 'Default reasoning level' })).toHaveTextContent('high')

        fireEvent.mouseOver(screen.getByRole('combobox', { name: 'Default reasoning level' }))
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Default reasoning level')

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Default reasoning level' }))
        fireEvent.click(screen.getByRole('option', { name: 'max' }))
        expect(configService.get('desktop.thinkingLevel')).toBe('max')

        act(() => {
            configService.set('desktop.agent', 'local')
            configService.set('desktop.model', 'local-model')
            configService.set('desktop.thinkingLevel', 'low')
        })

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Default agent' })).toHaveTextContent('local'))
        expect(screen.getByRole('combobox', { name: 'Default model' })).toHaveTextContent('local-model')
        expect(screen.getByRole('combobox', { name: 'Default reasoning level' })).toHaveTextContent('low')
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
        window.md2Data = bridge

        renderMenu()
        await openLocalProject()
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
        window.md2Data = bridge
        renderMenu()
        await openLocalProject()
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
