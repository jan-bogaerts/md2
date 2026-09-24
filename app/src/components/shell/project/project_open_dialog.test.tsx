import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../../../data/electron_data_bridge'
import { RECENT_LOCAL_REPOSITORIES_STORAGE_KEY } from '../../../data/recent_local_repositories'
import { configureRemoteControlConnection, REMOTE_CONTROL_ENDPOINT_KEY } from '../../../data/remote_control_connection'
import { projectSessionService, type ProjectOpenResolution } from '../../../services/project/project_session_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ProjectOpenDialog } from './project_open_dialog'

const LOCAL_PROJECT = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
const REPOSITORY = { branch: 'main', id: 'octo/demo', owner: 'octo', repository: 'demo' }

function dialogProps(overrides: Partial<ComponentProps<typeof ProjectOpenDialog>> = {}) {
    return {
        accessToken: 'token',
        isGithubAuthenticated: true,
        onClose: vi.fn(),
        open: true,
        ...overrides,
    }
}

function renderDialog(overrides: Partial<ComponentProps<typeof ProjectOpenDialog>> = {}) {
    const props = dialogProps(overrides)
    render(<ProjectOpenDialog {...props} />, { wrapper: AppThemeProvider })

    return props
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
        window.md2Data = undefined
        window.localStorage.removeItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
        vi.spyOn(projectSessionService, 'listRepositories').mockResolvedValue([REPOSITORY])
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        window.md2Data = undefined
        window.localStorage.removeItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
    })

    it('shows repository sources in browser mode and folder sources in desktop mode', () => {
        const { unmount } = render(<ProjectOpenDialog {...dialogProps()} />, { wrapper: AppThemeProvider })
        expect(within(screen.getByRole('group', { name: 'Project kind' })).getByRole('button', { name: 'Repository' }))
            .toHaveAttribute('aria-pressed', 'true')
        unmount()

        setDesktopBridge()
        renderDialog()
        expect(within(screen.getByRole('group', { name: 'Project kind' })).getByRole('button', { name: 'Folder' }))
            .toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByLabelText('Local repository folder')).toBeInTheDocument()
    })

    it('loads branches for a selected personal repository and opens that branch', async () => {
        const listBranches = vi.spyOn(projectSessionService, 'listBranches').mockResolvedValue([{ name: 'main' }, { name: 'next' }])
        vi.spyOn(projectSessionService, 'findGithubRepositoryBranches')
            .mockResolvedValue({ branches: [{ name: 'main' }, { name: 'next' }], repository: REPOSITORY })
        const openProject = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        const props = renderDialog()
        const repositorySelect = await screen.findByRole('combobox', { name: 'Repository' })
        fireEvent.mouseDown(repositorySelect)
        fireEvent.click(screen.getByRole('option', { name: 'octo/demo' }))
        await waitFor(() => expect(listBranches).toHaveBeenCalledWith('github', REPOSITORY, 'token'))
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Branch' }))
        fireEvent.click(screen.getByRole('option', { name: 'next' }))
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))

        await waitFor(() => expect(openProject).toHaveBeenCalledWith('github', { ...REPOSITORY, branch: 'next' }, 'token'))
        expect(props.onClose).toHaveBeenCalledOnce()
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
        const props = renderDialog()
        await userEvent.type(screen.getByRole('textbox', { name: 'Local repository folder' }), 'C:/repo')
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))

        await waitFor(() => expect(openProject).toHaveBeenCalledWith('local', LOCAL_PROJECT, 'token'))
        expect(resolveProject).toHaveBeenCalledWith({ branch: '', id: 'C:/repo', rootPath: 'C:/repo' })
        expect(props.onClose).toHaveBeenCalledOnce()
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

    it('prefills the endpoint, project path, and branch when opening an active remote project', () => {
        configureRemoteControlConnection({ endpoint: 'https://remote.example' })
        renderDialog({
            initialRemoteProject: { branch: 'develop', id: '/work/project', rootPath: '/work/project' },
            initialSource: 'remote',
        })

        expect(screen.getByRole('textbox', { name: 'Endpoint' })).toHaveValue('https://remote.example')
        expect(screen.getByRole('textbox', { name: 'Project root path' })).toHaveValue('/work/project')
        expect(screen.getByRole('textbox', { name: 'Branch' })).toHaveValue('develop')
    })

    it('loads and opens a remote project using its selected branch', async () => {
        const configureRemote = vi.spyOn(projectSessionService, 'configureRemote').mockImplementation(() => undefined)
        const listBranches = vi.spyOn(projectSessionService, 'listBranches').mockResolvedValue([{ name: 'develop' }])
        const openProject = vi.spyOn(projectSessionService, 'openProject').mockResolvedValue(null)
        renderDialog({ initialSource: 'remote', isGithubAuthenticated: false })
        await userEvent.type(screen.getByRole('textbox', { name: 'Endpoint' }), 'https://remote.example')
        await userEvent.type(screen.getByRole('textbox', { name: 'Project root path' }), '/work/project')
        await userEvent.clear(screen.getByRole('textbox', { name: 'Branch' }))
        await userEvent.type(screen.getByRole('textbox', { name: 'Branch' }), 'develop')
        fireEvent.click(screen.getByRole('button', { name: 'Load remote branches' }))
        await waitFor(() => expect(listBranches).toHaveBeenCalledWith('remote', {branch: 'develop', id: '/work/project', rootPath: '/work/project'}, 'token'))
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))
        await waitFor(() => expect(openProject).toHaveBeenCalledWith('remote', {branch: 'develop', id: '/work/project', rootPath: '/work/project'}, 'token'))
        expect(configureRemote).toHaveBeenCalledWith('https://remote.example')
    })

    it('shows folder setup, validates the values, and confirms through the project session', async () => {
        const confirm = vi.spyOn(projectSessionService, 'confirmProjectFolderSetup').mockResolvedValue(undefined)
        const props = renderDialog({ initialProjectOpenResolution: folderSetupResolution() })
        expect(screen.getByRole('dialog', { name: 'Project folders' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))

        await waitFor(() => expect(confirm).toHaveBeenCalledWith(folderSetupResolution(), folderSetupResolution().values, 'token'))
        expect(props.onClose).toHaveBeenCalledOnce()
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
        const props = renderDialog({ initialProjectOpenResolution: folderSetupResolution() })
        clickBackdrop('Project folders')
        expect(props.onClose).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(props.onClose).toHaveBeenCalledOnce()
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
