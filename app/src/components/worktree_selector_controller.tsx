import { Menu, MenuItem } from '@mui/material'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import { isActiveRebaseLinkedWorktreeError, isDirtyLinkedWorktreeError } from '../../../shared/worktree_errors.mjs'
import type { WorktreeAssignment } from '../data/data_types';
import { dialogService } from '../services/dialog_service'
import { configService } from '../services/config/config_service'
import { isWorktreeIntegratable, worktreeService } from '../services/project/worktree_service'
import { useConfigValueOrFallback } from './hooks/use_config_value'
import { useWorktreeSelectorState } from './hooks/use_worktree_selector_state'
import { useOpenWorktrees } from './hooks/use_worktrees'
import { WorktreeCommitDialog } from './worktree_commit_dialog'
import { WorktreeIntegrationDialog } from './worktree_integration_dialog'
import { WorktreeUnassignDialog } from './worktree_unassign_dialog'
import { cardPopupService } from '../services/card_popup_service'
import { getWorktreeAssignmentDisplayState } from './worktree_selector_assignment_state'
import type { WorktreeAssignmentTarget } from './worktree_selector_types'

type CommitAction = 'commit' | 'integrate' | 'update'

interface WorktreeSelectorControllerProps {
    anchorElement: HTMLElement
    assignment: WorktreeAssignment
    assignmentTarget: WorktreeAssignmentTarget
    onClose: () => void
    primaryPath: string | null
}

/** Active worktree menu, dialogs, actions, and live action-state subscription. */
export function WorktreeSelectorController(props: WorktreeSelectorControllerProps) {
    const { anchorElement, assignment, assignmentTarget, onClose, primaryPath } = props
    const [menuAnchorElement, setMenuAnchorElement] = useState<HTMLElement | null>(anchorElement)
    const [commitMessage, setCommitMessage] = useState('')
    const [commitAction, setCommitAction] = useState<CommitAction>('commit')
    const [commitDialogOpen, setCommitDialogOpen] = useState(false)
    const [integrationDialogOpen, setIntegrationDialogOpen] = useState(false)
    const [unassignDialogOpen, setUnassignDialogOpen] = useState(false)
    const deleteBranchPreference = useConfigValueOrFallback('project.deleteBranchAfterIntegration', false)
    // The remembered preference is saved through the project config file, so the dialog tracks the pending choice itself.
    const [deleteBranch, setDeleteBranch] = useState(deleteBranchPreference)
    const cardInternalId = assignmentTarget.kind === 'card' ? assignmentTarget.cardInternalId : null
    const assignedWorktree = assignment.worktree ?? null
    const {
        preparing,
        projectDirty: hasPendingProjectChanges,
        record: assignedRecord,
    } = useWorktreeSelectorState({ assignment, cardInternalId });
    const worktrees = useOpenWorktrees(!!menuAnchorElement)
    const state = getWorktreeAssignmentDisplayState(assignment)
    const hasActiveCardWorktree = assignmentTarget.kind === 'card' && assignedWorktree !== null
        && !state.error && !!assignedRecord?.valid
    const hasActiveProjectWorktree = assignmentTarget.kind === 'project' && assignedWorktree !== null
        && !state.error && !!assignedRecord?.valid
    const canCommit = !!assignedRecord?.status.dirty
    const hasOutgoingChanges = !!assignedRecord
        && (assignedRecord.status.dirty || assignedRecord.status.baseAhead > 0)
    const canIntegrate = isWorktreeIntegratable(assignedRecord)
    const hasIncomingChanges = !!assignedRecord && (hasPendingProjectChanges || assignedRecord.status.baseBehind > 0)
    const projectBranch = worktreeService.getProjectBranch()
    const baseName = projectBranch ?? 'the project branch'
    const handleClose = () => setMenuAnchorElement(null)
    const assignWorktree = async (branch: string | null) => {
        try {
            if (assignmentTarget.kind === 'project') worktreeService.setProjectActionWorktree(branch);
            else await worktreeService.setCardWorktree(assignmentTarget.path, branch);
        } catch (error) {
            if (isActiveRebaseLinkedWorktreeError(error) || isDirtyLinkedWorktreeError(error)) dialogService.displayError(error.message)
            else dialogService.error(error, { fallbackMessage: 'Could not update worktree assignment' })
        }
    }
    const handlePrimary = async () => {
        handleClose()
        if (hasActiveCardWorktree) {
            try {
                if (hasOutgoingChanges) {
                    if (!assignedRecord?.status.dirty) {
                        const outcome = await worktreeService.integrateCardWorktree(assignmentTarget.path, false)
                        // A paused merge conflict already shows its own popup; unassigning now would hit the desktop
                        // mutation guard and surface a second, redundant error. A cancelled review stops the integration.
                        if (outcome.status !== 'completed') {
                            onClose()
                            return
                        }
                        await worktreeService.setCardWorktree(assignmentTarget.path, null)
                        onClose()
                        return
                    }
                    setCommitMessage(worktreeService.getCardCommitMessage(assignmentTarget.path))
                    setUnassignDialogOpen(true)
                    return
                }
                await worktreeService.setCardWorktree(assignmentTarget.path, null)
                onClose()
                return
            } catch (error) {
                if (worktreeService.getAssignmentState(assignment).record?.status.dirty) {
                    setCommitMessage(worktreeService.getCardCommitMessage(assignmentTarget.path))
                    setUnassignDialogOpen(true)
                    return
                }
                dialogService.error(error, { fallbackMessage: 'Could not update worktree assignment' })
                onClose()
                return
            }
        }
        await assignWorktree(null)
        onClose()
    }
    const handleWorktree = async (event: MouseEvent<HTMLElement>) => {
        try {
            const branch = event.currentTarget.dataset.worktreeBranch;
            if (!branch) throw new Error('Missing worktree menu branch');

            handleClose()
            await assignWorktree(branch);
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not update worktree assignment' })
        } finally {
            onClose()
        }
    }
    const getCommitMessage = () => (assignmentTarget.kind === 'card'
        ? worktreeService.getCardCommitMessage(assignmentTarget.path)
        : worktreeService.getProjectCommitMessage())
    const handleCommitMenu = () => {
        handleClose()
        try {
            setCommitMessage(getCommitMessage())
            setCommitAction('commit')
            setCommitDialogOpen(true)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not prepare worktree commit' })
            onClose()
        }
    }
    const handleIntegrateMenu = async () => {
        handleClose()
        try {
            if (assignmentTarget.kind === 'card') {
                if (assignedRecord?.status.dirty) setCommitMessage(getCommitMessage())
                setDeleteBranch(deleteBranchPreference)
                setIntegrationDialogOpen(true)
                return
            }
            if (assignedRecord?.status.dirty) {
                setCommitMessage(getCommitMessage())
                setCommitAction('integrate')
                setCommitDialogOpen(true)
                return
            }
            await worktreeService.integrateProjectWorktree()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not integrate worktree into project' })
        }
        onClose()
    }
    const handleViewDiffMenu = () => {
        try {
            if (assignmentTarget.kind !== 'card') throw new Error('Worktree diff requires a card assignment')
            if (!menuAnchorElement) throw new Error('Worktree diff requires a card popup anchor')
            if (!canIntegrate) throw new Error('Card worktree has no changes to integrate')
            const popupAnchorElement = menuAnchorElement
            handleClose()
            cardPopupService.openWorktreeDiff(assignmentTarget.cardInternalId, popupAnchorElement)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not open worktree diff' })
        }
        onClose()
    }
    const handleUpdateMenu = async () => {
        handleClose()
        try {
            if (assignedRecord?.status.dirty) {
                setCommitMessage(getCommitMessage())
                setCommitAction('update')
                setCommitDialogOpen(true)
                return
            }
            if (assignmentTarget.kind === 'card') await worktreeService.updateCardWorktree(assignmentTarget.path)
            else await worktreeService.updateProjectWorktree()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Could not update worktree from ${baseName}` })
        }
        onClose()
    }
    const handleCommitDialogClose = () => onClose()
    const handleCommit = async (message: string) => {
        try {
            if (assignmentTarget.kind === 'card') await worktreeService.commitCardWorktree(assignmentTarget.path, message)
            else await worktreeService.commitProjectWorktree(message)
            setCommitDialogOpen(false)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not commit worktree changes' })
            return
        }
        try {
            if (commitAction === 'integrate') {
                await worktreeService.integrateProjectWorktree()
            }
            if (commitAction === 'update') {
                if (assignmentTarget.kind === 'card') await worktreeService.updateCardWorktree(assignmentTarget.path)
                else await worktreeService.updateProjectWorktree()
            }
        } catch (error) {
            const fallbackMessage = commitAction === 'integrate'
                ? 'Changes were committed, but the worktree could not be integrated into the project'
                : `Changes were committed, but the worktree could not be updated from ${baseName}`
            dialogService.error(error, { fallbackMessage })
        }
        onClose()
    }
    const handleUnassignClose = () => onClose()
    const handleDropAndUnassign = async () => {
        if (assignmentTarget.kind !== 'card') return

        try {
            await worktreeService.discardAndUnassignCardWorktree(assignmentTarget.path)
            setUnassignDialogOpen(false)
            onClose()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not drop worktree changes' })
        }
    }
    const handleCommitIntegrateAndUnassign = async (message: string) => {
        if (assignmentTarget.kind !== 'card') return

        try {
            await worktreeService.commitCardWorktree(assignmentTarget.path, message)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not commit worktree changes' })
            return
        }

        try {
            const outcome = await worktreeService.integrateCardWorktree(assignmentTarget.path, false)
            // Leave only the merge conflict popup on screen, or nothing after a cancelled review: no unassign attempt and no error message.
            if (outcome.status !== 'completed') {
                setUnassignDialogOpen(false)
                onClose()
                return
            }
        } catch (error) {
            setUnassignDialogOpen(false)
            dialogService.error(error, { fallbackMessage: 'Changes were committed, but the worktree could not be integrated into the project' })
            onClose()
            return
        }

        try {
            await worktreeService.setCardWorktree(assignmentTarget.path, null)
            setUnassignDialogOpen(false)
        } catch (error) {
            setUnassignDialogOpen(false)
            dialogService.error(error, { fallbackMessage: 'Changes were integrated, but the worktree could not be unassigned' })
        }
        onClose()
    }
    const handleIntegrationClose = () => onClose()
    const handleDeleteBranchChange = (nextDeleteBranch: boolean) => {
        setDeleteBranch(nextDeleteBranch)
        void configService.setProjectPreference('project.deleteBranchAfterIntegration', nextDeleteBranch)
    }
    const handleIntegration = async () => {
        if (assignmentTarget.kind !== 'card') return

        const commitBeforeIntegration = !!assignedRecord?.status.dirty
        if (commitBeforeIntegration) {
            if (commitMessage.trim().length === 0) return

            try {
                await worktreeService.commitCardWorktree(assignmentTarget.path, commitMessage)
            } catch (error) {
                dialogService.error(error, { fallbackMessage: 'Could not commit worktree changes' })
                return
            }
        }

        try {
            await worktreeService.integrateCardWorktree(assignmentTarget.path, deleteBranch)
            setIntegrationDialogOpen(false)
            onClose()
        } catch (error) {
            const fallbackMessage = commitBeforeIntegration
                ? 'Changes were committed, but the worktree could not be integrated into the project'
                : 'Could not integrate worktree into project'
            dialogService.error(error, { fallbackMessage })
        }
    }

    return (
        <>
            {menuAnchorElement ? (
                <Menu anchorEl={menuAnchorElement} onClose={onClose} open>
                    <MenuItem onClick={handlePrimary} selected={assignment.worktree === null && !assignment.worktreeError}>
                    Primary{primaryPath ? ` — ${primaryPath}` : ''}
                    </MenuItem>
                    {(hasActiveCardWorktree || hasActiveProjectWorktree) ? (
                        <>
                            <MenuItem disabled={!canCommit} onClick={handleCommitMenu}>Commit</MenuItem>
                            <MenuItem disabled={!hasIncomingChanges} onClick={handleUpdateMenu}>Update worktree</MenuItem>
                            {assignmentTarget.kind === 'card' ? (
                                <MenuItem disabled={!canIntegrate} onClick={handleViewDiffMenu}>View diff</MenuItem>
                            ) : null}
                            <MenuItem disabled={assignmentTarget.kind === 'card' ? !canIntegrate : !hasOutgoingChanges} onClick={handleIntegrateMenu}>
                            Integrate into project
                            </MenuItem>
                        </>
                    ) : worktrees.map((record, index) => (record.valid && record.branch ? (
                        <MenuItem
                            data-worktree-branch={record.branch}
                            disabled={assignmentTarget.kind === 'card'
                            && (!worktreeService.isWorktreeAvailableForCard(record.branch, assignmentTarget.cardInternalId)
                                || worktreeService.isWorktreeReservedBySequence(record))}
                            key={`${index}-${record.path}`}
                            onClick={handleWorktree}
                            selected={assignment.branch === record.branch}
                        >
                            {index + 1} — {record.path}
                        </MenuItem>
                    ) : null))}
                    {state.error ? <MenuItem disabled selected>{state.value} — {state.error}</MenuItem> : null}
                </Menu>
            ) : null}
            {commitDialogOpen ? (
                <WorktreeCommitDialog
                    action={commitAction}
                    busy={preparing}
                    message={commitMessage}
                    onClose={handleCommitDialogClose}
                    onCommit={handleCommit}
                    onMessageChange={setCommitMessage}
                    open
                />
            ) : null}
            {integrationDialogOpen ? (
                <WorktreeIntegrationDialog
                    busy={preparing}
                    commitMessage={assignedRecord?.status.dirty ? commitMessage : null}
                    deleteBranch={deleteBranch}
                    onClose={handleIntegrationClose}
                    onCommitMessageChange={setCommitMessage}
                    onDeleteBranchChange={handleDeleteBranchChange}
                    onIntegrate={handleIntegration}
                    open
                />
            ) : null}
            {unassignDialogOpen ? (
                <WorktreeUnassignDialog
                    busy={preparing}
                    commitMessage={commitMessage}
                    onClose={handleUnassignClose}
                    onCommitMessageChange={setCommitMessage}
                    onCommitIntegrate={handleCommitIntegrateAndUnassign}
                    onDrop={handleDropAndUnassign}
                    open
                />
            ) : null}
        </>
    )
}
