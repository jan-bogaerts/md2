import { Button, Menu, MenuItem } from '@mui/material'
import type { MouseEvent } from 'react'
import { useCallback, useState } from 'react'
import { projectSessionService, type ProjectFolderValues } from '../../services/project/project_session_service'
import { BranchSwitchDialog } from './project/branch_switch_dialog'
import { CompleteReleaseDialog } from './project/complete_release_dialog'
import { NewCardDialog } from './project/new_card_dialog'
import { ProjectOpenDialog } from './project/project_open_dialog'
import { useProjectToolbarMenuActions } from './project/use_project_toolbar_menu_actions'
import { useProjectPersistence } from '../hooks/use_project_persistence'
import { useProjectReadOnly } from '../hooks/use_project_read_only'

type ProjectDialogMode = 'open' | 'branch' | 'card' | 'release'

interface ProjectToolbarMenuProps {
    accessToken: string | null
    isGithubAuthenticated: boolean
}

/** Toolbar project menu with dialogs for project session commands. */
export function ProjectToolbarMenu(props: ProjectToolbarMenuProps) {
    const { accessToken, isGithubAuthenticated } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [dialogMode, setDialogMode] = useState<ProjectDialogMode | null>(null)
    const { hasPendingPush, hasPendingSave } = useProjectPersistence()
    const readOnly = useProjectReadOnly()
    const isMenuOpen = !!anchorElement

    const openDialog = useCallback((mode: ProjectDialogMode) => {
        setAnchorElement(null)
        setDialogMode(mode)
        projectSessionService.setError(null)
    }, [])

    const handleCloseDialogState = useCallback(() => {
        setDialogMode(null)
    }, [])
    const actions = useProjectToolbarMenuActions({
        accessToken,
        isGithubAuthenticated,
        onCloseDialog: handleCloseDialogState,
        onOpenDialog: openDialog,
    })

    const handleProjectButtonClick = (event: MouseEvent<HTMLButtonElement>) => setAnchorElement(event.currentTarget)
    const handleCloseMenu = () => setAnchorElement(null)
    const handleOpenProject = () => {
        setAnchorElement(null)
        actions.openProjectDialog()
    }
    const handlePushClick = async () => {
        setAnchorElement(null)
        try {
            await actions.push()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }
    const handleOpenReleaseDialog = () => {
        void actions.openReleaseDialog()
    }
    const handleOpenCardDialog = () => actions.openNewCardDialog()
    const handleConfirmProjectFolderSetup = (values: ProjectFolderValues) => {
        void actions.confirmProjectFolderSetup(values)
    }
    const handleDiscardGithubPendingCommits = () => {
        if (!actions.pendingGithubConflictProject) return

        projectSessionService.discardGithubPendingCommits(actions.pendingGithubConflictProject, accessToken)
    }

    return (
        <>
            <Button aria-controls={isMenuOpen ? 'project-menu' : undefined} aria-haspopup="true" onClick={handleProjectButtonClick} size="small" variant="outlined">
                Project
            </Button>
            <Menu anchorEl={anchorElement} id="project-menu" onClose={handleCloseMenu} open={isMenuOpen}>
                <MenuItem onClick={handleOpenProject}>Open project...</MenuItem>
                {actions.isProjectOpen ? <MenuItem onClick={actions.openBranchDialog}>Switch branch...</MenuItem> : null}
                {actions.isProjectOpen && actions.pushMode === 'manual' ? (
                    <MenuItem
                        disabled={readOnly || actions.isLoading || (!hasPendingPush && !hasPendingSave)}
                        onClick={handlePushClick}
                    >
                        Push
                    </MenuItem>
                ) : null}
                {actions.isProjectOpen ? (
                    <MenuItem
                        disabled={readOnly || actions.isReleaseCompleting || actions.activeCards.length === 0}
                        onClick={handleOpenReleaseDialog}
                    >
                        Complete release...
                    </MenuItem>
                ) : null}
                {actions.isProjectOpen ? <MenuItem disabled={readOnly} onClick={handleOpenCardDialog}>New card...</MenuItem> : null}
            </Menu>
            <ProjectOpenDialog
                branches={actions.branches}
                initialRemoteProject={actions.initialRemoteProject}
                initialSource={actions.initialProjectSource}
                isDesktopMode={actions.isDesktopMode}
                isGithubAuthenticated={isGithubAuthenticated}
                isLoading={actions.isLoading}
                onBrowseProjectSubFolder={actions.isDesktopMode ? actions.browseProjectSubFolder : null}
                onChooseLocalFolder={actions.chooseLocalProjectFolder}
                onConfirmProjectFolderSetup={handleConfirmProjectFolderSetup}
                projectOpenResolution={actions.projectOpenResolution}
                onBranchChange={() => undefined}
                onClose={actions.closeDialog}
                onCreateRemoteProject={actions.createRemoteProject}
                onDiscardGithubPendingCommits={handleDiscardGithubPendingCommits}
                onLoadManualBranches={actions.loadManualBranches}
                onLoadRemoteBranches={actions.loadRemoteBranches}
                onOpenGithub={actions.openGithubProject}
                onOpenLocal={actions.openLocalProject}
                onOpenRemote={actions.openRemoteProject}
                onRepositoryChange={actions.loadRepositoryBranches}
                onSourceChange={actions.clearOpenDialogState}
                open={dialogMode === 'open'}
                pendingGithubConflictProject={actions.pendingGithubConflictProject}
                recentLocalRepositories={actions.recentLocalRepositories}
                repositories={actions.repositories}
            />
            <BranchSwitchDialog
                branches={actions.branches}
                isLoading={actions.isLoading}
                onBranchChange={actions.setSwitchBranch}
                onClose={actions.closeDialog}
                onSwitchBranch={(branch) => void actions.switchProjectBranch(branch)}
                open={dialogMode === 'branch'}
                selectedBranch={actions.switchBranch}
            />
            <CompleteReleaseDialog
                branchCandidates={actions.releaseBranchCandidates}
                defaultIncludeProjectActivity={actions.releaseIncludeProjectActivityDefault}
                defaultSelectAll={actions.releaseSelectAllDefault}
                isLoading={actions.isLoading}
                key={dialogMode === 'release' ? 'release-open' : 'release-closed'}
                onClose={actions.closeDialog}
                onCompleteRelease={actions.completeRelease}
                onIncludeProjectActivityChange={actions.setReleaseIncludeProjectActivityDefault}
                onSelectAllDefaultChange={actions.setReleaseSelectAllDefault}
                open={dialogMode === 'release'}
            />
            <NewCardDialog
                cardTypes={actions.cardTypes}
                initialTargetStatus={actions.newCardInitialStatus}
                isLoading={actions.isLoading}
                isProjectOpen={actions.isProjectOpen}
                onClose={actions.closeDialog}
                onCreateCard={actions.createCard}
                open={dialogMode === 'card'}
                states={actions.states}
            />
        </>
    )
}
