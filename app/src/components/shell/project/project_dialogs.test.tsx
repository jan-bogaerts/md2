import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    REMOTE_CONTROL_TOKEN_KEY,
} from '../../../data/remote_control_connection'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { BranchSwitchDialog } from './branch_switch_dialog'
import { CompleteReleaseDialog } from './complete_release_dialog'
import { NewCardDialog } from './new_card_dialog'
import { ProjectOpenDialog } from './project_open_dialog'
import { WorkingFolderChooserDialog } from './working_folder_chooser_dialog'

const BRANCHES: BranchReference[] = [{ name: 'main' }]
const PROJECT: ProjectReference = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
const REPOSITORIES: RepositoryReference[] = [{ branch: 'main', id: 'octo/demo', owner: 'octo', repository: 'demo' }]

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

describe('project dialog components', () => {
    beforeEach(() => {
        mockMatchMedia(false)
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_TOKEN_KEY)
    })

    it('renders the open project dialog without mounting the menu', () => {
        render(
            <ProjectOpenDialog
                branches={BRANCHES}
                isDesktopMode={false}
                isGithubAuthenticated
                isLoading={false}
                projectOpenResolution={null}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                repositories={REPOSITORIES}
            />,
        )

        expect(screen.getByRole('dialog', { name: 'Open project' })).toBeInTheDocument()
        expect(screen.getByLabelText('Filter repositories')).toBeInTheDocument()
    })

    it('keeps branch entry editable when no branch options exist', () => {
        const openGithub = vi.fn()

        render(
            <ProjectOpenDialog
                branches={[]}
                isDesktopMode={false}
                isGithubAuthenticated
                isLoading={false}
                projectOpenResolution={null}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={openGithub}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                repositories={[]}
            />,
        )

        fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'octo' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Repository' }), { target: { value: 'demo' } })
        fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'topic' } })
        fireEvent.click(screen.getByRole('button', { name: 'Open GitHub' }))

        expect(openGithub).toHaveBeenCalledWith('octo', 'demo', 'topic')
    })

    it('preselects the remote source and prefills the stored connection settings', () => {
        configureRemoteControlConnection({ endpoint: 'ws://192.168.0.10:1234', token: 'token-1' })

        render(
            <ProjectOpenDialog
                branches={[]}
                initialSource="remote"
                isDesktopMode={false}
                isGithubAuthenticated={false}
                isLoading={false}
                projectOpenResolution={null}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                repositories={[]}
            />,
        )

        expect(screen.getByLabelText('Endpoint')).toHaveValue('ws://192.168.0.10:1234')
        expect(screen.getByLabelText('Token')).toHaveValue('token-1')
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
                projectOpenResolution={null}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                repositories={[]}
            />,
        )

        expect(screen.getByLabelText('Endpoint')).toHaveValue('')
        expect(screen.getByLabelText('Token')).toHaveValue('')
    })

    it('renders the working folder chooser without mounting the menu', () => {
        render(
            <WorkingFolderChooserDialog
                isLoading={false}
                onCreateWorkingFolder={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                resolution={{
                    configuredWorkingFolder: 'missing',
                    folders: [{ name: 'docs', path: 'docs' }],
                    project: PROJECT,
                    storageType: 'local',
                }}
            />,
        )

        expect(screen.getByText('Working folder is missing: missing')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Use folder docs' })).toBeInTheDocument()
    })

    it('shows only working-folder recovery when Electron project loading needs a folder choice', () => {
        render(
            <ProjectOpenDialog
                branches={[]}
                isDesktopMode
                isGithubAuthenticated={false}
                isLoading={false}
                projectOpenResolution={{
                    configuredWorkingFolder: 'missing',
                    folders: [{ name: 'docs', path: 'docs' }],
                    kind: 'missing-working-folder',
                    project: PROJECT,
                    resolvedWorkingFolder: 'missing',
                    storageType: 'local',
                }}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                repositories={REPOSITORIES}
            />,
        )

        expect(screen.getByText('Working folder is missing: missing')).toBeInTheDocument()
        expect(screen.queryByRole('combobox', { name: 'Source' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Open GitHub' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Open Remote' })).toBeNull()
    })

    it('creates a missing-config project from a selected or entered root folder', async () => {
        const createProjectFolders = vi.fn()
        render(
            <ProjectOpenDialog
                branches={[]}
                isDesktopMode
                isGithubAuthenticated={false}
                isLoading={false}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onCreateProjectFolders={createProjectFolders}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                projectOpenResolution={{
                    folders: [{ name: 'docs', path: 'docs' }],
                    kind: 'project-folder-setup',
                    project: PROJECT,
                    storageType: 'local',
                }}
                repositories={[]}
            />,
        )

        expect(screen.getByRole('dialog', { name: 'Create project' })).toBeInTheDocument()
        expect(screen.getByLabelText('Project folder')).toHaveValue('design')
        expect(screen.queryByRole('combobox', { name: 'Source' })).toBeNull()

        fireEvent.change(screen.getByLabelText('Project folder'), { target: { value: 'docs' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(createProjectFolders).toHaveBeenCalledWith('docs'))
    })

    it('opens the new card dialog with empty focused title-first fields and dynamic type pills', async () => {
        const createCard = vi.fn(async () => undefined)
        const cardTypes = [
            { color: '#123456', idPrefix: 'A', label: 'Architecture', type: 'architecture' },
            { color: '#654321', idPrefix: 'R', label: 'Research', type: 'research' },
        ]

        render(
            <NewCardDialog
                cardBodyTemplate="# Goal"
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

    it('inserts, clears, and safely appends the configured description template', () => {
        const cardBodyTemplate = '# Goal\n\n# Tasks'

        render(
            <NewCardDialog
                cardBodyTemplate={cardBodyTemplate}
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

        const description = getDescriptionEditor()
        fireEvent.click(screen.getByRole('button', { name: 'Template' }))
        expect(description).toHaveValue(cardBodyTemplate)
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
        expect(description).toHaveValue('')

        fireEvent.click(screen.getByRole('button', { name: 'Template' }))
        fireEvent.change(description, { target: { value: `${cardBodyTemplate}\nEdited` } })
        fireEvent.click(screen.getByRole('button', { name: 'Template' }))
        expect(description).toHaveValue(`${cardBodyTemplate}\nEdited\n\n${cardBodyTemplate}`)
    })

    it('selects dynamic types by click and keyboard radiogroup controls', () => {
        const createCard = vi.fn(async () => undefined)
        const cardTypes = [
            { color: '#123456', idPrefix: 'A', label: 'Architecture', type: 'architecture' },
            { color: '#654321', idPrefix: 'R', label: 'Research', type: 'research' },
        ]

        render(
            <NewCardDialog
                cardBodyTemplate=""
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
                cardBodyTemplate="# Goal"
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
        fireEvent.click(await screen.findByRole('option', { name: 'in progress' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: '  New Card  ' } })
        fireEvent.change(getDescriptionEditor(), { target: { value: 'Body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))

        await waitFor(() => expect(createCard).toHaveBeenCalledWith({
            body: 'Body',
            bodyIncludesTemplate: true,
            title: 'New Card',
            type: 'feature',
        }, 'in progress'))
    })

    it('uses full-height mobile chrome with synchronized create controls and safe footer targets', async () => {
        mockMatchMedia(true)
        const createCard = vi.fn(async () => undefined)

        render(
            <NewCardDialog
                cardBodyTemplate=""
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
        const title = dialog.querySelector('.MuiDialogTitle-root')
        const actions = dialog.querySelector('.MuiDialogActions-root')
        const topCreate = screen.getByRole('button', { name: 'Create' })
        const footerCreate = screen.getByRole('button', { name: 'Create card' })

        expect(topCreate).toBeDisabled()
        expect(footerCreate).toBeDisabled()
        expect(content).toHaveStyle({ flex: '1', minHeight: '0', overflowY: 'auto' })
        expect(title).toHaveStyle({ flexShrink: '0' })
        expect(actions).toHaveStyle({ flexShrink: '0' })
        expect(screen.getByRole('combobox', { name: 'Target column' }).closest('.MuiInputBase-root')).toHaveStyle({ height: '44px' })
        expect(screen.getByRole('group', { name: 'Description' })).toHaveStyle({ minHeight: '260px', resize: 'none' })

        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Mobile card' } })
        expect(topCreate).toBeEnabled()
        expect(footerCreate).toBeEnabled()
        fireEvent.click(topCreate)
        await waitFor(() => expect(createCard).toHaveBeenCalledWith({
            body: '',
            bodyIncludesTemplate: true,
            title: 'Mobile card',
            type: 'feature',
        }, 'new'))
    })

    it('submits with Ctrl+Enter and confirms dirty Escape cancellation', async () => {
        const createCard = vi.fn(async () => undefined)
        const close = vi.fn()
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

        render(
            <NewCardDialog
                cardBodyTemplate=""
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

        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Keyboard card' } })
        fireEvent.keyDown(screen.getByRole('textbox', { name: 'Title' }), { key: 'Escape' })
        expect(confirm).toHaveBeenCalledWith('Discard this new card draft?')
        expect(close).not.toHaveBeenCalled()

        const description = getDescriptionEditor()
        fireEvent.change(description, { target: { value: 'Shortcut body' } })
        fireEvent.keyDown(description, { ctrlKey: true, key: 'Enter' })

        await waitFor(() => expect(createCard).toHaveBeenCalledWith({
            body: 'Shortcut body',
            bodyIncludesTemplate: true,
            title: 'Keyboard card',
            type: 'feature',
        }, 'new'))
    })

    it('renders the complete release dialog and submits a release name without mounting the menu', async () => {
        const completeRelease = vi.fn(async () => undefined)

        render(
            <CompleteReleaseDialog
                isLoading={false}
                onClose={vi.fn()}
                onCompleteRelease={completeRelease}
                open
            />,
        )

        fireEvent.change(screen.getByLabelText('Release name'), { target: { value: 'v1' } })
        fireEvent.click(screen.getByRole('button', { name: 'Complete release' }))

        await waitFor(() => expect(completeRelease).toHaveBeenCalledWith('v1'))
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
