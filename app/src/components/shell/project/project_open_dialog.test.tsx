import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../../data/electron_data_bridge'
import { RECENT_LOCAL_REPOSITORIES_STORAGE_KEY } from '../../../data/recent_local_repositories'
import { REMOTE_CONTROL_ENDPOINT_KEY } from '../../../data/remote_control_connection'
import { projectSessionService, type ProjectOpenResolution } from '../../../services/project/project_session_service'
import { projectOpenFlowService, type ProjectOpenSource } from '../../../services/project/project_open_flow_service'
import { applicationStorage } from '../../../services/storage/application_storage'
import { createDeferred } from '../../../services/test_support/data_service_test_support'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { useProjectOpenPhase } from '../../hooks/use_project_open_phase'
import { ProjectOpenDialog } from './project_open_dialog'

const LOCAL_PROJECT = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
const REPOSITORY = { branch: 'main', id: 'octo/demo', owner: 'octo', repository: 'demo' }

interface DialogOptions {
    accessToken?: string | null
    initialSource?: ProjectOpenSource
    initialProjectOpenResolution?: ProjectOpenResolution
    isGithubAuthenticated?: boolean
}

function ProjectOpenDialogHost() {
    const phase = useProjectOpenPhase()

    return phase === 'selecting' || phase === 'folder-setup' ? <ProjectOpenDialog key={phase} /> : null
}

function renderDialog(options: DialogOptions = {}) {
    projectOpenFlowService.close()
    projectOpenFlowService.setAuthentication(options.accessToken ?? 'token', options.isGithubAuthenticated ?? true)
    projectOpenFlowService.show({
        source: options.initialSource,
        resolution: options.initialProjectOpenResolution,
    })
    return render(<ProjectOpenDialogHost />, { wrapper: AppThemeProvider })
}

function setDesktopBridge(bridge: Partial<ElectronDataBridge> = {}) {
    window.md2Data = {
        openProjectFolder: vi.fn(async () => LOCAL_PROJECT),
        resolveProject: vi.fn(async () => LOCAL_PROJECT),
        ...bridge,
    } as ElectronDataBridge
}

function folderSetupResolution(): ProjectOpenResolution {
    return {
        existingFolderPaths: [],
        folders: [{ name: 'design', path: 'design' }],
        hasProjectConfig: false,
        kind: 'project-folder-setup',
        project: LOCAL_PROJECT,
        storageType: 'local',
        values: {
            actionsFolder: 'actions',
            archivedFolder: 'archived',
            diagramsFolder: 'diagrams',
            projectFolder: 'design',
            releasesFolder: 'history',
            workingFolder: 'active',
        },
    }
}

function clickBackdrop(dialogName: string) {
    const dialog = screen.getByRole('dialog', { name: dialogName })
    const backdrop = dialog.closest('.MuiDialog-root')?.querySelector('.MuiBackdrop-root')
    if (!backdrop) throw new Error('Missing dialog backdrop')

    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
}

describe('ProjectOpenDialog', () => {
    beforeEach(() => {
        projectOpenFlowService.close()
        window.md2Data = undefined
        window.localStorage.removeItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
        vi.spyOn(projectSessionService, 'listRepositories').mockResolvedValue([REPOSITORY])
    })

    afterEach(() => {
        cleanup()
        projectOpenFlowService.close()
        vi.restoreAllMocks()
        window.md2Data = undefined
        window.localStorage.removeItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
    })

    it('shows repository sources in browser mode and folder sources in desktop mode', () => {
        const { unmount } = renderDialog()
        expect(screen.queryByRole('group', { name: 'Project kind' })).toBeNull()
        expect(screen.getByRole('combobox', { name: 'Repository access' })).toBeInTheDocument()
        expect(screen.getByText(/Local folders can't be opened from the browser/)).toBeInTheDocument()
        unmount()

        setDesktopBridge()
        renderDialog()
        expect(within(screen.getByRole('group', { name: 'Project kind' })).getByRole('button', { name: 'Folder' }))
            .toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByLabelText('Local repository folder')).toBeInTheDocument()
        expect(screen.queryByText(/Local folders can't be opened from the browser/)).toBeNull()
    })

    it('warns that repositories need a GitHub access token until authenticated', async () => {
        renderDialog({ accessToken: null, initialSource: 'personal', isGithubAuthenticated: false })
        expect(screen.getByText(/Repositories can't be loaded without a GitHub access token/)).toBeInTheDocument()

        await userEvent.click(screen.getByRole('combobox', { name: 'Repository access' }))
        await userEvent.click(screen.getByRole('option', { name: 'Public' }))
        expect(screen.getByText('Public repository')).toBeInTheDocument()
        expect(screen.getByText(/Repositories can't be loaded without a GitHub access token/)).toBeInTheDocument()

        act(() => projectOpenFlowService.setAuthentication('token', true))
        expect(screen.queryByText(/Repositories can't be loaded without a GitHub access token/)).toBeNull()
    })

    it('does not warn about a missing GitHub access token for local folders', () => {
        setDesktopBridge()
        renderDialog({ accessToken: null, isGithubAuthenticated: false })

        expect(screen.queryByText(/Repositories can't be loaded without a GitHub access token/)).toBeNull()
    })

    it('loads branches for a selected personal repository and opens that branch', async () => {
        const listBranches = vi.spyOn(projectSessionService, 'listBranches').mockResolvedValue([{ name: 'main' }, { name: 'next' }])
        vi.spyOn(projectSessionService, 'findGithubRepositoryBranches')
            .mockResolvedValue({ branches: [{ name: 'main' }, { name: 'next' }], repository: REPOSITORY })
        const openProject = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        renderDialog()
        const repositorySelect = await screen.findByRole('combobox', { name: 'Repository' })
        fireEvent.mouseDown(repositorySelect)
        fireEvent.click(screen.getByRole('option', { name: 'octo/demo' }))
        await waitFor(() => expect(listBranches).toHaveBeenCalledWith('github', REPOSITORY, 'token'))
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Branch' }))
        fireEvent.click(screen.getByRole('option', { name: 'next' }))
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))

        await waitFor(() => expect(openProject).toHaveBeenCalledWith('github', { ...REPOSITORY, branch: 'next' }, 'token'))
        expect(projectOpenFlowService.getPhase()).toBe('closed')
    })

    it('uses read-only GitHub storage for a public repository', async () => {
        const findRepository = vi.spyOn(projectSessionService, 'findGithubRepositoryBranches')
            .mockResolvedValue({ branches: [{ name: 'main' }], repository: REPOSITORY })
        const openProject = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        renderDialog()
        fireEvent.mouseDown(screen.getByLabelText('Repository access'))
        fireEvent.click(screen.getByRole('option', { name: 'Public' }))
        await userEvent.type(screen.getByRole('textbox', { name: 'Owner' }), 'octo')
        await userEvent.type(screen.getByRole('textbox', { name: 'Repository' }), 'demo')
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))

        await waitFor(() => expect(findRepository).toHaveBeenCalledWith('octo', 'demo', 'token', 'github-readonly'))
        expect(openProject).toHaveBeenCalledWith('github-readonly', { ...REPOSITORY, branch: 'main' }, 'token')
    })

    it('opens a typed local folder through the desktop bridge and records it as recent', async () => {
        const resolveProject = vi.fn(async () => LOCAL_PROJECT)
        setDesktopBridge({ resolveProject })
        const openProject = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        renderDialog()
        await userEvent.type(screen.getByRole('textbox', { name: 'Local repository folder' }), 'C:/repo')
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))

        await waitFor(() => expect(openProject).toHaveBeenCalledWith('local', LOCAL_PROJECT, 'token'))
        expect(resolveProject).toHaveBeenCalledWith({ branch: '', id: 'C:/repo', rootPath: 'C:/repo' })
        expect(projectOpenFlowService.getPhase()).toBe('closed')
        expect(window.localStorage.getItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)).toContain('C:/repo')
    })

    it('opens a picked local folder through the desktop bridge', async () => {
        const openProjectFolder = vi.fn(async () => LOCAL_PROJECT)
        setDesktopBridge({ openProjectFolder })
        const openProject = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        renderDialog()
        fireEvent.click(screen.getByRole('button', { name: 'Choose local repository folder' }))

        await waitFor(() => expect(openProject).toHaveBeenCalledWith('local', LOCAL_PROJECT, 'token'))
        expect(openProjectFolder).toHaveBeenCalledOnce()
    })

    it('stays hidden between project load completion and recent-folder recording', async () => {
        setDesktopBridge()
        vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        const write = createDeferred<void>()
        const recordRecent = vi.spyOn(applicationStorage, 'writeCurrentItem').mockReturnValue(write.promise)
        renderDialog()

        fireEvent.click(screen.getByRole('button', { name: 'Choose local repository folder' }))
        await waitFor(() => expect(recordRecent).toHaveBeenCalledOnce())

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open project' })).toBeNull())
        expect(projectOpenFlowService.getPhase()).toBe('loading')

        await act(async () => write.resolve())
        await waitFor(() => expect(projectOpenFlowService.getPhase()).toBe('closed'))
    })

    it('shows folder setup when a project load needs a resolution', async () => {
        setDesktopBridge()
        vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(folderSetupResolution())
        renderDialog()

        fireEvent.click(screen.getByRole('button', { name: 'Choose local repository folder' }))

        expect(await screen.findByRole('dialog', { name: 'Project folders' })).toBeInTheDocument()
        expect(projectOpenFlowService.getPhase()).toBe('folder-setup')
    })

    it('groups explained outlined folder fields and shows their resolved missing paths', () => {
        renderDialog({ initialProjectOpenResolution: folderSetupResolution() })
        const dialog = screen.getByRole('dialog', { name: 'Project folders' })
        const projectFolderCard = within(dialog).getByRole('region', { name: 'Project folder' })
        const currentFilesCard = within(dialog).getByRole('region', { name: 'Current project files' })
        const historyCard = within(dialog).getByRole('region', { name: 'History' })
        expect(within(dialog).getAllByRole('region')).toEqual([projectFolderCard, currentFilesCard, historyCard])

        expect(within(projectFolderCard).getByText(
            'Choose the top-level repository folder that contains this MD² project.',
        )).toBeInTheDocument()
        expect(within(currentFilesCard).getByText(
            'These folders contain files MD² reads or writes while work on the project is active.',
        )).toBeInTheDocument()
        expect(within(historyCard).getByText(
            'These folders contain completed releases and cards archived outside a release.',
        )).toBeInTheDocument()

        expect(within(projectFolderCard).getAllByRole('combobox').map((input) => input.getAttribute('aria-label')))
            .toEqual(['Project folder'])
        expect(within(currentFilesCard).getAllByRole('combobox').map((input) => input.getAttribute('aria-label')))
            .toEqual(['Working folder', 'Diagrams folder', 'Actions folder'])
        expect(within(historyCard).getAllByRole('combobox').map((input) => input.getAttribute('aria-label')))
            .toEqual(['Releases folder', 'Archived folder'])

        const helperDescriptions = [
            'Contains the MD² project configuration and all project subfolders.',
            'Contains active design and job Markdown files that MD² loads as cards.',
            'Contains JSON diagram data saved by diagram actions.',
            'Contains JSON definitions for project actions.',
            'Contains one subfolder for each completed release.',
            'Contains cards archived individually outside a release.',
        ]
        helperDescriptions.forEach((description) => {
            expect(within(dialog).getByText(description)).toBeInTheDocument()
        })

        const folderInputs = within(dialog).getAllByRole('combobox')
        expect(folderInputs).toHaveLength(6)
        folderInputs.forEach((input) => {
            expect(input.closest('.MuiOutlinedInput-root')).toBeInTheDocument()
        })
        const resolvedPaths = [
            'Resolved path: design',
            'Resolved path: design/active',
            'Resolved path: design/diagrams',
            'Resolved path: design/actions',
            'Resolved path: design/history',
            'Resolved path: design/archived',
        ]
        resolvedPaths.forEach((resolvedPath) => {
            expect(within(dialog).getByText(resolvedPath)).toBeInTheDocument()
        })
        expect(within(dialog).getAllByText('Will be created')).toHaveLength(6)
    })

    it('hides creation markers for resolved paths that already exist', () => {
        const resolution = {
            ...folderSetupResolution(),
            existingFolderPaths: [
                'design',
                'design/active',
                'design/diagrams',
                'design/actions',
                'design/history',
                'design/archived',
            ],
        }
        renderDialog({ initialProjectOpenResolution: resolution })

        expect(screen.queryByText('Will be created')).toBeNull()
    })

    it('supports free-text folder editing', async () => {
        renderDialog({ initialProjectOpenResolution: folderSetupResolution() })
        const workingFolder = screen.getByRole('combobox', { name: 'Working folder' })
        await userEvent.clear(workingFolder)
        await userEvent.type(workingFolder, 'current/cards')

        expect(workingFolder).toHaveValue('current/cards')
        expect(screen.getByText('Resolved path: design/current/cards')).toBeInTheDocument()
    })

    it('stays hidden after folder setup while recording the opened local project', async () => {
        setDesktopBridge()
        vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(folderSetupResolution())
        vi.spyOn(projectSessionService, 'confirmProjectFolderSetup').mockResolvedValue(undefined)
        const write = createDeferred<void>()
        const recordRecent = vi.spyOn(applicationStorage, 'writeCurrentItem').mockReturnValue(write.promise)
        renderDialog()

        fireEvent.click(screen.getByRole('button', { name: 'Choose local repository folder' }))
        const folderDialog = await screen.findByRole('dialog', { name: 'Project folders' })
        fireEvent.click(within(folderDialog).getByRole('button', { name: 'Open' }))
        await waitFor(() => expect(recordRecent).toHaveBeenCalledOnce())

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Project folders' })).toBeNull())
        expect(projectOpenFlowService.getPhase()).toBe('loading')

        await act(async () => write.resolve())
        await waitFor(() => expect(projectOpenFlowService.getPhase()).toBe('closed'))
    })

    it('selects, opens, and removes a recent local folder', async () => {
        window.localStorage.setItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY, JSON.stringify(['C:/recent', 'C:/other']))
        const resolveProject = vi.fn(async () => LOCAL_PROJECT)
        setDesktopBridge({ resolveProject })
        const openProject = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        renderDialog()

        fireEvent.click(screen.getByText('C:/recent'))
        expect(screen.getByRole('textbox', { name: 'Local repository folder' })).toHaveValue('C:/recent')
        fireEvent.click(screen.getByRole('button', { name: 'Remove C:/other from recent folders' }))
        await waitFor(() => expect(screen.queryByText('C:/other')).toBeNull())
        fireEvent.doubleClick(screen.getByText('C:/recent'))
        await waitFor(() => expect(openProject).toHaveBeenCalledOnce())
        expect(resolveProject).toHaveBeenCalledWith({ branch: '', id: 'C:/recent', rootPath: 'C:/recent' })
    })

    it('shows folder setup, validates the values, and confirms through the project session', async () => {
        const confirm = vi.spyOn(projectSessionService, 'confirmProjectFolderSetup').mockResolvedValue(undefined)
        renderDialog({ initialProjectOpenResolution: folderSetupResolution() })
        expect(screen.getByRole('dialog', { name: 'Project folders' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))

        await waitFor(() => expect(confirm).toHaveBeenCalledWith(folderSetupResolution(), folderSetupResolution().values, 'token'))
        expect(projectOpenFlowService.getPhase()).toBe('closed')
    })

    it('disables confirmation for an empty folder value', async () => {
        renderDialog({ initialProjectOpenResolution: folderSetupResolution() })
        await userEvent.clear(screen.getByRole('combobox', { name: 'Working folder' }))

        expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled()
    })

    it('does not show folder setup for a read-only project', () => {
        const resolution = { ...folderSetupResolution(), storageType: 'github-readonly' as const }
        renderDialog({ initialProjectOpenResolution: resolution })

        expect(screen.queryByRole('combobox', { name: 'Working folder' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
    })

    it('keeps folder setup open on backdrop click and allows Cancel', () => {
        renderDialog({ initialProjectOpenResolution: folderSetupResolution() })
        clickBackdrop('Project folders')
        expect(projectOpenFlowService.getPhase()).toBe('folder-setup')
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(projectOpenFlowService.getPhase()).toBe('closed')
    })

    it('browses a project subfolder relative to the project folder', async () => {
        const selectProjectSubFolder = vi.fn(async () => 'C:/repo/design/active/cards')
        setDesktopBridge({ selectProjectSubFolder })
        renderDialog({ initialProjectOpenResolution: folderSetupResolution() })
        fireEvent.click(screen.getByRole('button', { name: 'Choose working folder' }))

        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Working folder' })).toHaveValue('active/cards'))
        expect(selectProjectSubFolder).toHaveBeenCalledWith('C:/repo')
    })
})
