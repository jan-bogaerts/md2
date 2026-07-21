import { CircularProgress, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import Circle from 'mdi-material-ui/Circle'
import HelpCircleOutline from 'mdi-material-ui/HelpCircleOutline'
import SourceBranch from 'mdi-material-ui/SourceBranch'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { WorktreeRecord } from '../data/data_types'
import { dialogService } from '../services/dialog_service'
import { worktreeService } from '../services/project/worktree_service'
import { useWorktreePreparing } from './hooks/use_worktrees'

export interface WorktreeAssignment {
    worktree?: number | null
    worktreeError?: string | null
    worktreeValue?: string | null
}

export type WorktreeAssignmentTarget = { kind: 'card', path: string } | { kind: 'project' }

interface WorktreeSelectorProps {
    agentState?: 'idle' | 'running' | 'unseen result' | 'waiting for input'
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

function agentStateDescription(agentState: WorktreeSelectorProps['agentState']) {
    if (agentState === 'waiting for input') return 'Agent is waiting for input'
    if (agentState === 'running') return 'Agent is running'
    if (agentState === 'unseen result') return 'New agent result available'
    if (agentState === 'idle') return 'Agent is idle'

    return null
}

/** Shared worktree assignment button and menu used by cards and action popups. */
export function WorktreeSelector(props: WorktreeSelectorProps) {
    const { agentState, assignment, assignmentTarget, disabled = false, labelPrefix, primaryPath, worktrees } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const cardPath = assignmentTarget.kind === 'card' ? assignmentTarget.path : null
    const preparing = useWorktreePreparing(cardPath)
    const selectorDisabled = disabled || preparing
    const state = assignmentState(assignment, worktrees)
    const isWaiting = agentState === 'waiting for input'
    const isRunning = agentState === 'running'
    const isUnseen = agentState === 'unseen result'
    const folder = state.folder ?? primaryPath ?? 'Primary'
    const assignmentDescription = state.error
        ? `Worktree assignment error: ${state.error}`
        : state.value === 'P'
            ? `Primary worktree${primaryPath ? `: ${primaryPath}` : ''}`
            : `Worktree ${state.value}: ${folder}`
    const statusDescription = agentStateDescription(agentState)
    const tooltip = statusDescription ? `${assignmentDescription}. ${statusDescription}.` : assignmentDescription
    const label = labelPrefix && agentState ? `${labelPrefix}: ${folder}; agent ${agentState}` : assignmentDescription

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
        await assignWorktree(null)
    }
    const handleWorktree = async (event: MouseEvent<HTMLElement>) => {
        const worktree = Number.parseInt(event.currentTarget.dataset.worktree ?? '', 10)
        if (!Number.isInteger(worktree)) throw new Error('Missing worktree menu index')

        handleClose()
        await assignWorktree(worktree)
    }

    const button = (
        <IconButton
            aria-label={label}
            disabled={selectorDisabled}
            onClick={handleOpen}
            size="small"
            sx={{
                border: 1,
                borderColor: state.error ? 'error.main' : isWaiting ? 'warning.main' : isUnseen ? 'info.main' : 'divider',
                color: state.error ? 'error.main' : isWaiting ? 'warning.main' : isUnseen ? 'info.main' : 'text.secondary',
                height: 26,
                pointerEvents: 'auto',
                position: 'relative',
                width: 26,
            }}
        >
            {isRunning ? <CircularProgress size={24} sx={{ position: 'absolute' }} /> : null}
            {isWaiting ? <HelpCircleOutline sx={{ fontSize: 24, position: 'absolute' }} /> : null}
            {isUnseen ? <Circle sx={{ fontSize: 7, position: 'absolute', right: 1, top: 1 }} /> : null}
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
                {worktrees.map((record, index) => (record.valid ? (
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
        </>
    )
}
