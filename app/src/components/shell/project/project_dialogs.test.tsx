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
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                recentLocalRepositories={[]}
                repositories={REPOSITORIES}
            />,
        )

        expect(screen.getByRole('dialog', { name: 'Open project' })).toBeInTheDocument()
        expect(screen.getByLabelText('Filter repositories')).toBeInTheDocument()
    })

    it('offers personal, public, and remote sources in browser mode', async () => {
        render(
            <ProjectOpenDialog
                branches={[]}
                isDesktopMode={false}
                isGithubAuthenticated
                isLoading={false}
                onBranchChange={vi.fn()}
                onChooseLocalFolder={vi.fn(async () => undefined)}
                onClose={vi.fn()}
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn()}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => null)}
                onLoadRemoteBranches={vi.fn(async () => [])}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => [])}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                projectOpenResolution={null}
                recentLocalRepositories={[]}
                repositories={[]}
            />,
        )

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Source' }))
        expect(await screen.findByRole('option', { name: 'Personal repository' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Public repository' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Remote' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'Local folder' })).toBeNull()
    })

    it('opens typed, picked, and recent local folders only after Local folder is selected', async () => {
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
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn()}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => null)}
                onLoadRemoteBranches={vi.fn(async () => [])}
                onOpenGithub={vi.fn()}
                onOpenLocal={openLocal}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => [])}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                projectOpenResolution={null}
                recentLocalRepositories={['C:/recent']}
                repositories={[]}
            />,
        )

        expect(screen.queryByLabelText('Local repository folder')).toBeNull()
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Source' }))
        fireEvent.click(await screen.findByRole('option', { name: 'Local folder' }))
        expect(screen.queryByRole('option', { name: 'Remote' })).toBeNull()

        fireEvent.change(screen.getByLabelText('Local repository folder'), { target: { value: 'C:/typed' } })
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
        expect(openLocal).toHaveBeenCalledWith('C:/typed')
        fireEvent.click(screen.getByRole('button', { name: 'Choose local repository folder' }))
        expect(chooseLocalFolder).toHaveBeenCalledOnce()
        fireEvent.click(screen.getByText('C:/recent'))
        expect(openLocal).toHaveBeenLastCalledWith('C:/recent')
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
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn()}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={loadManualBranches}
                onLoadRemoteBranches={vi.fn(async () => [])}
                onOpenGithub={openGithub}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => [])}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                projectOpenResolution={null}
                recentLocalRepositories={[]}
                repositories={[]}
            />,
        )

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Source' }))
        fireEvent.click(await screen.findByRole('option', { name: 'Public repository' }))
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
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={openGithub}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
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
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                recentLocalRepositories={[]}
                repositories={[]}
            />,
        )

        expect(screen.getByLabelText('Endpoint')).toHaveValue('ws://192.168.0.10:1234')
        expect(screen.queryByLabelText('Token')).not.toBeInTheDocument()
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
                onCreateProjectFolders={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                recentLocalRepositories={[]}
                repositories={[]}
            />,
        )

        expect(screen.getByLabelText('Endpoint')).toHaveValue('')
        expect(screen.queryByLabelText('Token')).not.toBeInTheDocument()
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
                onChooseLocalFolder={vi.fn(async () => undefined)}
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
                onOpenLocal={vi.fn(async () => undefined)}
                onOpenRemote={vi.fn()}
                onRepositoryChange={vi.fn(async () => BRANCHES)}
                onSourceChange={vi.fn()}
                onUseWorkingFolder={vi.fn()}
                open
                pendingGithubConflictProject={null}
                recentLocalRepositories={[]}
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
                onChooseLocalFolder={vi.fn(async () => undefined)}
                onBranchChange={vi.fn()}
                onClose={vi.fn()}
                onCreateProjectFolders={createProjectFolders}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn(async () => undefined)}
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
                recentLocalRepositories={[]}
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
        fireEvent.click(await screen.findByRole('option', { name: 'to fix' }))
        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: '  New Card  ' } })
        fireEvent.change(getDescriptionEditor(), { target: { value: 'Body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))

        await waitFor(() => expect(createCard).toHaveBeenCalledWith({
            body: 'Body',
            bodyIncludesTemplate: true,
            title: 'New Card',
            type: 'feature',
        }, 'to fix'))
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

        const title = screen.getByRole('textbox', { name: 'Title' })
        fireEvent.change(title, { target: { value: 'Keyboard card' } })
        fireEvent.keyDown(title, { key: 'Escape' })
        expect(confirm).toHaveBeenCalledWith('Discard this new card draft?')
        expect(close).not.toHaveBeenCalled()

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
            bodyIncludesTemplate: true,
            title: 'Keyboard card',
            type: 'feature',
        }, 'new'))
    })

    it('confirms cancellation for description-only edits', () => {
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
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        fireEvent.change(getDescriptionEditor(), { target: { value: 'Description only' } })
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(confirm).toHaveBeenCalledWith('Discard this new card draft?')
        expect(close).not.toHaveBeenCalled()
    })

    it('resets the draft after successful creation and project closure', async () => {
        const createCard = vi.fn(async () => undefined)
        const { rerender } = render(
            <NewCardDialog
                cardBodyTemplate="# Goal"
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
                    cardBodyTemplate="# Goal"
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
                defaultSelectAll={false}
                isLoading={false}
                onClose={vi.fn()}
                onCompleteRelease={completeRelease}
                onSelectAllDefaultChange={vi.fn()}
                open
            />,
        )

        fireEvent.change(screen.getByLabelText('Release name'), { target: { value: 'v1' } })
        fireEvent.click(screen.getByRole('button', { name: 'Complete release' }))

        await waitFor(() => expect(completeRelease).toHaveBeenCalledWith('v1', []))
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
                defaultSelectAll
                isLoading={false}
                onClose={vi.fn()}
                onCompleteRelease={completeRelease}
                onSelectAllDefaultChange={setDefault}
                open
            />,
        )

        expect(screen.getAllByRole('checkbox')).toHaveLength(2)
        expect(screen.getAllByRole('checkbox').every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
        expect(screen.getAllByRole('checkbox').every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true)
        expect(setDefault).toHaveBeenLastCalledWith(false)
        fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
        expect(setDefault).toHaveBeenLastCalledWith(true)
        fireEvent.change(screen.getByLabelText('Release name'), { target: { value: 'v1' } })
        fireEvent.click(screen.getByRole('button', { name: 'Complete release' }))

        await waitFor(() => expect(completeRelease).toHaveBeenCalledWith('v1', ['f-1-card', 'f-2-card']))
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
