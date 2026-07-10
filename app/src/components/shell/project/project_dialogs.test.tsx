import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type BranchReference, type ProjectReference, type RepositoryReference } from '../../../data/data_types'
import { BranchSwitchDialog } from './branch_switch_dialog'
import { CompleteReleaseDialog } from './complete_release_dialog'
import { NewCardDialog } from './new_card_dialog'
import { ProjectOpenDialog } from './project_open_dialog'
import { WorkingFolderChooserDialog } from './working_folder_chooser_dialog'

const BRANCHES: BranchReference[] = [{ name: 'main' }]
const PROJECT: ProjectReference = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
const REPOSITORIES: RepositoryReference[] = [{ branch: 'main', id: 'octo/demo', owner: 'octo', repository: 'demo' }]

describe('project dialog components', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('renders the open project dialog without mounting the menu', () => {
        render(
            <ProjectOpenDialog
                branches={BRANCHES}
                isGithubAuthenticated
                isLoading={false}
                isLocalAvailable
                missingWorkingFolder={null}
                onBranchChange={vi.fn()}
                onChooseLocalFolder={vi.fn(async () => ({ branches: BRANCHES, project: PROJECT }))}
                onClose={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={vi.fn()}
                onOpenLocal={vi.fn()}
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
                isGithubAuthenticated
                isLoading={false}
                isLocalAvailable
                missingWorkingFolder={null}
                onBranchChange={vi.fn()}
                onChooseLocalFolder={vi.fn(async () => ({ branches: BRANCHES, project: PROJECT }))}
                onClose={vi.fn()}
                onCreateRemoteProject={vi.fn((rootPath, branch) => ({ branch, id: rootPath, rootPath }))}
                onCreateWorkingFolder={vi.fn()}
                onDiscardGithubPendingCommits={vi.fn()}
                onLoadManualBranches={vi.fn(async () => ({ branches: BRANCHES, repository: REPOSITORIES[0] }))}
                onLoadRemoteBranches={vi.fn(async () => BRANCHES)}
                onOpenGithub={openGithub}
                onOpenLocal={vi.fn()}
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

    it('renders the new card dialog and submits a draft without mounting the menu', async () => {
        const createCard = vi.fn(async () => undefined)

        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={createCard}
                open
            />,
        )

        fireEvent.change(screen.getByLabelText('New card title'), { target: { value: 'New Card' } })
        fireEvent.change(screen.getByLabelText('New card body'), { target: { value: 'Body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))

        await waitFor(() => expect(createCard).toHaveBeenCalledWith({ body: 'Body', title: 'New Card', type: 'feature' }))
    })

    it('disables new card submit while loading', () => {
        render(
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                isLoading
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={vi.fn(async () => undefined)}
                open
            />,
        )

        fireEvent.change(screen.getByLabelText('New card title'), { target: { value: 'New Card' } })

        expect(screen.getByRole('button', { name: 'Create card' })).toBeDisabled()
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
