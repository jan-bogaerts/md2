import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallback } from 'react'
import { MissingWorkingFolderError, type ProjectConfig, type StorageService } from '../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../data/electron_action_bridge'
import type { ElectronDataBridge } from '../data/electron_data_bridge'
import { configService } from '../services/config/config_service'
import { dataService } from '../services/data/data_service'
import { actionService } from '../services/actions/action_service'
import { openFilesService } from '../services/open_files_service'
import { telemetryService } from '../services/telemetry/telemetry_service'
import { workspaceNavigationService } from '../services/project/workspace_navigation_service'
import { workspaceViewService } from '../services/project/workspace_view_service'
import { projectPersistenceService } from '../services/project/project_persistence_service'
import { cardMarkdownDataSource } from './editor/card_markdown_data_source'
import { AppThemeProvider } from '../theme/theme_provider'
import { DialogDisplay } from './dialog_display'
import { ProjectWorkspace } from './project_workspace'
import { ProjectToolbarMenu } from './shell/project_toolbar_menu'
import { LeftPanelSlotProvider } from './shell/left_panel_slot_provider'
import { LeftPanelTarget } from './shell/left_panel_target'

const GITHUB_REPOSITORIES_URL = 'https://api.github.com/user/repos?per_page=100&page=1'
const OWNER_REPOSITORY_URL = 'https://api.github.com/repos/octo/demo'
const BRANCHES_URL = 'https://api.github.com/repos/octo/demo/branches'

function createBridge(): ElectronDataBridge {
    const files = [
        {
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\naffects:\n---\n\n# Root',
            path: 'design/F-1-root.md',
        },
        {
            content: '---\nid: F-2\ninternalId: old-card\ntitle: Old\naffects:\n---\n\n# Old',
            path: 'design/history/F-2-old.md',
        },
    ]

    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async (request) => {
            files.push(...request.files)

            return []
        }),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(async (request) => {
            const existingIndex = files.findIndex((file) => file.path === request.path)
            if (existingIndex >= 0) files.splice(existingIndex, 1)
        }),
        deleteFolder: vi.fn(async (request) => {
            const folderPrefix = `${request.path}/`
            const remainingFiles = files.filter((file) => !file.path.startsWith(folderPrefix))
            files.splice(0, files.length, ...remainingFiles)
        }),
        hasPendingPush: vi.fn(async () => false),
        listBranches: vi.fn(async () => [{ name: 'main' }, { name: 'feature' }]),
        listRepositoryFiles: vi.fn(async () => ['app/src/app.tsx', 'design/F-1-root.md']),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadFile: vi.fn(async (_project, path) => {
            const file = files.find((candidate) => candidate.path === path)
            if (!file) throw new Error(`Missing file: ${path}`)

            return file
        }),
        loadProject: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({
            files: files.filter((file) => !file.path.slice('design/'.length).includes('/')),
            workingFolder: 'design',
        })),
        loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'design' })),
        loadWorktrees: vi.fn(async () => []),
        moveFiles: vi.fn(async (request) => {
            for (const move of request.moves) {
                const existingIndex = files.findIndex((file) => file.path === move.fromPath)
                if (existingIndex >= 0) files.splice(existingIndex, 1)
                files.push({ content: move.content, path: move.toPath })
            }
        }),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
        resolveProject: vi.fn(async (project) => project),
        saveProjectConfig: vi.fn(),
        addWorktree: vi.fn(async () => null),
        removeWorktree: vi.fn(async () => []),
        watchProject: vi.fn(() => vi.fn()),
    }
}

function createActionBridge(): ElectronActionBridge {
    return {
        onActionExecution: vi.fn(() => vi.fn()),
        prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
    } as unknown as ElectronActionBridge
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

function renderProjectSurface(isGithubAuthenticated = false) {
    function ProjectSurface() {
        const handleLeftPanelInteraction = useCallback(() => undefined, [])

        return (
            <LeftPanelSlotProvider>
                <DialogDisplay />
                <ProjectToolbarMenu accessToken="token" isGithubAuthenticated={isGithubAuthenticated} />
                <LeftPanelTarget fallback="No project navigation available." />
                <ProjectWorkspace
                    onLeftPanelInteraction={handleLeftPanelInteraction}
                />
            </LeftPanelSlotProvider>
        )
    }

    return render(
        <AppThemeProvider>
            <ProjectSurface />
        </AppThemeProvider>,
    )
}

async function openProjectDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open project...' }))
    await screen.findByRole('heading', { name: 'Open project' })
}

async function chooseBranch(branch: string) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Branch' }))
    fireEvent.click(await screen.findByRole('option', { name: branch }))
}

function requestLocalProject() {
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open project...' }))
}

async function openLocalProject() {
    requestLocalProject()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open project' })).toBeNull())
}

function mockGithubFetch() {
    return vi.fn(async (url: string | URL | Request) => {
        const requestUrl = url.toString()
        if (requestUrl === GITHUB_REPOSITORIES_URL) {
            return Response.json([
                { default_branch: 'trunk', full_name: 'octo/demo', name: 'demo', owner: { login: 'octo' } },
                { default_branch: 'main', full_name: 'octo/notes', name: 'notes', owner: { login: 'octo' } },
            ])
        }
        if (requestUrl === OWNER_REPOSITORY_URL) {
            return Response.json({ default_branch: 'trunk', full_name: 'octo/demo', name: 'demo', owner: { login: 'octo' } })
        }
        if (requestUrl === BRANCHES_URL) return Response.json([{ name: 'trunk' }, { name: 'topic' }])

        return new Response('{}', { status: 404 })
    })
}

describe('ProjectWorkspace', () => {
    beforeEach(() => {
        configService.init({ desktopConfig: null })
        projectPersistenceService.init({ actionService, dataService })
        dataService.init({ storage: createResetStorage() })
        openFilesService.init({ actionService, dataService })
        cardMarkdownDataSource.init(dataService)
        openFilesService.clear()
        workspaceViewService.setViewMode('cards')
    })

    afterEach(() => {
        cleanup()
        actionService.clear()
        configService.clear()
        window.localStorage.clear()
        setActionBridgeOverride(null)
        delete window.md2Actions
        delete window.md2Data
        delete window.md2Lifecycle
        vi.restoreAllMocks()
    })

    it('shows an empty state without setup fields in the workspace body', () => {
        dataService.init({ storage: createResetStorage() })

        renderProjectSurface()

        expect(screen.getByRole('heading', { name: 'No project open' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Open project...' })).toBeInTheDocument()
        expect(screen.queryByLabelText('Owner')).toBeNull()
        expect(screen.queryByLabelText('Repository')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Open Local' })).toBeNull()
        expect(screen.getByRole('heading', { name: 'No project open' }).parentElement).toHaveStyle({
            alignItems: 'center',
            flex: '1 1 0%',
            justifyContent: 'center',
            textAlign: 'center',
        })
    })

    it('opens a local project and shows root cards in the card view before background cards', async () => {
        const bridge = createBridge()
        window.md2Actions = createActionBridge()
        window.md2Data = bridge

        renderProjectSurface()
        await openLocalProject()

        expect(bridge.openProjectFolder).toHaveBeenCalledOnce()
        expect(bridge.listBranches).not.toHaveBeenCalled()
        expect(screen.queryByRole('combobox', { name: 'Source' })).toBeNull()
        expect(await screen.findByText('Root')).toBeInTheDocument()
        expect(screen.getByText('F-1')).toBeInTheDocument()
        expect(screen.getAllByText('active').length).toBeGreaterThan(0)
        expect(screen.getByLabelText('Card columns')).toHaveTextContent('active')
        expect(screen.getByRole('button', { name: 'Project agent' })).toBeInTheDocument()
        expect(screen.queryByText('Background cards loaded: 1')).toBeNull()
    })

    it('keeps project agent available across card and text views', async () => {
        window.md2Actions = createActionBridge()
        window.md2Data = createBridge()
        renderProjectSurface()
        await openLocalProject()

        expect(screen.getByRole('button', { name: 'Project agent' })).toBeInTheDocument()
        workspaceViewService.setViewMode('text')

        expect(await screen.findByLabelText('File tree')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Project agent' })).toBeInTheDocument()
    })

    it('hides project agent in a browser without an Electron execution backend', async () => {
        await dataService.projectLoading.openProject({ branch: 'main', id: 'web-project' })

        renderProjectSurface()

        expect(screen.queryByRole('button', { name: 'Project agent' })).toBeNull()
    })

    it('shows project agent in a browser connected to an Electron server', async () => {
        setActionBridgeOverride(createActionBridge())
        await dataService.projectLoading.openProject({ branch: 'main', id: 'remote-project' })

        renderProjectSurface()

        expect(screen.getByRole('button', { name: 'Project agent' })).toBeInTheDocument()
    })

    it('opens the checked-out local branch without relabeling or checkout', async () => {
        const bridge = createBridge()
        vi.mocked(bridge.openProjectFolder).mockResolvedValue({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' })
        window.md2Data = bridge

        renderProjectSurface(false)
        await openLocalProject()

        await waitFor(() => expect(dataService.getState().project).toEqual({ branch: 'topic', id: 'C:/repo', rootPath: 'C:/repo' }))
        expect(bridge.checkoutBranch).not.toHaveBeenCalled()
        expect(bridge.loadProjectRoot).toHaveBeenCalledWith(expect.objectContaining({ branch: 'topic' }), 'design')
    })

    it('shows local repository validation failures without opening a project', async () => {
        const bridge = createBridge()
        vi.mocked(bridge.openProjectFolder).mockRejectedValue(new Error('Selected folder is not inside a Git work tree'))
        window.md2Data = bridge

        renderProjectSurface(false)
        requestLocalProject()

        expect(await screen.findByText('Selected folder is not inside a Git work tree')).toBeInTheDocument()
        expect(dataService.getState().project).toBeNull()
    })

    it('creates default project folders and config when a local repository has no config', async () => {
        const bridge = createBridge()
        bridge.loadProjectConfig = vi.fn(async () => null)
        bridge.listTopLevelFolders = vi.fn(async () => [{ name: 'docs', path: 'docs' }])
        window.md2Data = bridge

        renderProjectSurface(false)
        requestLocalProject()

        expect(await screen.findByRole('dialog', { name: 'Create project' })).toBeInTheDocument()
        expect(screen.getByLabelText('Project folder')).toHaveValue('design')
        fireEvent.change(screen.getByLabelText('Project folder'), { target: { value: 'docs' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(bridge.createWorkingFolderFromTemplate).toHaveBeenCalledWith(expect.any(Object), 'docs/active'))
        await waitFor(() => expect(bridge.saveProjectConfig).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
            projectFolder: 'docs',
            workingFolder: 'active',
        })))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create project' })).toBeNull())
    })

    it('keeps the workspace paper fixed while its content scrolls without a header', async () => {
        window.md2Data = createBridge()

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        expect(screen.getByRole('region', { name: 'Project workspace' })).toHaveStyle({ overflow: 'hidden' })
        expect(screen.getByRole('region', { name: 'Project workspace content' })).toHaveStyle({ overflow: 'auto' })
        expect(screen.queryByRole('heading', { name: 'Active cards' })).toBeNull()
    })

    it('flushes pending commits when the app is hidden', async () => {
        const bridge = createBridge()
        window.md2Data = bridge
        const visibilityState = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        dataService.cards.updateCardBody('design/F-1-root.md', 'Changed while open')
        await waitFor(() => expect(projectPersistenceService.getSnapshot().hasPendingSave).toBe(true))
        document.dispatchEvent(new Event('visibilitychange'))

        await waitFor(() => expect(bridge.commit).toHaveBeenCalledWith(expect.objectContaining({files: [expect.objectContaining({ path: 'design/F-1-root.md' })]})))
        expect(projectPersistenceService.getSnapshot().hasPendingSave).toBe(false)

        visibilityState.mockRestore()
    })

    it('confirms close only while commits are pending', async () => {
        window.md2Data = createBridge()

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        const cleanClose = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(cleanClose)

        expect(cleanClose.defaultPrevented).toBe(false)

        dataService.cards.updateCardBody('design/F-1-root.md', 'Changed before close')
        await waitFor(() => expect(projectPersistenceService.getSnapshot().hasPendingSave).toBe(true))

        const pendingClose = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(pendingClose)

        expect(pendingClose.defaultPrevented).toBe(true)
    })

    it('keeps an invalid action draft pending when the browser closes', async () => {
        window.md2Data = createBridge()
        renderProjectSurface()
        await openLocalProject()
        actionService.loadFromFiles([{
            content: JSON.stringify({ command: 'run', description: 'Run', id: 'run', label: 'Run', type: 'command' }),
            path: 'actions/run.json',
        }])
        actionService.updateDraft('actions/run.json', { command: 'run', description: 'Run', id: 'run', label: '', type: 'command' })

        const pendingClose = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(pendingClose)

        expect(pendingClose.defaultPrevented).toBe(true)
        expect(actionService.getDraft('actions/run.json').definition.label).toBe('')
        expect(projectPersistenceService.getSnapshot().hasPendingSave).toBe(true)
    })

    it('confirms close when storage has unpushed commits', async () => {
        const storage = createResetStorage()
        storage.hasPendingPush = vi.fn(() => true)
        dataService.init({ storage })
        await dataService.projectLoading.openProject({ branch: 'main', id: 'project' })

        renderProjectSurface()

        const pendingClose = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(pendingClose)

        expect(pendingClose.defaultPrevented).toBe(true)
    })

    it('flushes and confirms Electron quit flush requests', async () => {
        const bridge = createBridge()
        let flushRequested: ((requestId: string) => void) | null = null
        window.md2Data = bridge
        window.md2Lifecycle = {
            confirmFlush: vi.fn(),
            onFlushRequested: vi.fn((callback) => {
                flushRequested = callback

                return vi.fn()
            }),
        }

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        dataService.cards.updateCardBody('design/F-1-root.md', 'Changed before quit')
        await waitFor(() => expect(projectPersistenceService.getSnapshot().hasPendingSave).toBe(true))
        act(() => flushRequested?.('quit-1'))

        await waitFor(() => expect(bridge.commit).toHaveBeenCalled())
        await waitFor(() => expect(window.md2Lifecycle?.confirmFlush).toHaveBeenCalledWith('quit-1'))
    })

    it('does not confirm Electron quit when an invalid action draft cannot flush', async () => {
        let flushRequested: ((requestId: string) => void) | null = null
        window.md2Lifecycle = {
            confirmFlush: vi.fn(),
            onFlushRequested: vi.fn((callback) => {
                flushRequested = callback

                return vi.fn()
            }),
        }
        renderProjectSurface()
        actionService.loadFromFiles([{
            content: JSON.stringify({ command: 'run', description: 'Run', id: 'run', label: 'Run', type: 'command' }),
            path: 'actions/run.json',
        }])
        actionService.updateDraft('actions/run.json', { command: 'run', description: 'Run', id: 'run', label: '', type: 'command' })

        act(() => flushRequested?.('quit-invalid'))

        await screen.findByText(/invalid unsaved changes/u)
        expect(window.md2Lifecycle.confirmFlush).not.toHaveBeenCalled()
        expect(projectPersistenceService.getSnapshot().hasPendingSave).toBe(true)
    })

    it('asks for a folder and persists an existing choice when the configured working folder is missing', async () => {
        const bridge = createBridge()
        let savedConfig: ProjectConfig | null = null
        bridge.listTopLevelFolders = vi.fn(async () => [
            { name: 'docs', path: 'docs' },
            { name: 'notes', path: 'notes' },
        ])
        bridge.loadProjectConfig = vi.fn(async () => savedConfig ?? { backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'missing' })
        const loadProject = vi.fn(async (_project, workingFolder) => {
            if (workingFolder === 'missing') throw new MissingWorkingFolderError(workingFolder)

            return {
                files: [{ content: '---\nid: F-1\ntitle: Root\nstatus: active\naffects:\n---\n\n# Root', path: `${workingFolder}/F-1-root.md` }],
                workingFolder,
            }
        })
        bridge.loadProject = loadProject
        bridge.loadProjectRoot = loadProject
        bridge.saveProjectConfig = vi.fn(async (_project, config) => {
            savedConfig = config
        })
        window.md2Data = bridge

        renderProjectSurface()
        requestLocalProject()

        expect(await screen.findByText('Working folder is missing: missing')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Use folder docs' })).toBeInTheDocument()
        expect(bridge.createWorkingFolderFromTemplate).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Use folder docs' }))

        await waitFor(() => expect(bridge.saveProjectConfig).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
            states: expect.arrayContaining([
                expect.objectContaining({ alwaysVisible: false, state: 'active' }),
                expect.objectContaining({ alwaysVisible: true, state: 'new' }),
                expect.objectContaining({ alwaysVisible: true, state: 'design' }),
                expect.objectContaining({ alwaysVisible: true, state: 'ready for implementation' }),
                expect.objectContaining({ alwaysVisible: true, state: 'in progress' }),
                expect.objectContaining({ alwaysVisible: true, state: 'done' }),
            ]),
            workingFolder: 'docs',
        })))
        expect(bridge.createWorkingFolderFromTemplate).not.toHaveBeenCalled()
        expect(await screen.findByText('Root')).toBeInTheDocument()
    })

    it('creates the configured folder only after the explicit create action', async () => {
        const bridge = createBridge()
        let isCreated = false
        bridge.listTopLevelFolders = vi.fn(async () => [{ name: 'docs', path: 'docs' }])
        bridge.loadProjectConfig = vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'missing' }))
        const loadProject = vi.fn(async (_project, workingFolder) => {
            if (!isCreated) throw new MissingWorkingFolderError(workingFolder)

            return {
                files: [{ content: '---\nid: F-1\ntitle: Root\nstatus: active\naffects:\n---\n\n# Root', path: `${workingFolder}/F-1-root.md` }],
                workingFolder,
            }
        })
        bridge.loadProject = loadProject
        bridge.loadProjectRoot = loadProject
        bridge.createWorkingFolderFromTemplate = vi.fn(async (project) => {
            isCreated = true

            return project
        })
        window.md2Data = bridge

        renderProjectSurface()
        requestLocalProject()

        await screen.findByText('Working folder is missing: missing')
        expect(bridge.createWorkingFolderFromTemplate).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: "Create 'missing' from template" }))

        await waitFor(() => expect(bridge.createWorkingFolderFromTemplate).toHaveBeenCalledWith(expect.any(Object), 'missing'))
        await waitFor(() => expect(bridge.saveProjectConfig).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ workingFolder: 'missing' })))
        expect(await screen.findByText('Root')).toBeInTheDocument()
    })

    it('creates a new feature card through the project menu', async () => {
        const bridge = createBridge()
        window.md2Data = bridge

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Project' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'New card...' }))
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Card' } })
        fireEvent.change(within(screen.getByRole('group', { name: 'Body' })).getByRole('textbox'), { target: { value: 'Body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))

        await waitFor(() => expect(bridge.commit).toHaveBeenCalledWith(expect.objectContaining({files: [expect.objectContaining({ path: 'design/F-3-new-card.md' })]})))
        expect(await screen.findByText('New Card')).toBeInTheDocument()
    })

    it('shows card creation failures in the new card dialog', async () => {
        const bridge = createBridge()
        bridge.commit = vi.fn(async () => {
            throw new Error('commit failed')
        })
        window.md2Data = bridge

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Project' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'New card...' }))
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Card' } })
        fireEvent.change(within(screen.getByRole('group', { name: 'Body' })).getByRole('textbox'), { target: { value: 'Body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))

        expect(await screen.findByText('commit failed')).toBeInTheDocument()
        expect(screen.getByRole('dialog', { name: 'New card' })).toBeInTheDocument()
    })

    it('lists custom configured card types and uses their prefix', async () => {
        const bridge = createBridge()
        bridge.loadProjectConfig = vi.fn(async () => ({
            backgroundShade: 'blue' as const,
            cardTypes: [{ color: '#123456', idPrefix: 'T', label: 'Task', type: 'task' }],
            projectFolder: '',
            workingFolder: 'design',
        }))
        window.md2Data = bridge

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Project' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'New card...' }))
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Card type' }))
        expect(await screen.findByRole('option', { name: 'Task' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'Feature' })).toBeNull()

        fireEvent.click(screen.getByRole('option', { name: 'Task' }))
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Task' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))

        await waitFor(() => expect(bridge.commit).toHaveBeenCalledWith(expect.objectContaining({files: [expect.objectContaining({ path: 'design/T-1-new-task.md' })]})))
    })

    it('completes a release from the project menu', async () => {
        const bridge = createBridge()
        window.md2Data = bridge

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Project' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Complete release...' }))
        fireEvent.change(await screen.findByLabelText('Release name'), { target: { value: 'v1' } })
        fireEvent.click(screen.getByRole('button', { name: 'Complete release' }))

        await waitFor(() => expect(bridge.moveFiles).toHaveBeenCalled())
        expect(screen.queryByText('Background cards loaded: 2')).toBeNull()
    })

    it('opens a card in the text view as a tab from the card body popup', async () => {
        window.md2Data = createBridge()

        renderProjectSurface()
        await openLocalProject()
        fireEvent.click(await screen.findByRole('button', { name: 'Drag F-1' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Open in file mode' }))

        expect(await screen.findByRole('tab', { name: /Root/ })).toBeInTheDocument()
        expect(screen.getByLabelText('File tree')).toBeInTheDocument()
    })

    it('opens a card in the text view as a tab from the card file-mode icon', async () => {
        window.md2Data = createBridge()

        renderProjectSurface()
        await openLocalProject()
        fireEvent.click(await screen.findByRole('button', { name: 'Open F-1 in file mode' }))

        expect(await screen.findByRole('tab', { name: /Root/ })).toBeInTheDocument()
        expect(screen.getByLabelText('File tree')).toBeInTheDocument()
    })

    it('renders the text view selected by the workspace view service', async () => {
        window.md2Data = createBridge()

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        act(() => workspaceViewService.setViewMode('text'))

        expect(screen.getByLabelText('File tree')).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Files' })).toBeNull()
    })

    it('restores open files after switching from text view to cards and back', async () => {
        window.md2Data = createBridge()

        renderProjectSurface()
        await openLocalProject()
        act(() => workspaceViewService.setViewMode('text'))
        const tree = within(await screen.findByLabelText('File tree'))
        fireEvent.click(tree.getByRole('button', { name: 'F-1 Root' }))
        fireEvent.click(tree.getByRole('button', { name: 'F-2 Old' }))
        expect(screen.getAllByRole('tab')).toHaveLength(2)

        act(() => workspaceViewService.setViewMode('cards'))
        expect(screen.queryByRole('tab')).toBeNull()
        act(() => workspaceViewService.setViewMode('text'))

        expect(await screen.findByRole('tab', { name: /Root/ })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /Old/ })).toBeInTheDocument()
    })

    it('restores the selected action editor section after switching to cards and back', async () => {
        window.md2Data = createBridge()

        renderProjectSurface()
        await openLocalProject()
        act(() => actionService.loadFromFiles([{
            content: JSON.stringify({
                description: 'Review the selected file', id: 'review-id', label: 'Review code',
                phrases: [{ text: 'Run tests', title: 'Tests' }], prompt: 'Review {{card-file}}', type: 'agent',
            }),
            path: 'design/actions/review.json',
        }]))
        act(() => workspaceViewService.setViewMode('text'))
        const tree = within(await screen.findByLabelText('File tree'))
        fireEvent.click(tree.getByRole('button', { name: 'Review code' }))
        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))

        act(() => workspaceViewService.setViewMode('cards'))
        act(() => workspaceViewService.setViewMode('text'))

        expect(await screen.findByRole('tab', { name: 'Tests' })).toHaveAttribute('aria-selected', 'true')
    }, 10_000)

    it('reveals a navigated card and keeps the current card view', async () => {
        window.md2Data = createBridge()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        act(() => workspaceNavigationService.open('design/F-1-root.md'))

        expect(screen.getByLabelText('Card columns')).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Active cards' })).toBeNull()
        const selected = document.querySelector('[data-selected="true"]')
        expect(selected).not.toBeNull()
        expect(selected).toHaveTextContent('Root')
        expect(trackEvent).toHaveBeenCalledWith('navigation')

        trackEvent.mockRestore()
    })

    it('deletes a selected card and clears the selected highlight', async () => {
        const bridge = createBridge()
        window.md2Data = bridge

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        act(() => workspaceNavigationService.open('design/F-1-root.md'))
        expect(document.querySelector('[data-selected="true"]')).not.toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
        const dialog = screen.getByRole('dialog', { name: 'Delete card' })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

        await waitFor(() => expect(bridge.deleteFile).toHaveBeenCalled())
        expect(screen.queryByText('Root')).not.toBeInTheDocument()
        expect(document.querySelector('[data-selected="true"]')).toBeNull()
    })

    it('shows a clear error when card deletion fails', async () => {
        const bridge = createBridge()
        bridge.deleteFile = vi.fn(async () => {
            throw new Error('delete failed')
        })
        window.md2Data = bridge

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
        const dialog = screen.getByRole('dialog', { name: 'Delete card' })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

        expect(await screen.findByText('delete failed')).toBeInTheDocument()
        expect(screen.getByText('Root')).toBeInTheDocument()
    })

    it('filters authenticated GitHub repositories', async () => {
        vi.stubGlobal('fetch', mockGithubFetch())

        renderProjectSurface(true)
        await openProjectDialog()

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Repository' })).not.toHaveAttribute('aria-disabled', 'true'))
        fireEvent.change(screen.getByLabelText('Filter repositories'), { target: { value: 'notes' } })
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Repository' }))

        expect(await screen.findByRole('option', { name: 'octo/notes' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'octo/demo' })).toBeNull()
    })

    it('loads GitHub branches from the selected repository', async () => {
        vi.stubGlobal('fetch', mockGithubFetch())

        renderProjectSurface(true)
        await openProjectDialog()

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Repository' })).not.toHaveAttribute('aria-disabled', 'true'))
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Repository' }))
        fireEvent.click(await screen.findByRole('option', { name: 'octo/demo' }))

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('trunk'))
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Branch' }))
        expect(screen.getByRole('option', { name: 'trunk' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'topic' })).toBeInTheDocument()
    })

    it('keeps manual GitHub branch loading usable after repository listing fails', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const fetchImplementation = vi.fn(async (url: string | URL | Request) => {
            const requestUrl = url.toString()
            if (requestUrl === GITHUB_REPOSITORIES_URL) return new Response('{}', { status: 403 })
            if (requestUrl === OWNER_REPOSITORY_URL) {
                return Response.json({ default_branch: 'trunk', full_name: 'octo/demo', name: 'demo', owner: { login: 'octo' } })
            }
            if (requestUrl === BRANCHES_URL) return Response.json([{ name: 'trunk' }, { name: 'topic' }])

            return new Response('{}', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchImplementation)

        renderProjectSurface(true)
        await openProjectDialog()

        expect(await screen.findByText(/GitHub storage request failed with status 403 for GET \/user\/repos/u)).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'octo' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Repository' }), { target: { value: 'demo' } })
        fireEvent.click(screen.getByRole('button', { name: 'Load branches' }))

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('trunk'))
        expect(consoleWarn).not.toHaveBeenCalled()
    })

    it('keeps manual GitHub branch loading usable after selected repository branch listing fails', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const fetchImplementation = vi.fn(async (url: string | URL | Request) => {
            const requestUrl = url.toString()
            if (requestUrl === GITHUB_REPOSITORIES_URL) {
                return Response.json([
                    { default_branch: 'trunk', full_name: 'octo/demo', name: 'demo', owner: { login: 'octo' } },
                ])
            }
            if (requestUrl === OWNER_REPOSITORY_URL) {
                return Response.json({ default_branch: 'trunk', full_name: 'octo/demo', name: 'demo', owner: { login: 'octo' } })
            }
            const branchRequestCount = fetchImplementation.mock.calls
                .filter(([callUrl]) => callUrl.toString() === BRANCHES_URL)
                .length
            if (requestUrl === BRANCHES_URL && branchRequestCount === 1) {
                return new Response('{}', { status: 500 })
            }
            if (requestUrl === BRANCHES_URL) return Response.json([{ name: 'trunk' }, { name: 'topic' }])

            return new Response('{}', { status: 404 })
        })
        vi.stubGlobal('fetch', fetchImplementation)

        renderProjectSurface(true)
        await openProjectDialog()

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Repository' })).not.toHaveAttribute('aria-disabled', 'true'))
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Repository' }))
        fireEvent.click(await screen.findByRole('option', { name: 'octo/demo' }))

        expect(await screen.findByText(
            'GitHub storage request failed with status 500 for GET /repos/octo/demo/branches',
        )).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Load branches' }))

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('trunk'))
        expect(consoleWarn).not.toHaveBeenCalled()
    })

    it('switches the current project branch from a branch dropdown', async () => {
        const bridge = createBridge()
        window.md2Data = bridge

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Project' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Switch branch...' }))
        await screen.findByRole('heading', { name: 'Switch branch' })
        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('main'))
        await chooseBranch('feature')
        fireEvent.click(screen.getByRole('button', { name: 'Switch' }))

        await waitFor(() => expect(bridge.checkoutBranch).toHaveBeenCalledWith(expect.objectContaining({ branch: 'main' }), 'feature'))
        await waitFor(() => expect(bridge.loadProject).toHaveBeenLastCalledWith(expect.objectContaining({ branch: 'feature' }), ''))
    })

    it('shows branch switch failures in the switch dialog', async () => {
        const bridge = createBridge()
        vi.mocked(bridge.checkoutBranch).mockRejectedValue(new Error('checkout failed'))
        window.md2Data = bridge

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Project' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Switch branch...' }))
        await screen.findByRole('heading', { name: 'Switch branch' })
        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('main'))
        await chooseBranch('feature')
        fireEvent.click(screen.getByRole('button', { name: 'Switch' }))

        expect(await screen.findByText('checkout failed')).toBeInTheDocument()
        expect(dataService.getState().project?.branch).toBe('main')
        expect(bridge.loadProjectRoot).not.toHaveBeenCalledWith(expect.objectContaining({ branch: 'feature' }), 'design')
    })
})
