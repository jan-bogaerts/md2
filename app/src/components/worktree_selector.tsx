import { Box, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import ArrowDown from 'mdi-material-ui/ArrowDown'
import ArrowUp from 'mdi-material-ui/ArrowUp'
import SourceBranch from 'mdi-material-ui/SourceBranch'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { WorktreeRecord } from '../data/data_types'
import { dialogService } from '../services/dialog_service'
import { configService } from '../services/config/config_service'
import { isWorktreeIntegratable, worktreeService } from '../services/project/worktree_service'
import { useConfigValueOrFallback } from './hooks/use_config_value'
import { useWorktreeSelectorState } from './hooks/use_worktree_selector_state'
import { WorktreeCommitDialog } from './worktree_commit_dialog'
import { WorktreeIntegrationDialog } from './worktree_integration_dialog'
import { WorktreeUnassignDialog } from './worktree_unassign_dialog'
import { cardPopupService } from '../services/card_popup_service'

export interface WorktreeAssignment {
    worktree?: number | null
    worktreeError?: string | null
    worktreeValue?: string | null
}

export type WorktreeAssignmentTarget = { cardInternalId: string, kind: 'card', path: string } | { kind: 'project' }
type CommitAction = 'commit' | 'integrate' | 'update'

interface WorktreeSelectorProps {
    assignment: WorktreeAssignment
    assignmentTarget: WorktreeAssignmentTarget
    disabled?: boolean
    labelPrefix?: string
    primaryPath: string | null
}

function assignmentState(assignment: WorktreeAssignment, worktrees: WorktreeRecord[]) {
    if (assignment.worktreeError) {
        return { error: assignment.worktreeError, folder: 'invalid assignment', value: assignment.worktreeValue ?? '?' }
    }
    const worktree = assignment.worktree ?? null
    if (worktree === null) return { error: null, folder: null, value: 'P' }

    const record = worktrees[worktree - 1]
    if (!record) return { error: `Configured worktree ${worktree} does not exist`, folder: 'missing folder', value: String(worktree) }
    if (!record.valid) return { error: `${record.path}: ${record.error}`, folder: record.path, value: String(worktree) }

    return { error: null, folder: record.path, value: String(worktree) }
}

/** Shared worktree assignment button and menu used by cards and action popups. */
export function WorktreeSelector(props: WorktreeSelectorProps) {
    const { assignment, assignmentTarget, disabled = false, labelPrefix, primaryPath } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [commitMessage, setCommitMessage] = useState('')
    const [commitAction, setCommitAction] = useState<CommitAction>('commit')
    const [commitDialogOpen, setCommitDialogOpen] = useState(false)
    const [integrationDialogOpen, setIntegrationDialogOpen] = useState(false)
    const [unassignDialogOpen, setUnassignDialogOpen] = useState(false)
    const deleteBranchPreference = useConfigValueOrFallback('react.deleteBranchAfterIntegration', false)
    const cardPath = assignmentTarget.kind === 'card' ? assignmentTarget.path : null
    const assignedWorktree = assignment.worktree ?? null
    const {
        preparing,
        projectDirty: hasPendingProjectChanges,
        record: assignedRecord,
        records: worktrees,
    } = useWorktreeSelectorState({ assignedWorktree, cardPath })
    const selectorDisabled = disabled || preparing
    const state = assignmentState(assignment, worktrees)
    const hasActiveCardWorktree = assignmentTarget.kind === 'card' && assignedWorktree !== null
        && !state.error && !!assignedRecord?.valid
    const hasActiveProjectWorktree = assignmentTarget.kind === 'project' && assignedWorktree !== null
        && !state.error && !!assignedRecord?.valid
    const canCommit = !!assignedRecord?.status.dirty
    const hasOutgoingChanges = !!assignedRecord
        && (assignedRecord.status.dirty || assignedRecord.status.baseAhead > 0)
    const canIntegrate = isWorktreeIntegratable(assignedRecord)
    const hasIncomingChanges = !!assignedRecord && (hasPendingProjectChanges || assignedRecord.status.baseBehind > 0)
    const hasWorktreeChanges = hasOutgoingChanges || hasIncomingChanges
    const projectBranch = worktreeService.getProjectBranch()
    const folder = state.folder ?? primaryPath ?? 'Primary'
    const assignmentDescription = state.error
        ? `Worktree assignment error: ${state.error}`
        : state.value === 'P'
            ? `Primary worktree${primaryPath ? `: ${primaryPath}` : ''}`
            : `Worktree ${state.value}: ${folder}`
    const baseName = projectBranch ?? 'the project branch'
    const statusParts = assignedRecord
        ? [
            `dirty ${assignedRecord.status.dirty ? 'yes' : 'no'}`,
            `project changes pending ${hasPendingProjectChanges ? 'yes' : 'no'}`,
            `ahead of ${baseName} ${assignedRecord.status.baseAhead}`,
            `behind ${baseName} ${assignedRecord.status.baseBehind}`,
        ]
        : []
    const worktreeStatusDescription = statusParts.length > 0 ? statusParts.join('; ') : null
    const descriptions = [assignmentDescription, worktreeStatusDescription].filter((value) => value !== null)
    const tooltip = descriptions.join('. ')
    const statusLabel = worktreeStatusDescription ? `; ${worktreeStatusDescription}` : ''
    const label = labelPrefix
        ? `${labelPrefix}: ${folder}${statusLabel}`
        : `${assignmentDescription}${statusLabel}`

    const handleOpen = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        setAnchorElement(event.currentTarget)
    }
    const handleClose = () => setAnchorElement(null)
    const assignWorktree = async (worktree: number | null) => {
        try {
            if (assignmentTarget.kind === 'project') worktreeService.setProjectActionWorktree(worktree)
            else await worktreeService.setCardWorktree(assignmentTarget.path, worktree)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not update worktree assignment' })
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
                        // mutation guard and surface a second, redundant error.
                        if (outcome.status === 'conflict') return
                        await worktreeService.setCardWorktree(assignmentTarget.path, null)
                        return
                    }
                    setCommitMessage(worktreeService.getCardCommitMessage(assignmentTarget.path))
                    setUnassignDialogOpen(true)
                    return
                }
                await worktreeService.setCardWorktree(assignmentTarget.path, null)
                return
            } catch (error) {
                if (worktreeService.getRecords()[assignedWorktree - 1]?.status.dirty) {
                    setCommitMessage(worktreeService.getCardCommitMessage(assignmentTarget.path))
                    setUnassignDialogOpen(true)
                    return
                }
                dialogService.error(error, { fallbackMessage: 'Could not update worktree assignment' })
                return
            }
        }
        await assignWorktree(null)
    }
    const handleWorktree = async (event: MouseEvent<HTMLElement>) => {
        try {
            const worktree = Number.parseInt(event.currentTarget.dataset.worktree ?? '', 10)
            if (!Number.isInteger(worktree)) throw new Error('Missing worktree menu index')

            handleClose()
            await assignWorktree(worktree)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not update worktree assignment' })
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
        }
    }
    const handleIntegrateMenu = async () => {
        handleClose()
        try {
            if (assignmentTarget.kind === 'card') {
                if (assignedRecord?.status.dirty) setCommitMessage(getCommitMessage())
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
    }
    const handleViewDiffMenu = () => {
        try {
            if (assignmentTarget.kind !== 'card') throw new Error('Worktree diff requires a card assignment')
            if (!anchorElement) throw new Error('Worktree diff requires a card popup anchor')
            if (!canIntegrate) throw new Error('Card worktree has no changes to integrate')
            const popupAnchorElement = anchorElement
            handleClose()
            cardPopupService.openWorktreeDiff(assignmentTarget.cardInternalId, popupAnchorElement)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not open worktree diff' })
        }
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
    }
    const handleCommitDialogClose = () => setCommitDialogOpen(false)
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
    }
    const handleUnassignClose = () => setUnassignDialogOpen(false)
    const handleDropAndUnassign = async () => {
        if (assignmentTarget.kind !== 'card') return

        try {
            await worktreeService.discardAndUnassignCardWorktree(assignmentTarget.path)
            setUnassignDialogOpen(false)
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
            // Leave only the merge conflict popup on screen: no unassign attempt and no error message.
            if (outcome.status === 'conflict') {
                setUnassignDialogOpen(false)
                return
            }
        } catch (error) {
            setUnassignDialogOpen(false)
            dialogService.error(error, { fallbackMessage: 'Changes were committed, but the worktree could not be integrated into the project' })
            return
        }

        try {
            await worktreeService.setCardWorktree(assignmentTarget.path, null)
            setUnassignDialogOpen(false)
        } catch (error) {
            setUnassignDialogOpen(false)
            dialogService.error(error, { fallbackMessage: 'Changes were integrated, but the worktree could not be unassigned' })
        }
    }
    const handleIntegrationClose = () => setIntegrationDialogOpen(false)
    const handleDeleteBranchChange = (deleteBranch: boolean) => {
        configService.setReactPreference('react.deleteBranchAfterIntegration', deleteBranch)
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
            await worktreeService.integrateCardWorktree(assignmentTarget.path, deleteBranchPreference)
            setIntegrationDialogOpen(false)
        } catch (error) {
            const fallbackMessage = commitBeforeIntegration
                ? 'Changes were committed, but the worktree could not be integrated into the project'
                : 'Could not integrate worktree into project'
            dialogService.error(error, { fallbackMessage })
        }
    }

    const button = (
        <IconButton
            aria-label={label}
            disabled={selectorDisabled}
            onClick={handleOpen}
            size="small"
            sx={{
                border: 1,
                borderColor: state.error ? 'error.main' : hasWorktreeChanges ? 'warning.main' : 'divider',
                color: state.error ? 'error.main' : hasWorktreeChanges ? 'warning.main' : 'text.secondary',
                height: 26,
                p: 0,
                pointerEvents: 'auto',
                position: 'relative',
                width: 26,
            }}
        >
            <Box
                sx={{
                    alignItems: 'center',
                    display: 'flex',
                    height: '100%',
                    justifyContent: 'center',
                    // leave room on the right for the arrow gutter so the glyph stays optically centred
                    pr: hasWorktreeChanges ? '8px' : 0,
                    width: '100%',
                }}
            >
                {state.value === 'P' ? <SourceBranch sx={{ fontSize: 14 }} /> : (
                    <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>
                        {state.value}
                    </Typography>
                )}
            </Box>
            {hasWorktreeChanges ? (
                <Box
                    sx={{
                        alignItems: 'center',
                        bottom: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        position: 'absolute',
                        right: 1,
                        top: 0,
                        width: 8,
                    }}
                >
                    {hasOutgoingChanges ? <ArrowUp sx={{ display: 'block', fontSize: 9 }} /> : null}
                    {hasIncomingChanges ? <ArrowDown sx={{ display: 'block', fontSize: 9 }} /> : null}
                </Box>
            ) : null}
        </IconButton>
    )

    return (
        <>
            <Tooltip title={tooltip}>{selectorDisabled ? <span>{button}</span> : button}</Tooltip>
            <Menu anchorEl={anchorElement} onClose={handleClose} open={!!anchorElement}>
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
                ) : worktrees.map((record, index) => (record.valid ? (
                    <MenuItem
                        data-worktree={index + 1}
                        disabled={assignmentTarget.kind === 'card'
                            && !worktreeService.isWorktreeAvailableForCard(index + 1, assignmentTarget.path)}
                        key={`${index}-${record.path}`}
                        onClick={handleWorktree}
                        selected={assignment.worktree === index + 1}
                    >
                        {index + 1} — {record.path}
                    </MenuItem>
                ) : null))}
                {state.error ? <MenuItem disabled selected>{state.value} — {state.error}</MenuItem> : null}
            </Menu>
            <WorktreeCommitDialog
                action={commitAction}
                busy={preparing}
                message={commitMessage}
                onClose={handleCommitDialogClose}
                onCommit={handleCommit}
                onMessageChange={setCommitMessage}
                open={commitDialogOpen}
            />
            <WorktreeIntegrationDialog
                busy={preparing}
                commitMessage={assignedRecord?.status.dirty ? commitMessage : null}
                deleteBranch={deleteBranchPreference}
                onClose={handleIntegrationClose}
                onCommitMessageChange={setCommitMessage}
                onDeleteBranchChange={handleDeleteBranchChange}
                onIntegrate={handleIntegration}
                open={integrationDialogOpen}
            />
            <WorktreeUnassignDialog
                busy={preparing}
                commitMessage={commitMessage}
                onClose={handleUnassignClose}
                onCommitMessageChange={setCommitMessage}
                onCommitIntegrate={handleCommitIntegrateAndUnassign}
                onDrop={handleDropAndUnassign}
                open={unassignDialogOpen}
            />
        </>
    )
}
