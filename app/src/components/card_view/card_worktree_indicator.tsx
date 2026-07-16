import { CircularProgress, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import SourceBranch from 'mdi-material-ui/SourceBranch'
import HelpCircleOutline from 'mdi-material-ui/HelpCircleOutline'
import Circle from 'mdi-material-ui/Circle'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { ProjectCard, WorktreeRecord } from '../../data/data_types'
import { hasUnseenAgentResult } from '../../services/agent_acknowledgement_service'

interface CardWorktreeIndicatorProps {
    card: ProjectCard
    onAssign: (cardPath: string, worktree: number | null) => void
    primaryPath: string
    projectKey: string
    worktrees: WorktreeRecord[]
}

function isConversationWaiting(card: ProjectCard) {
    return card.agentConversations.some((conversation) => {
        if (conversation.status !== 'running') return false

        const stateEvent = [...conversation.events].reverse().find((event) => event.type === 'waiting' || event.type === 'resumed')

        return stateEvent?.type === 'waiting'
    })
}

function assignmentState(card: ProjectCard, worktrees: WorktreeRecord[]) {
    if (card.header.worktreeError) {
        return { error: card.header.worktreeError, folder: 'invalid assignment', value: card.header.worktreeValue ?? '?' }
    }
    const worktree = card.header.worktree ?? null
    if (worktree === null) return { error: null, folder: null, value: 'P' }

    const record = worktrees[worktree - 1]
    if (!record) {
        return { error: `Configured worktree ${worktree} does not exist`, folder: 'missing folder', value: String(worktree) }
    }
    if (!record.valid) {
        return { error: `${record.path}: ${record.error}`, folder: record.path, value: String(worktree) }
    }

    return { error: null, folder: record.path, value: String(worktree) }
}

export function CardWorktreeIndicator(props: CardWorktreeIndicatorProps) {
    const { card, onAssign, primaryPath, projectKey, worktrees } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const assignment = assignmentState(card, worktrees)
    const isWaiting = isConversationWaiting(card)
    const isRunning = !isWaiting && card.agentConversations.some((conversation) => conversation.status === 'running')
    const isUnseen = !isWaiting && !isRunning
        && hasUnseenAgentResult(projectKey, card.path, card.agentConversations)
    const agentState = isWaiting ? 'waiting for input' : isRunning ? 'running' : isUnseen ? 'unseen result' : 'idle'
    const agentStateDescription = isWaiting
        ? 'Agent is waiting for input'
        : isRunning
            ? 'Agent is running'
            : isUnseen
                ? 'New agent result available'
                : 'Agent is idle'
    const folder = assignment.folder ?? primaryPath
    const label = `${card.header.id}: ${folder}; agent ${agentState}`
    const assignmentDescription = assignment.error
        ? `Worktree assignment error: ${assignment.error}`
        : assignment.value === 'P'
            ? `Primary worktree: ${folder}`
            : `Worktree ${assignment.value}: ${folder}`
    const tooltip = `${assignmentDescription}. ${agentStateDescription}.`

    const handleOpen = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        setAnchorElement(event.currentTarget)
    }

    const handleClose = () => {
        setAnchorElement(null)
    }

    const handlePrimary = () => {
        onAssign(card.path, null)
        handleClose()
    }

    const handleWorktree = (event: MouseEvent<HTMLElement>) => {
        const worktree = Number.parseInt(event.currentTarget.dataset.worktree ?? '', 10)
        if (!Number.isInteger(worktree)) throw new Error('Missing worktree menu index')

        onAssign(card.path, worktree)
        handleClose()
    }

    const button = (
        <IconButton
            aria-label={label}
            onClick={handleOpen}
            size="small"
            sx={{
                border: 1,
                borderColor: assignment.error ? 'error.main' : isWaiting ? 'warning.main' : isUnseen ? 'info.main' : 'divider',
                color: assignment.error ? 'error.main' : isWaiting ? 'warning.main' : isUnseen ? 'info.main' : 'text.secondary',
                height: 26,
                pointerEvents: 'auto',
                position: 'relative',
                width: 26,
            }}
        >
            {isRunning ? <CircularProgress size={24} sx={{ position: 'absolute' }} /> : null}
            {isWaiting ? <HelpCircleOutline sx={{ fontSize: 24, position: 'absolute' }} /> : null}
            {isUnseen ? <Circle sx={{ fontSize: 7, position: 'absolute', right: 1, top: 1 }} /> : null}
            {assignment.value === 'P' ? <SourceBranch sx={{ fontSize: 14 }} /> : (
                <Typography component="span" sx={{ fontSize: 11, fontWeight: 700 }}>{assignment.value}</Typography>
            )}
        </IconButton>
    )

    return (
        <>
            <Tooltip title={tooltip}>{button}</Tooltip>
            <Menu anchorEl={anchorElement} onClose={handleClose} open={!!anchorElement}>
                <MenuItem onClick={handlePrimary} selected={card.header.worktree === null && !card.header.worktreeError}>
                    Primary — {primaryPath}
                </MenuItem>
                {worktrees.map((record, index) => (record.valid ? (
                    <MenuItem
                        data-worktree={index + 1}
                        key={`${index}-${record.path}`}
                        onClick={handleWorktree}
                        selected={card.header.worktree === index + 1}
                    >
                        {index + 1} — {record.path}
                    </MenuItem>
                ) : null))}
                {assignment.error ? <MenuItem disabled selected>{assignment.value} — {assignment.error}</MenuItem> : null}
            </Menu>
        </>
    )
}
