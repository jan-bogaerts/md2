import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallback, useState, type ReactNode } from 'react'
import { MissingWorkingFolderError, type ProjectConfig, type StorageService } from '../data/data_types'
import type { ElectronDataBridge } from '../data/electron_data_bridge'
import { configService } from '../services/config_service'
import { dataService } from '../services/data_service'
import { telemetryService } from '../services/telemetry_service'
import { workspaceNavigationService } from '../services/workspace_navigation_service'
import { ProjectWorkspace } from './project_workspace'
import { ProjectToolbarMenu } from './shell/project_toolbar_menu'

const GITHUB_REPOSITORIES_URL = 'https://api.github.com/user/repos?per_page=100&page=1'
const OWNER_REPOSITORY_URL = 'https://api.github.com/repos/octo/demo'
const BRANCHES_URL = 'https://api.github.com/repos/octo/demo/branches'

function createBridge(): ElectronDataBridge {
    const files = [
        { content: '---\nid: F-1\ntitle: Root\nstatus: active\naffects:\n---\n\n# Root', path: 'design/F-1-root.md' },
        { content: '# Old', path: 'design/history/F-2-old.md' },
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
        listBranches: vi.fn(async () => [{ name: 'main' }, { name: 'feature' }]),
        listRepositoryFiles: vi.fn(async () => ['app/src/app.tsx', 'design/F-1-root.md']),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadProject: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({
            files: files.filter((file) => !file.path.slice('design/'.length).includes('/')),
            workingFolder: 'design',
        })),
        loadProjectConfig: vi.fn(async () => null),
        moveFiles: vi.fn(async (request) => {
            for (const move of request.moves) {
                const existingIndex = files.findIndex((file) => file.path === move.fromPath)
                if (existingIndex >= 0) files.splice(existingIndex, 1)
                files.push({ content: move.content, path: move.toPath })
            }
        }),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
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

function renderProjectSurface(isGithubAuthenticated = false) {
    function ProjectSurface() {
        const [leftPanelContent, setLeftPanelContent] = useState<ReactNode>(null)
        const handleLeftPanelInteraction = useCallback(() => undefined, [])

        return (
            <>
                <ProjectToolbarMenu accessToken="token" isGithubAuthenticated={isGithubAuthenticated} />
                {leftPanelContent}
                <ProjectWorkspace
                    bootstrapError={null}
                    onLeftPanelContentChange={setLeftPanelContent}
                    onLeftPanelInteraction={handleLeftPanelInteraction}
                />
            </>
        )
    }

    return render(
        <ProjectSurface />,
    )
}

async function openProjectDialog() {
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open project...' }))
    await screen.findByRole('heading', { name: 'Open project' })
}

async function chooseLocalSource() {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Source' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Local' }))
}

async function chooseBranch(branch: string) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Branch' }))
    fireEvent.click(await screen.findByRole('option', { name: branch }))
}

async function openLocalProject() {
    await openProjectDialog()
    await chooseLocalSource()
    fireEvent.click(screen.getByRole('button', { name: 'Choose local folder...' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('main'))
    fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
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
        dataService.init({ storage: createResetStorage() })
    })

    afterEach(() => {
        cleanup()
        configService.clear()
        window.localStorage.clear()
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
    })

    it('opens a local project and shows root cards in the card view before background cards', async () => {
        window.md2Data = createBridge()

        renderProjectSurface()
        await openLocalProject()

        expect(await screen.findByText('Root')).toBeInTheDocument()
        expect(screen.getByText('F-1')).toBeInTheDocument()
        expect(screen.getAllByText('active').length).toBeGreaterThan(0)
        expect(screen.getByLabelText('Card columns')).toHaveTextContent('active')
        expect(screen.getByText('Background cards loaded: 1')).toBeInTheDocument()
    })

    it('flushes pending commits when the app is hidden', async () => {
        const bridge = createBridge()
        window.md2Data = bridge
        const visibilityState = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        dataService.updateCardBody('design/F-1-root.md', 'Changed while open')
        await waitFor(() => expect(dataService.getState().hasPendingCommits).toBe(true))
        document.dispatchEvent(new Event('visibilitychange'))

        await waitFor(() => expect(bridge.commit).toHaveBeenCalledWith(expect.objectContaining({files: [expect.objectContaining({ path: 'design/F-1-root.md' })]})))
        expect(dataService.getState().hasPendingCommits).toBe(false)

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

        dataService.updateCardBody('design/F-1-root.md', 'Changed before close')
        await waitFor(() => expect(dataService.getState().hasPendingCommits).toBe(true))

        const pendingClose = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(pendingClose)

        expect(pendingClose.defaultPrevented).toBe(true)
    })

    it('confirms close when storage has unpushed commits', async () => {
        const storage = createResetStorage()
        storage.hasPendingCommits = vi.fn(() => true)
        dataService.init({ storage })
        await dataService.openProject({ branch: 'main', id: 'project' })

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

        dataService.updateCardBody('design/F-1-root.md', 'Changed before quit')
        await waitFor(() => expect(dataService.getState().hasPendingCommits).toBe(true))
        act(() => flushRequested?.('quit-1'))

        await waitFor(() => expect(bridge.commit).toHaveBeenCalled())
        await waitFor(() => expect(window.md2Lifecycle?.confirmFlush).toHaveBeenCalledWith('quit-1'))
    })

    it('asks for a folder and persists an existing choice when the configured working folder is missing', async () => {
        const bridge = createBridge()
        let savedConfig: ProjectConfig | null = null
        bridge.listTopLevelFolders = vi.fn(async () => [
            { name: 'docs', path: 'docs' },
            { name: 'notes', path: 'notes' },
        ])
        bridge.loadProjectConfig = vi.fn(async () => savedConfig ?? { workingFolder: 'missing' })
        const loadProject = vi.fn(async (_project, workingFolder) => {
            if (!savedConfig) throw new MissingWorkingFolderError(workingFolder)

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
        await openProjectDialog()
        await chooseLocalSource()
        fireEvent.click(screen.getByRole('button', { name: 'Choose local folder...' }))
        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('main'))
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))

        expect(await screen.findByText('Working folder is missing: missing')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Use folder docs' })).toBeInTheDocument()
        expect(bridge.createWorkingFolderFromTemplate).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Use folder docs' }))

        await waitFor(() => expect(bridge.saveProjectConfig).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ workingFolder: 'docs' })))
        expect(bridge.createWorkingFolderFromTemplate).not.toHaveBeenCalled()
        expect(await screen.findByText('Root')).toBeInTheDocument()
    })

    it('creates the configured folder only after the explicit create action', async () => {
        const bridge = createBridge()
        let isCreated = false
        bridge.listTopLevelFolders = vi.fn(async () => [{ name: 'docs', path: 'docs' }])
        bridge.loadProjectConfig = vi.fn(async () => ({ workingFolder: 'missing' }))
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
        await openProjectDialog()
        await chooseLocalSource()
        fireEvent.click(screen.getByRole('button', { name: 'Choose local folder...' }))
        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('main'))
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))

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
        fireEvent.change(screen.getByLabelText('New card title'), { target: { value: 'New Card' } })
        fireEvent.change(screen.getByLabelText('New card body'), { target: { value: 'Body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))

        await waitFor(() => expect(bridge.commit).toHaveBeenCalledWith(expect.objectContaining({files: [expect.objectContaining({ path: 'design/F-3-new-card.md' })]})))
        expect(await screen.findByText('New Card')).toBeInTheDocument()
    })

    it('creates job and bug cards with the type-specific id prefix', async () => {
        const bridge = createBridge()
        window.md2Data = bridge

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        const createCardOfType = async (typeLabel: string, title: string) => {
            fireEvent.click(screen.getByRole('button', { name: 'Project' }))
            fireEvent.click(screen.getByRole('menuitem', { name: 'New card...' }))
            fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Card type' }))
            fireEvent.click(await screen.findByRole('option', { name: typeLabel }))
            fireEvent.change(screen.getByLabelText('New card title'), { target: { value: title } })
            fireEvent.click(screen.getByRole('button', { name: 'Create card' }))
            await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New card' })).toBeNull())
        }

        await createCardOfType('Job', 'New Job')
        await waitFor(() => expect(bridge.commit).toHaveBeenCalledWith(expect.objectContaining({files: [expect.objectContaining({ path: 'design/J-1-new-job.md' })]})))

        await createCardOfType('Bug', 'New Bug')
        await waitFor(() => expect(bridge.commit).toHaveBeenCalledWith(expect.objectContaining({files: [expect.objectContaining({ path: 'design/B-1-new-bug.md' })]})))
    })

    it('lists custom configured card types and uses their prefix', async () => {
        const bridge = createBridge()
        bridge.loadProjectConfig = vi.fn(async () => ({cardTypes: [{ color: '#123456', idPrefix: 'T', label: 'Task', type: 'task' }]}))
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
        fireEvent.change(screen.getByLabelText('New card title'), { target: { value: 'New Task' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))

        await waitFor(() => expect(bridge.commit).toHaveBeenCalledWith(expect.objectContaining({files: [expect.objectContaining({ path: 'design/T-1-new-task.md' })]})))
    })

    it('completes a release from the project menu', async () => {
        const bridge = createBridge()
        window.md2Data = bridge
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue('v1')

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Project' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Complete release...' }))

        await waitFor(() => expect(bridge.moveFiles).toHaveBeenCalled())
        expect(await screen.findByText('Background cards loaded: 2')).toBeInTheDocument()

        prompt.mockRestore()
    })

    it('opens a card in the text view as a tab from the card body dialog', async () => {
        window.md2Data = createBridge()

        renderProjectSurface()
        await openLocalProject()
        fireEvent.click(await screen.findByText('Root'))
        fireEvent.click(await screen.findByRole('button', { name: 'Open in file mode' }))

        expect(await screen.findByRole('tab', { name: /Root/ })).toBeInTheDocument()
        expect(screen.getByLabelText('File tree')).toBeInTheDocument()
    })

    it('switches to the text view from the view toggle', async () => {
        window.md2Data = createBridge()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Text' }))

        expect(screen.getByLabelText('File tree')).toBeInTheDocument()
        expect(trackEvent).toHaveBeenCalledWith('navigation')

        trackEvent.mockRestore()
    })

    it('reveals a navigated card and keeps the current card view', async () => {
        window.md2Data = createBridge()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        act(() => workspaceNavigationService.open('design/F-1-root.md'))

        expect(screen.getByRole('heading', { name: 'Active cards' })).toBeInTheDocument()
        const selected = document.querySelector('[data-selected="true"]')
        expect(selected).not.toBeNull()
        expect(selected).toHaveTextContent('Root')
        expect(trackEvent).toHaveBeenCalledWith('navigation')

        trackEvent.mockRestore()
    })

    it('deletes a selected card and clears the selected highlight', async () => {
        const bridge = createBridge()
        window.md2Data = bridge
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        act(() => workspaceNavigationService.open('design/F-1-root.md'))
        expect(document.querySelector('[data-selected="true"]')).not.toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

        await waitFor(() => expect(bridge.deleteFile).toHaveBeenCalled())
        expect(screen.queryByText('Root')).not.toBeInTheDocument()
        expect(document.querySelector('[data-selected="true"]')).toBeNull()

        confirm.mockRestore()
    })

    it('shows a clear error when card deletion fails', async () => {
        const bridge = createBridge()
        bridge.deleteFile = vi.fn(async () => {
            throw new Error('delete failed')
        })
        window.md2Data = bridge
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

        renderProjectSurface()
        await openLocalProject()
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

        expect(await screen.findByText('delete failed')).toBeInTheDocument()
        expect(screen.getByText('Root')).toBeInTheDocument()

        confirm.mockRestore()
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

        expect(await screen.findByText('GitHub storage request failed with status 403')).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'octo' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Repository' }), { target: { value: 'demo' } })
        fireEvent.click(screen.getByRole('button', { name: 'Load branches' }))

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('trunk'))
        expect(screen.queryByText('GitHub storage request failed with status 403')).toBeNull()
    })

    it('keeps manual GitHub branch loading usable after selected repository branch listing fails', async () => {
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

        expect(await screen.findByText('GitHub storage request failed with status 500')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Load branches' }))

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('trunk'))
        expect(screen.queryByText('GitHub storage request failed with status 500')).toBeNull()
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
        await waitFor(() => expect(bridge.loadProject).toHaveBeenLastCalledWith(expect.objectContaining({ branch: 'feature' }), 'design'))
    })
})
