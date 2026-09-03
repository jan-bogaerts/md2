import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    DEFAULT_CARD_TYPES,
    DEFAULT_STATES,
    type BranchReference,
    type ProjectReference,
    type RepositoryReference,
} from '../../../data/data_types'
import {
    configureRemoteControlConnection,
    REMOTE_CONTROL_ENDPOINT_KEY,
} from '../../../data/remote_control_connection'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { dialogService } from '../../../services/dialog_service'
import { projectSessionService } from '../../../services/project/project_session_service'
import { createDeferred } from '../../../services/test_support/data_service_test_support'
import { BranchSwitchDialog } from './branch_switch_dialog'
import { CompleteReleaseDialog } from './complete_release_dialog'
import { NewCardDialog } from './new_card_dialog'
import { ProjectOpenDialog } from './project_open_dialog'

const BRANCHES: BranchReference[] = [{ name: 'main' }]
const PROJECT: ProjectReference = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
const REPOSITORIES: RepositoryReference[] = [{ branch: 'main', id: 'octo/demo', owner: 'octo', repository: 'demo' }]

type ProjectOpenDialogProps = ComponentProps<typeof ProjectOpenDialog>

function projectOpenDialogProps(overrides: Partial<ProjectOpenDialogProps>): ProjectOpenDialogProps {
    return {
        branches: [],
        isDesktopMode: false,
        isGithubAuthenticated: true,
        isLoading: false,
        onBranchChange: vi.fn(),
        onChooseLocalFolder: vi.fn(async () => undefined),
        onBrowseProjectSubFolder: null,
        onClose: vi.fn(),
        onConfirmProjectFolderSetup: vi.fn(),
        onCreateRemoteProject: vi.fn(),
        onDiscardGithubPendingCommits: vi.fn(),
        onLoadManualBranches: vi.fn(async () => null),
        onLoadRemoteBranches: vi.fn(async () => []),
        onOpenGithub: vi.fn(async () => undefined),
        onOpenLocal: vi.fn(async () => undefined),
        onOpenRemote: vi.fn(async () => undefined),
        onRepositoryChange: vi.fn(async () => []),
        onSourceChange: vi.fn(),
        open: true,
        pendingGithubConflictProject: null,
        projectOpenResolution: null,
        recentLocalRepositories: [],
        repositories: [],
        ...overrides,
    }
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

function getDescriptionEditor() {
    return within(screen.getByRole('group', { name: 'Description' })).getByRole('textbox')
}

function dismissThroughBackdrop() {
    const dialog = screen.getByRole('dialog', { name: 'New card' })
    const backdrop = dialog.closest('.MuiDialog-root')?.querySelector('.MuiBackdrop-root')
    if (!backdrop) throw new Error('Missing new-card dialog backdrop')

    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
}

function insertEditorNewline(event: Event) {
    const keyboardEvent = event as globalThis.KeyboardEvent
    if (keyboardEvent.key !== 'Enter') return

    const editor = event.currentTarget as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: `${editor.value}\n` } })
}

describe('project dialog components', () => {
    beforeEach(() => {
        mockMatchMedia(false)
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
    })

    it('renders the open project dialog without mounting the menu', () => {
        render(
            <ProjectOpenDialog
                branches={BRANCHES}
                isDesktopMode={false}
                isGithubAuthenticated
                isLoading={false}
                onChooseLocalFolder={vi.fn(async () => undefined)}
                projectOpenResolution={null}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onBrowseProjectSubFolder={null}
                onConfirmProjectFolderSetup={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                open
                pendingGithubConflictProject={null}
                recentLocalRepositories={[]}
                repositories={REPOSITORIES}
            />,
        )

        expect(screen.getByRole('dialog', { name: 'Open project' })).toBeInTheDocument()
        expect(screen.getByLabelText('Filter repositories')).toBeInTheDocument()
    })

    it('offers repository access choices and maps Folder to Remote in browser mode', async () => {
        render(
            <ProjectOpenDialog
                branches={[]}
                isDesktopMode={false}
                isGithubAuthenticated
                isLoading={false}
                onBranchChange={vi.fn()}
                onChooseLocalFolder={vi.fn(async () => undefined)}
                onClose={vi.fn()}
                onBrowseProjectSubFolder={null}
                onConfirmProjectFolderSetup={vi.fn()}
                onCreateRemoteProject={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => null)}
                onLoadRemoteBranches={vi.fn(async () => [])}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => [])}
                onSourceChange={vi.fn()}
                open
                pendingGithubConflictProject={null}
                projectOpenResolution={null}
                recentLocalRepositories={[]}
                repositories={[]}
            />,
        )

        const projectKind = screen.getByRole('group', { name: 'Project kind' })
        expect(within(projectKind).getByRole('button', { name: 'Repository' })).toHaveAttribute('aria-pressed', 'true')
        expect(within(projectKind).getByRole('button', { name: 'Folder' })).toHaveAttribute('aria-pressed', 'false')
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Repository access' }))
        expect(await screen.findByRole('option', { name: 'Personal' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Public' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('option', { name: 'Personal' }))
        fireEvent.click(screen.getByRole('button', { name: 'Folder' }))
        expect(screen.getByLabelText('Endpoint')).toBeInTheDocument()
        expect(screen.queryByLabelText('Local repository folder')).toBeNull()
    })

    it('clears repository workflow state when access or project kind changes', async () => {
        const onSourceChange = vi.fn()
        const openGithub = vi.fn()
        const openRemote = vi.fn()
        render(
            <ProjectOpenDialog
                branches={BRANCHES}
                isDesktopMode={false}
                isGithubAuthenticated
                isLoading={false}
                onBranchChange={vi.fn()}
                onChooseLocalFolder={vi.fn(async () => undefined)}
                onClose={vi.fn()}
                onBrowseProjectSubFolder={null}
                onConfirmProjectFolderSetup={vi.fn()}
                onCreateRemoteProject={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => null)}
                onLoadRemoteBranches={vi.fn(async () => [])}
                onOpenGithub={openGithub}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={openRemote}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={onSourceChange}
                open
                pendingGithubConflictProject={null}
                projectOpenResolution={null}
                recentLocalRepositories={[]}
                repositories={REPOSITORIES}
            />,
        )

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Repository' }))
        fireEvent.click(await screen.findByRole('option', { name: 'octo/demo' }))
        await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('main'))

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Repository access' }))
        fireEvent.click(await screen.findByRole('option', { name: 'Public' }))
        expect(screen.getByRole('combobox', { name: 'Branch' })).not.toHaveTextContent('main')
        expect(onSourceChange).toHaveBeenCalledOnce()

        fireEvent.click(screen.getByRole('button', { name: 'Folder' }))
        expect(screen.getByLabelText('Endpoint')).toBeInTheDocument()
        expect(onSourceChange).toHaveBeenCalledTimes(2)
        expect(openGithub).not.toHaveBeenCalled()
        expect(openRemote).not.toHaveBeenCalled()
    })

    it('selects Folder by default in Electron and Repository by default in the browser', () => {
        const { unmount } = render(
            <ProjectOpenDialog {...projectOpenDialogProps({ isDesktopMode: true })} />,
            { wrapper: AppThemeProvider },
        )

        const desktopProjectKind = screen.getByRole('group', { name: 'Project kind' })
        expect(within(desktopProjectKind).getByRole('button', { name: 'Folder' })).toHaveAttribute('aria-pressed', 'true')
        expect(within(desktopProjectKind).getByRole('button', { name: 'Repository' })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByLabelText('Local repository folder')).toBeInTheDocument()
        expect(screen.queryByLabelText('Filter repositories')).toBeNull()
        unmount()

        render(
            <ProjectOpenDialog {...projectOpenDialogProps({ isDesktopMode: false, repositories: REPOSITORIES })} />,
            { wrapper: AppThemeProvider },
        )

        const browserProjectKind = screen.getByRole('group', { name: 'Project kind' })
        expect(within(browserProjectKind).getByRole('button', { name: 'Repository' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByLabelText('Filter repositories')).toBeInTheDocument()
        expect(screen.queryByLabelText('Local repository folder')).toBeNull()
    })

    it('keeps an explicit initial source authoritative over the mode-based default', () => {
        render(
            <ProjectOpenDialog {...projectOpenDialogProps({ initialSource: 'personal', isDesktopMode: true, repositories: REPOSITORIES })} />,
            { wrapper: AppThemeProvider },
        )

        const projectKind = screen.getByRole('group', { name: 'Project kind' })
        expect(within(projectKind).getByRole('button', { name: 'Repository' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByLabelText('Filter repositories')).toBeInTheDocument()
        expect(screen.queryByLabelText('Local repository folder')).toBeNull()
    })

    it('restores the mode-based default when the dialog is reopened after a project kind change', () => {
        const { rerender } = render(
            <ProjectOpenDialog {...projectOpenDialogProps({ isDesktopMode: true, repositories: REPOSITORIES })} />,
            { wrapper: AppThemeProvider },
        )

        fireEvent.click(screen.getByRole('button', { name: 'Repository' }))
        expect(screen.getByLabelText('Filter repositories')).toBeInTheDocument()

        rerender(<ProjectOpenDialog {...projectOpenDialogProps({ isDesktopMode: true, open: false, repositories: REPOSITORIES })} />)
        rerender(<ProjectOpenDialog {...projectOpenDialogProps({ isDesktopMode: true, repositories: REPOSITORIES })} />)

        const projectKind = screen.getByRole('group', { name: 'Project kind' })
        expect(within(projectKind).getByRole('button', { name: 'Folder' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByLabelText('Local repository folder')).toBeInTheDocument()
    })

    it('opens typed, picked, and recent local folders only after Folder is selected', () => {
        const chooseLocalFolder = vi.fn(async () => undefined)
        const openLocal = vi.fn(async () => undefined)
        render(
            <ProjectOpenDialog
                branches={[]}
                isDesktopMode
                isGithubAuthenticated={false}
                isLoading={false}
                onBranchChange={vi.fn()}
                onChooseLocalFolder={chooseLocalFolder}
                onClose={vi.fn()}
                onBrowseProjectSubFolder={null}
                onConfirmProjectFolderSetup={vi.fn()}
                onCreateRemoteProject={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => null)}
                onLoadRemoteBranches={vi.fn(async () => [])}
                onOpenGithub={vi.fn()}
                onOpenLocal={openLocal}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => [])}
                onSourceChange={vi.fn()}
                open
                pendingGithubConflictProject={null}
                projectOpenResolution={null}
                recentLocalRepositories={['C:/recent']}
                repositories={[]}
            />,
            { wrapper: AppThemeProvider },
        )

        fireEvent.click(screen.getByRole('button', { name: 'Repository' }))
        expect(screen.queryByLabelText('Local repository folder')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Folder' }))

        const localFolderInput = screen.getByLabelText('Local repository folder')
        expect(localFolderInput).toHaveAttribute('placeholder', 'Choose or enter a local folder')
        expect(screen.getByText('Local repository folder')).toHaveAttribute('data-shrink', 'true')
        expect(screen.getByRole('button', { name: 'Open Local' })).toBeDisabled()
        fireEvent.click(screen.getByRole('button', { name: 'Choose local repository folder' }))
        expect(chooseLocalFolder).toHaveBeenCalledOnce()
        expect(localFolderInput).toHaveValue('')
        expect(screen.getByRole('dialog', { name: 'Open project' })).toBeInTheDocument()

        fireEvent.change(localFolderInput, { target: { value: 'C:/typed' } })
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
        expect(openLocal).toHaveBeenCalledWith('C:/typed')
        expect(openLocal).toHaveBeenCalledOnce()

        fireEvent.click(screen.getByText('C:/recent'))
        expect(localFolderInput).toHaveValue('C:/recent')
        expect(openLocal).toHaveBeenCalledOnce()

        expect(screen.getByRole('button', { name: 'Open Local' })).toBeEnabled()
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
        expect(openLocal).toHaveBeenLastCalledWith('C:/recent')
        expect(openLocal).toHaveBeenCalledTimes(2)
    })

    it('disables local open and folder picker while loading', () => {
        render(
            <ProjectOpenDialog
                branches={[]}
                initialSource="local"
                isDesktopMode
                isGithubAuthenticated={false}
                isLoading
                onBranchChange={vi.fn()}
                onChooseLocalFolder={vi.fn(async () => undefined)}
                onClose={vi.fn()}
                onBrowseProjectSubFolder={null}
                onConfirmProjectFolderSetup={vi.fn()}
                onCreateRemoteProject={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => null)}
                onLoadRemoteBranches={vi.fn(async () => [])}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => [])}
                onSourceChange={vi.fn()}
                open
                pendingGithubConflictProject={null}
                projectOpenResolution={null}
                recentLocalRepositories={[]}
                repositories={[]}
            />,
            { wrapper: AppThemeProvider },
        )

        fireEvent.change(screen.getByLabelText('Local repository folder'), { target: { value: 'C:/typed' } })
        expect(screen.getByRole('button', { name: 'Choose local repository folder' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Open Local' })).toBeDisabled()
    })

    it('marks manual public lookup and open requests as public', async () => {
        const loadManualBranches = vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))
        const openGithub = vi.fn(async () => undefined)
        render(
            <ProjectOpenDialog
                branches={BRANCHES}
                isDesktopMode={false}
                isGithubAuthenticated
                isLoading={false}
                onBranchChange={vi.fn()}
                onChooseLocalFolder={vi.fn(async () => undefined)}
                onClose={vi.fn()}
                onBrowseProjectSubFolder={null}
                onConfirmProjectFolderSetup={vi.fn()}
                onCreateRemoteProject={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={loadManualBranches}
                onLoadRemoteBranches={vi.fn(async () => [])}
                onOpenGithub={openGithub}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => [])}
                onSourceChange={vi.fn()}
                open
                pendingGithubConflictProject={null}
                projectOpenResolution={null}
                recentLocalRepositories={[]}
                repositories={[]}
            />,
        )

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Repository access' }))
        fireEvent.click(await screen.findByRole('option', { name: 'Public' }))
        fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'octo' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Repository' }), { target: { value: 'demo' } })
        fireEvent.click(screen.getByRole('button', { name: 'Load branches' }))
        await waitFor(() => expect(loadManualBranches).toHaveBeenCalledWith('octo', 'demo', true))
        fireEvent.click(screen.getByRole('button', { name: 'Open Public' }))
        expect(openGithub).toHaveBeenCalledWith('octo', 'demo', 'main', true)
    })

    it('keeps branch entry editable when no branch options exist', () => {
        const openGithub = vi.fn()

        render(
            <ProjectOpenDialog
                branches={[]}
                isDesktopMode={false}
                isGithubAuthenticated
                isLoading={false}
                onChooseLocalFolder={vi.fn(async () => undefined)}
                projectOpenResolution={null}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onBrowseProjectSubFolder={null}
                onConfirmProjectFolderSetup={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={openGithub}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                open
                pendingGithubConflictProject={null}
                recentLocalRepositories={[]}
                repositories={[]}
            />,
        )

        fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'octo' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Repository' }), { target: { value: 'demo' } })
        fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'topic' } })
        fireEvent.click(screen.getByRole('button', { name: 'Open Personal' }))

        expect(openGithub).toHaveBeenCalledWith('octo', 'demo', 'topic', false)
    })

    it('preselects the remote source and prefills the stored connection settings', () => {
        configureRemoteControlConnection({ endpoint: 'ws://192.168.0.10:1234' })

        render(
            <ProjectOpenDialog
                branches={[]}
                initialSource="remote"
                isDesktopMode={false}
                isGithubAuthenticated={false}
                isLoading={false}
                onChooseLocalFolder={vi.fn(async () => undefined)}
                projectOpenResolution={null}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onBrowseProjectSubFolder={null}
                onConfirmProjectFolderSetup={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                open
                pendingGithubConflictProject={null}
                recentLocalRepositories={[]}
                repositories={[]}
            />,
        )

        expect(screen.getByLabelText('Endpoint')).toHaveValue('ws://192.168.0.10:1234')
        expect(screen.queryByLabelText('Token')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Folder' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', { name: 'Open Remote' })).toBeInTheDocument()
    })

    it('keeps remote fields empty on first run', () => {
        render(
            <ProjectOpenDialog
                branches={[]}
                initialSource="remote"
                isDesktopMode={false}
                isGithubAuthenticated={false}
                isLoading={false}
                onChooseLocalFolder={vi.fn(async () => undefined)}
                projectOpenResolution={null}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onBrowseProjectSubFolder={null}
                onConfirmProjectFolderSetup={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                open
                pendingGithubConflictProject={null}
                recentLocalRepositories={[]}
                repositories={[]}
            />,
        )

        expect(screen.getByLabelText('Endpoint')).toHaveValue('')
        expect(screen.queryByLabelText('Token')).not.toBeInTheDocument()
    })


    it('shows the folder setup fields when project loading needs a folder choice', () => {
        render(
            <ProjectOpenDialog
                {...projectOpenDialogProps({
                    isDesktopMode: true,
                    projectOpenResolution: {
                        existingFolderPaths: ['design', 'design/archived'],
                        folders: [{ name: 'design', path: 'design' }],
                        hasProjectConfig: true,
                        kind: 'project-folder-setup',
                        project: PROJECT,
                        storageType: 'local',
                        values: {
                            actionsFolder: 'actions',
                            archivedFolder: 'archived',
                            diagramsFolder: 'diagrams',
                            projectFolder: 'design',
                            releasesFolder: 'history',
                            workingFolder: 'feature_descriptions',
                        },
                    },
                })}
            />,
        )

        expect(screen.getByLabelText('Working folder')).toHaveValue('feature_descriptions')
        expect(screen.getByLabelText('Archived folder')).toHaveValue('archived')
        expect(screen.getByText('Active cards, inside the project folder. Will be created.')).toBeInTheDocument()
        expect(screen.getByText('Archived cards, inside the project folder.')).toBeInTheDocument()
        expect(screen.queryByRole('group', { name: 'Project kind' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Open Remote' })).toBeNull()
    })

    it('confirms all folder values for a project without md2.config.json', async () => {
        const confirmProjectFolderSetup = vi.fn()
        render(
            <ProjectOpenDialog
                {...projectOpenDialogProps({
                    isDesktopMode: true,
                    onConfirmProjectFolderSetup: confirmProjectFolderSetup,
                    projectOpenResolution: {
                        existingFolderPaths: [],
                        folders: [{ name: 'docs', path: 'docs' }],
                        hasProjectConfig: false,
                        kind: 'project-folder-setup',
                        project: PROJECT,
                        storageType: 'local',
                        values: {
                            actionsFolder: 'actions',
                            archivedFolder: 'archived',
                            diagramsFolder: 'diagrams',
                            projectFolder: 'design',
                            releasesFolder: 'history',
                            workingFolder: 'active',
                        },
                    },
                })}
            />,
        )

        expect(screen.getByRole('dialog', { name: 'Project folders' })).toBeInTheDocument()
        expect(screen.getByLabelText('Project folder')).toHaveValue('design')
        expect(screen.queryByRole('group', { name: 'Project kind' })).toBeNull()

        fireEvent.change(screen.getByLabelText('Project folder'), { target: { value: 'docs' } })
        fireEvent.change(screen.getByLabelText('Working folder'), { target: { value: 'cards' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(confirmProjectFolderSetup).toHaveBeenCalledWith({
            actionsFolder: 'actions',
            archivedFolder: 'archived',
            diagramsFolder: 'diagrams',
            projectFolder: 'docs',
            releasesFolder: 'history',
            workingFolder: 'cards',
        }))
    })

    it('disables confirm while a folder value is empty', () => {
        render(
            <ProjectOpenDialog
                {...projectOpenDialogProps({
                    projectOpenResolution: {
                        existingFolderPaths: [],
                        folders: [],
                        hasProjectConfig: false,
                        kind: 'project-folder-setup',
                        project: PROJECT,
                        storageType: 'local',
                        values: {
                            actionsFolder: 'actions',
                            archivedFolder: 'archived',
                            diagramsFolder: 'diagrams',
                            projectFolder: 'design',
                            releasesFolder: 'history',
                            workingFolder: 'active',
                        },
                    },
                })}
            />,
        )

        fireEvent.change(screen.getByLabelText('Working folder'), { target: { value: '' } })

        expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
        expect(screen.getByText('Working folder is required')).toBeInTheDocument()
    })

    it('does not offer folder setup for a read-only project', () => {
        render(
            <ProjectOpenDialog
                {...projectOpenDialogProps({
                    projectOpenResolution: {
                        existingFolderPaths: [],
                        folders: [],
                        hasProjectConfig: true,
                        kind: 'project-folder-setup',
                        project: PROJECT,
                        storageType: 'github-readonly',
                        values: {
                            actionsFolder: 'actions',
                            archivedFolder: 'archived',
                            diagramsFolder: 'diagrams',
                            projectFolder: 'design',
                            releasesFolder: 'history',
                            workingFolder: 'active',
                        },
                    },
                })}
            />,
        )

        expect(screen.queryByLabelText('Project folder')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Save and open' })).toBeNull()
    })

    it('rejects a folder value that escapes the project folder', () => {
        render(
            <ProjectOpenDialog
                {...projectOpenDialogProps({
                    projectOpenResolution: {
                        existingFolderPaths: [],
                        folders: [],
                        hasProjectConfig: false,
                        kind: 'project-folder-setup',
                        project: PROJECT,
                        storageType: 'local',
                        values: {
                            actionsFolder: 'actions',
                            archivedFolder: 'archived',
                            diagramsFolder: 'diagrams',
                            projectFolder: 'design',
                            releasesFolder: 'history',
                            workingFolder: 'active',
                        },
                    },
                })}
            />,
        )

        fireEvent.change(screen.getByLabelText('Working folder'), { target: { value: '../outside' } })

        expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
        expect(screen.getByText('Working folder must stay inside the project folder')).toBeInTheDocument()
    })

    it('offers a browse button per folder on the desktop only', () => {
        const browseProjectSubFolder = vi.fn(async () => 'chosen')
        const resolution = {
            existingFolderPaths: [],
            folders: [],
            hasProjectConfig: false,
            kind: 'project-folder-setup' as const,
            project: PROJECT,
            storageType: 'local' as const,
            values: {
                actionsFolder: 'actions',
                archivedFolder: 'archived',
                diagramsFolder: 'diagrams',
                projectFolder: 'design',
                releasesFolder: 'history',
                workingFolder: 'active',
            },
        }
        const { unmount } = render(
            <ProjectOpenDialog {...projectOpenDialogProps({ projectOpenResolution: resolution })} />,
        )

        expect(screen.queryByRole('button', { name: 'Choose working folder' })).toBeNull()
        unmount()

        render(
            <ProjectOpenDialog
                {...projectOpenDialogProps({
                    isDesktopMode: true,
                    onBrowseProjectSubFolder: browseProjectSubFolder,
                    projectOpenResolution: resolution,
                })}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Choose working folder' }))

        expect(browseProjectSubFolder).toHaveBeenCalledWith('active', 'design', false)
    })

    it('opens the new card dialog with empty focused title-first fields and dynamic type pills', async () => {
        const createCard = vi.fn(async () => undefined)
        const cardTypes = [
            { color: '#123456', idPrefix: 'A', label: 'Architecture', type: 'architecture' },
            { color: '#654321', idPrefix: 'R', label: 'Research', type: 'research' },
        ]

        render(
            <NewCardDialog
                cardTypes={cardTypes}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={createCard}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        const title = screen.getByRole('textbox', { name: 'Title' })
        expect(title).toHaveAttribute('placeholder', 'Card title…')
        await waitFor(() => expect(title).toHaveFocus())
        expect(getDescriptionEditor()).toHaveValue('')
        expect(screen.queryByTestId('mdx-editor-toolbar')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Create card' })).toBeDisabled()
        expect(screen.getByRole('radiogroup', { name: 'Type' })).toBeInTheDocument()
        expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Architecture', 'Research'])
        expect(screen.getByRole('radio', { name: 'Architecture' })).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('radio', { name: 'Architecture' }).querySelector('div')).toHaveStyle({ backgroundColor: '#123456' })
    })

    it('shows directly named type and description controls without visible labels or template actions', () => {
        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        expect(screen.getByRole('radiogroup', { name: 'Type' })).toBeInTheDocument()
        expect(screen.getByRole('group', { name: 'Description' })).toBeInTheDocument()
        expect(screen.queryByText('Type')).toBeNull()
        expect(screen.queryByText('Description')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Template' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
        expect(getDescriptionEditor()).toHaveValue('')
    })

    it('selects dynamic types by click and keyboard radiogroup controls', () => {
        const createCard = vi.fn(async () => undefined)
        const cardTypes = [
            { color: '#123456', idPrefix: 'A', label: 'Architecture', type: 'architecture' },
            { color: '#654321', idPrefix: 'R', label: 'Research', type: 'research' },
        ]

        render(
            <NewCardDialog
                cardTypes={cardTypes}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={createCard}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        const architecture = screen.getByRole('radio', { name: 'Architecture' })
        const research = screen.getByRole('radio', { name: 'Research' })
        fireEvent.keyDown(architecture, { key: 'ArrowRight' })
        expect(research).toHaveFocus()
        expect(research).toHaveAttribute('aria-checked', 'false')
        fireEvent.keyDown(research, { key: ' ' })
        expect(research).toHaveAttribute('aria-checked', 'true')
        fireEvent.click(architecture)
        expect(architecture).toHaveAttribute('aria-checked', 'true')
    })

    it('trims the title and creates the card in the selected target column', async () => {
        const createCard = vi.fn(async () => undefined)

        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="design"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={createCard}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        expect(screen.getByRole('combobox', { name: 'Target column' })).toHaveTextContent('design')
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Target column' }))
        fireEvent.click(await screen.findByRole('option', { name: 'to fix' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: '  New Card  ' } })
        fireEvent.change(getDescriptionEditor(), { target: { value: 'Body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))

        await waitFor(() => expect(createCard).toHaveBeenCalledWith({
            body: 'Body',
            title: 'New Card',
            type: 'feature',
        }, 'to fix'))
    })

    it('uses full-height mobile chrome with one header create control and safe footer targets', async () => {
        mockMatchMedia(true)
        const createCard = vi.fn(async () => undefined)

        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={createCard}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        const dialog = screen.getByRole('dialog', { name: 'New card' })
        const content = screen.getByTestId('new-card-dialog-content')
        const description = screen.getByRole('group', { name: 'Description' })
        const descriptionStack = description.parentElement
        const title = dialog.querySelector('.MuiDialogTitle-root')
        const actions = dialog.querySelector('.MuiDialogActions-root')
        const topCreate = screen.getByRole('button', { name: 'Create' })

        expect(topCreate).toBeDisabled()
        expect(within(actions as HTMLElement).queryByRole('button', { name: /Create/u })).toBeNull()
        expect(screen.getAllByRole('button', { name: 'Create' })).toHaveLength(1)
        expect(content).toHaveStyle({ flex: '1', minHeight: '0', overflowY: 'auto' })
        expect(title).toHaveStyle({ flexShrink: '0' })
        expect(actions).toHaveStyle({ flexShrink: '0' })
        expect(screen.getByRole('combobox', { name: 'Target column' }).closest('.MuiInputBase-root')).toHaveStyle({ height: '44px' })
        expect(descriptionStack).toHaveStyle({ flexGrow: '1', minHeight: '0' })
        expect(description).toHaveStyle({ flex: '1', minHeight: '0', resize: 'none' })

        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Mobile card' } })
        expect(topCreate).toBeEnabled()
        fireEvent.click(topCreate)
        await waitFor(() => expect(createCard).toHaveBeenCalledWith({
            body: '',
            title: 'Mobile card',
            type: 'feature',
        }, 'new'))
    })

    it('keeps fixed desktop description sizing and vertical resize behavior', () => {
        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        const description = screen.getByRole('group', { name: 'Description' })

        expect(description).toHaveStyle({ height: '270px', minHeight: '270px', resize: 'vertical' })
    })

    it('submits with Ctrl+Enter after keeping a dirty Escape draft', async () => {
        const createCard = vi.fn(async () => undefined)
        const close = vi.fn()

        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={close}
                onCreateCard={createCard}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        const title = screen.getByRole('textbox', { name: 'Title' })
        fireEvent.change(title, { target: { value: 'Keyboard card' } })
        fireEvent.keyDown(title, { key: 'Escape' })
        expect(screen.getByRole('dialog', { name: 'Discard this new card draft?' })).toBeInTheDocument()
        expect(close).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard this new card draft?' })).not.toBeInTheDocument())

        fireEvent.change(title, { target: { value: '' } })
        const description = getDescriptionEditor()
        fireEvent.change(description, { target: { value: 'Shortcut body' } })
        const editorKeyDown = vi.fn(insertEditorNewline)
        description.addEventListener('keydown', editorKeyDown)

        fireEvent.keyDown(description, { ctrlKey: true, key: 'Enter' })
        expect(createCard).not.toHaveBeenCalled()

        fireEvent.change(title, { target: { value: 'Keyboard card' } })
        fireEvent.keyDown(description, { key: 'Enter' })
        fireEvent.keyDown(description, { key: 'Enter', shiftKey: true })
        expect(description).toHaveValue('Shortcut body\n\n')

        editorKeyDown.mockClear()
        fireEvent.keyDown(description, { ctrlKey: true, key: 'Enter' })

        expect(editorKeyDown).not.toHaveBeenCalled()
        await waitFor(() => expect(createCard).toHaveBeenCalledWith({
            body: 'Shortcut body\n\n',
            title: 'Keyboard card',
            type: 'feature',
        }, 'new'))
    })

    it('opens in-app confirmation for description-only edits', () => {
        const close = vi.fn()

        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={close}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        fireEvent.change(getDescriptionEditor(), { target: { value: 'Description only' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(screen.getByRole('dialog', { name: 'Discard this new card draft?' })).toBeInTheDocument()
        expect(close).not.toHaveBeenCalled()
    })

    it('keeps every desktop draft field and restores real title and Markdown typing after backdrop dismissal', async () => {
        const user = userEvent.setup()
        const discardImages = vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockResolvedValue()
        vi.spyOn(projectSessionService, 'hasNewCardDraftImages').mockReturnValue(true)
        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        const title = screen.getByRole('textbox', { name: 'Title' })
        const description = getDescriptionEditor()
        await user.type(title, 'Draft title')
        await user.type(description, 'Draft body')
        await user.click(screen.getByRole('radio', { name: 'Bug' }))
        await user.click(screen.getByRole('combobox', { name: 'Target column' }))
        await user.click(await screen.findByRole('option', { name: 'design' }))

        dismissThroughBackdrop()
        expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2)
        await user.click(screen.getByRole('button', { name: 'Keep editing' }))

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard this new card draft?' })).not.toBeInTheDocument())
        const draftDialog = screen.getByRole('dialog', { name: 'New card' })
        await waitFor(() => expect(draftDialog).toContainElement(document.activeElement as HTMLElement))
        expect(title).toHaveValue('Draft title')
        expect(description).toHaveValue('Draft body')
        expect(screen.getByRole('radio', { name: 'Bug' })).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('combobox', { name: 'Target column' })).toHaveTextContent('design')
        expect(projectSessionService.hasNewCardDraftImages()).toBe(true)
        await user.click(title)
        await user.type(title, ' continued')
        await user.click(description)
        await user.type(description, ' continued')
        expect(title).toHaveValue('Draft title continued')
        expect(description).toHaveValue('Draft body continued')
        expect(discardImages).not.toHaveBeenCalled()
    })

    it.each(['Cancel', 'Close'])('routes desktop %s through the same discard confirmation', async (buttonName) => {
        const user = userEvent.setup()
        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Dirty')
        await user.click(screen.getByRole('button', { name: buttonName }))

        expect(screen.getByRole('dialog', { name: 'Discard this new card draft?' })).toBeInTheDocument()
    })

    it('discards once and closes once while repeated dismissal occurs during cleanup', async () => {
        const user = userEvent.setup()
        const close = vi.fn()
        const cleanup = createDeferred<void>()
        const discardImages = vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockReturnValue(cleanup.promise)
        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={close}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Discard me')
        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        const discard = screen.getByRole('button', { name: 'Discard' })
        fireEvent.click(discard)
        fireEvent.click(discard)
        fireEvent.keyDown(document, { key: 'Escape' })

        expect(discardImages).toHaveBeenCalledOnce()
        expect(close).not.toHaveBeenCalled()
        cleanup.resolve()
        await waitFor(() => expect(close).toHaveBeenCalledOnce())
        expect(discardImages).toHaveBeenCalledOnce()
    })

    it('reports cleanup failure, preserves draft, and restores usable inputs', async () => {
        const user = userEvent.setup()
        const close = vi.fn()
        const cleanupError = new Error('cleanup failed')
        vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockRejectedValue(cleanupError)
        const reportError = vi.spyOn(dialogService, 'error')
        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={close}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        const title = screen.getByRole('textbox', { name: 'Title' })
        const description = getDescriptionEditor()
        await user.type(title, 'Preserved')
        await user.type(description, 'Body')
        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        await user.click(screen.getByRole('button', { name: 'Discard' }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(cleanupError, {fallbackMessage: 'Pasted draft images could not be removed'}))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard this new card draft?' })).not.toBeInTheDocument())
        expect(close).not.toHaveBeenCalled()
        expect(title).toHaveValue('Preserved')
        expect(description).toHaveValue('Body')
        await user.click(title)
        await user.type(title, ' title')
        await user.click(description)
        await user.type(description, ' text')
        expect(title).toHaveValue('Preserved title')
        expect(description).toHaveValue('Body text')
    })

    it.each(['Cancel', 'Escape'])('opens one mobile discard confirmation through %s', async (route) => {
        mockMatchMedia(true)
        const user = userEvent.setup()
        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        const title = screen.getByRole('textbox', { name: 'Title' })
        await user.type(title, 'Mobile draft')
        if (route === 'Cancel') await user.click(screen.getByRole('button', { name: 'Cancel' }))
        else await user.keyboard('{Escape}')

        expect(screen.getAllByRole('dialog', { name: 'Discard this new card draft?' })).toHaveLength(1)
    })

    it('resets the draft after successful creation and project closure', async () => {
        const createCard = vi.fn(async () => undefined)
        const { rerender } = render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={createCard}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Created card' } })
        fireEvent.change(getDescriptionEditor(), { target: { value: 'Created body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))
        await waitFor(() => expect(createCard).toHaveBeenCalled())
        expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('')
        expect(getDescriptionEditor()).toHaveValue('')

        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Abandoned card' } })
        fireEvent.change(getDescriptionEditor(), { target: { value: 'Abandoned body' } })
        rerender(
            <AppThemeProvider>
                <NewCardDialog
                    cardTypes={DEFAULT_CARD_TYPES}
                    initialTargetStatus="new"
                    isLoading={false}
                    isProjectOpen={false}
                    onClose={vi.fn()}
                    onCreateCard={createCard}
                    open
                    states={DEFAULT_STATES}
                />
            </AppThemeProvider>,
        )
        expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('')
        expect(getDescriptionEditor()).toHaveValue('')
    })

    it('renders the complete release dialog and submits a release name without mounting the menu', async () => {
        const completeRelease = vi.fn(async () => undefined)

        render(
            <CompleteReleaseDialog
                branchCandidates={[]}
                defaultIncludeProjectActivity={false}
                defaultSelectAll={false}
                isLoading={false}
                onClose={vi.fn()}
                onCompleteRelease={completeRelease}
                onIncludeProjectActivityChange={vi.fn()}
                onSelectAllDefaultChange={vi.fn()}
                open
            />,
        )

        fireEvent.change(screen.getByLabelText('Release name'), { target: { value: 'v1' } })
        fireEvent.click(screen.getByRole('button', { name: 'Complete release' }))

        await waitFor(() => expect(completeRelease).toHaveBeenCalledWith('v1', [], false))
    })

    it('starts the project activity checkbox from its persisted default and reports every change', async () => {
        const completeRelease = vi.fn(async () => undefined)
        const setIncludeProjectActivity = vi.fn()
        render(
            <CompleteReleaseDialog
                branchCandidates={[]}
                defaultIncludeProjectActivity
                defaultSelectAll={false}
                isLoading={false}
                onClose={vi.fn()}
                onCompleteRelease={completeRelease}
                onIncludeProjectActivityChange={setIncludeProjectActivity}
                onSelectAllDefaultChange={vi.fn()}
                open
            />,
        )

        const includeCheckbox = screen.getByRole('checkbox', { name: 'Include project agent activity' })
        expect((includeCheckbox as HTMLInputElement).checked).toBe(true)

        fireEvent.click(includeCheckbox)
        expect(setIncludeProjectActivity).toHaveBeenLastCalledWith(false)

        fireEvent.change(screen.getByLabelText('Release name'), { target: { value: 'v1' } })
        fireEvent.click(screen.getByRole('button', { name: 'Complete release' }))

        await waitFor(() => expect(completeRelease).toHaveBeenCalledWith('v1', [], false))
    })

    it('restores release branch defaults and supports select-all and clear-all', async () => {
        const completeRelease = vi.fn(async () => undefined)
        const setDefault = vi.fn()
        render(
            <CompleteReleaseDialog
                branchCandidates={[
                    { branchName: 'f-1-card', cardId: 'F-1', cardPath: 'design/F-1.md' },
                    { branchName: 'f-2-card', cardId: 'F-2', cardPath: 'design/F-2.md' },
                ]}
                defaultIncludeProjectActivity={false}
                defaultSelectAll
                isLoading={false}
                onClose={vi.fn()}
                onCompleteRelease={completeRelease}
                onIncludeProjectActivityChange={vi.fn()}
                onSelectAllDefaultChange={setDefault}
                open
            />,
        )

        const branchCheckboxes = () => screen.getAllByRole('checkbox')
            .filter((checkbox) => checkbox !== screen.getByRole('checkbox', { name: 'Include project agent activity' }))
        expect(branchCheckboxes()).toHaveLength(2)
        expect(branchCheckboxes().every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
        expect(branchCheckboxes().every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true)
        expect(setDefault).toHaveBeenLastCalledWith(false)
        fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
        expect(setDefault).toHaveBeenLastCalledWith(true)
        fireEvent.change(screen.getByLabelText('Release name'), { target: { value: 'v1' } })
        fireEvent.click(screen.getByRole('button', { name: 'Complete release' }))

        await waitFor(() => expect(completeRelease).toHaveBeenCalledWith('v1', ['f-1-card', 'f-2-card'], false))
    })

    it('renders the branch switch dialog without mounting the menu', () => {
        render(
            <BranchSwitchDialog
                branches={BRANCHES}
                isLoading={false}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onSwitchBranch={vi.fn()}
                open
                selectedBranch="main"
            />,
        )

        expect(screen.getByRole('dialog', { name: 'Switch branch' })).toBeInTheDocument()
    })
})
