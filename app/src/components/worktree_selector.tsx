import { IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import ArrowDown from 'mdi-material-ui/ArrowDown'
import ArrowUp from 'mdi-material-ui/ArrowUp'
import SourceBranch from 'mdi-material-ui/SourceBranch'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { WorktreeRecord } from '../data/data_types'
import { dialogService } from '../services/dialog_service'
import { worktreeService } from '../services/project/worktree_service'
import { useWorktreePreparing } from './hooks/use_worktrees'
import { WorktreeCommitDialog } from './worktree_commit_dialog'
import { WorktreeUnassignDialog } from './worktree_unassign_dialog'

export interface WorktreeAssignment {
    worktree?: number | null
    worktreeError?: string | null
    worktreeValue?: string | null
}

export type WorktreeAssignmentTarget = { kind: 'card', path: string } | { kind: 'project' }

interface WorktreeSelectorProps {
    assignment: WorktreeAssignment
    assignmentTarget: WorktreeAssignmentTarget
    disabled?: boolean
    labelPrefix?: string
    primaryPath: string | null
    worktrees: WorktreeRecord[]
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
    const { assignment, assignmentTarget, disabled = false, labelPrefix, primaryPath, worktrees } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [commitMessage, setCommitMessage] = useState('')
    const [commitPush, setCommitPush] = useState(false)
    const [commitDialogOpen, setCommitDialogOpen] = useState(false)
    const [unassignDialogOpen, setUnassignDialogOpen] = useState(false)
    const cardPath = assignmentTarget.kind === 'card' ? assignmentTarget.path : null
    const preparing = useWorktreePreparing(cardPath)
    const selectorDisabled = disabled || preparing
    const state = assignmentState(assignment, worktrees)
    const assignedWorktree = assignment.worktree ?? null
    const assignedRecord = assignedWorktree === null ? null : worktrees[assignedWorktree - 1] ?? null
    const hasActiveCardWorktree = assignmentTarget.kind === 'card' && assignedWorktree !== null
        && !state.error && !!assignedRecord?.valid
    const hasOutgoingChanges = !!assignedRecord && (assignedRecord.status.dirty || assignedRecord.status.ahead > 0)
    const hasIncomingChanges = !!assignedRecord && assignedRecord.status.behind > 0
    const hasWorktreeChanges = hasOutgoingChanges || hasIncomingChanges
    const folder = state.folder ?? primaryPath ?? 'Primary'
    const assignmentDescription = state.error
        ? `Worktree assignment error: ${state.error}`
        : state.value === 'P'
            ? `Primary worktree${primaryPath ? `: ${primaryPath}` : ''}`
            : `Worktree ${state.value}: ${folder}`
    const worktreeStatusDescription = assignedRecord
        ? `Dirty: ${assignedRecord.status.dirty ? 'yes' : 'no'}; ahead: ${assignedRecord.status.ahead}; behind: ${assignedRecord.status.behind}`
        : null
    const descriptions = [assignmentDescription, worktreeStatusDescription].filter((value) => value !== null)
    const tooltip = descriptions.join('. ')
    const statusLabel = assignedRecord
        ? `; dirty ${assignedRecord.status.dirty ? 'yes' : 'no'}; ahead ${assignedRecord.status.ahead}; behind ${assignedRecord.status.behind}`
        : ''
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
                if (worktrees[assignedWorktree - 1]?.status.dirty) {
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
        const worktree = Number.parseInt(event.currentTarget.dataset.worktree ?? '', 10)
        if (!Number.isInteger(worktree)) throw new Error('Missing worktree menu index')

        handleClose()
        await assignWorktree(worktree)
    }
    const handleCommitMenu = () => {
        if (assignmentTarget.kind !== 'card') return

        handleClose()
        setCommitMessage(worktreeService.getCardCommitMessage(assignmentTarget.path))
        setCommitPush(false)
        setCommitDialogOpen(true)
    }
    const handleCommitPushMenu = async () => {
        if (assignmentTarget.kind !== 'card') return

        handleClose()
        if (assignedRecord?.status.dirty) {
            setCommitMessage(worktreeService.getCardCommitMessage(assignmentTarget.path))
            setCommitPush(true)
            setCommitDialogOpen(true)
            return
        }
        try {
            await worktreeService.pushCardWorktree(assignmentTarget.path)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not push worktree' })
        }
    }
    const handlePullMenu = async () => {
        if (assignmentTarget.kind !== 'card') return

        handleClose()
        try {
            await worktreeService.pullCardWorktree(assignmentTarget.path)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not pull worktree' })
        }
    }
    const handleCommitDialogClose = () => setCommitDialogOpen(false)
    const handleCommit = async (message: string) => {
        if (assignmentTarget.kind !== 'card') return

        try {
            await worktreeService.commitCardWorktree(assignmentTarget.path, message, commitPush)
            setCommitDialogOpen(false)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not commit worktree changes' })
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
    const handleCommitPushAndUnassign = async (message: string) => {
        if (assignmentTarget.kind !== 'card') return

        try {
            await worktreeService.commitPushAndUnassignCardWorktree(assignmentTarget.path, message)
            setUnassignDialogOpen(false)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not commit and push worktree changes' })
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
                pointerEvents: 'auto',
                position: 'relative',
                width: 26,
            }}
        >
            {hasOutgoingChanges ? <ArrowUp sx={{ bottom: -1, fontSize: 10, left: -1, position: 'absolute' }} /> : null}
            {hasIncomingChanges ? <ArrowDown sx={{ bottom: -1, fontSize: 10, position: 'absolute', right: -1 }} /> : null}
            {state.value === 'P' ? <SourceBranch sx={{ fontSize: 14 }} /> : (
                <Typography component="span" sx={{ fontSize: 11, fontWeight: 700 }}>{state.value}</Typography>
            )}
        </IconButton>
    )

    return (
        <>
            <Tooltip title={tooltip}>{selectorDisabled ? <span>{button}</span> : button}</Tooltip>
            <Menu anchorEl={anchorElement} onClose={handleClose} open={!!anchorElement}>
                <MenuItem onClick={handlePrimary} selected={assignment.worktree === null && !assignment.worktreeError}>
                    Primary{primaryPath ? ` — ${primaryPath}` : ''}
                </MenuItem>
                {hasActiveCardWorktree ? (
                    <>
                        <MenuItem disabled={!assignedRecord?.status.dirty} onClick={handleCommitMenu}>Commit</MenuItem>
                        <MenuItem onClick={handleCommitPushMenu}>Commit &amp; push</MenuItem>
                        <MenuItem
                            disabled={!!assignedRecord?.status.dirty || !assignedRecord?.status.hasUpstream}
                            onClick={handlePullMenu}
                        >
                            Pull
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
                busy={preparing}
                message={commitMessage}
                onClose={handleCommitDialogClose}
                onCommit={handleCommit}
                onMessageChange={setCommitMessage}
                open={commitDialogOpen}
                push={commitPush}
            />
            <WorktreeUnassignDialog
                busy={preparing}
                commitMessage={commitMessage}
                onClose={handleUnassignClose}
                onCommitMessageChange={setCommitMessage}
                onCommitPush={handleCommitPushAndUnassign}
                onDrop={handleDropAndUnassign}
                open={unassignDialogOpen}
            />
        </>
    )
}
