import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import ArrowDown from 'mdi-material-ui/ArrowDown'
import ArrowUp from 'mdi-material-ui/ArrowUp'
import SourceBranch from 'mdi-material-ui/SourceBranch'
import type { MouseEvent } from 'react'
import type { WorktreeAssignment } from '../data/data_types'
import { worktreeService } from '../services/project/worktree_service'
import { useWorktreeSelectorState } from './hooks/use_worktree_selector_state'
import { getWorktreeAssignmentDisplayState } from './worktree_selector_assignment_state'

interface WorktreeSelectorStatusButtonProps {
    assignment: WorktreeAssignment
    cardInternalId: string | null
    disabled: boolean
    disabledReason?: string
    labelPrefix?: string
    onOpen: (event: MouseEvent<HTMLElement>) => void
    primaryPath: string | null
}

/** Always-active worktree status subscription and button rendering boundary. */
export function WorktreeSelectorStatusButton(props: WorktreeSelectorStatusButtonProps) {
    const { assignment, cardInternalId, disabled, disabledReason, labelPrefix, onOpen, primaryPath } = props
    const { preparing, projectDirty, record } = useWorktreeSelectorState({ assignment, cardInternalId })
    const state = getWorktreeAssignmentDisplayState(assignment)
    const selectorDisabled = disabled || preparing
    const hasOutgoingChanges = !!record && (record.status.dirty || record.status.baseAhead > 0)
    const hasIncomingChanges = !!record && (projectDirty || record.status.baseBehind > 0)
    const hasWorktreeChanges = hasOutgoingChanges || hasIncomingChanges
    const folder = state.folder ?? primaryPath ?? 'Primary'
    const assignmentDescription = state.error
        ? `Worktree assignment error: ${state.error}`
        : state.value === 'P'
            ? `Primary worktree${primaryPath ? `: ${primaryPath}` : ''}`
            : `Worktree ${state.value}: ${folder}`
    const baseName = worktreeService.getProjectBranch() ?? 'the project branch'
    const statusParts = record
        ? [
            `dirty ${record.status.dirty ? 'yes' : 'no'}`,
            `project changes pending ${projectDirty ? 'yes' : 'no'}`,
            `ahead of ${baseName} ${record.status.baseAhead}`,
            `behind ${baseName} ${record.status.baseBehind}`,
        ]
        : []
    const worktreeStatusDescription = statusParts.length > 0 ? statusParts.join('; ') : null
    const descriptions = [assignmentDescription, worktreeStatusDescription, disabledReason]
        .filter((value) => value !== null && value !== undefined)
    const tooltip = descriptions.join('. ')
    const statusLabel = worktreeStatusDescription ? `; ${worktreeStatusDescription}` : ''
    const label = labelPrefix ? `${labelPrefix}: ${folder}${statusLabel}` : `${assignmentDescription}${statusLabel}`
    const accessibleLabel = preparing ? 'Worktree operation in progress' : label
    const button = (
        <Box
            sx={(theme) => ({
                borderRadius: 1,
                display: 'inline-flex',
                overflow: 'hidden',
                p: preparing ? '1.5px' : 0,
                position: 'relative',
                ...(preparing && {
                    '@keyframes md2-worktree-spin': { to: { transform: 'rotate(1turn)' } },
                    '&::before': {
                        animation: 'md2-worktree-spin 1s linear infinite',
                        background: `conic-gradient(from 0deg, ${theme.palette.primary.main}, transparent 55%)`,
                        content: '""',
                        inset: '-50%',
                        pointerEvents: 'none',
                        position: 'absolute',
                    },
                }),
            })}
        >
            <IconButton
                aria-label={accessibleLabel}
                disabled={selectorDisabled}
                onClick={onOpen}
                size="small"
                sx={{
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: preparing ? 'transparent' : state.error ? 'error.main' : hasWorktreeChanges ? 'warning.main' : 'divider',
                    color: state.error ? 'error.main' : hasWorktreeChanges ? 'warning.main' : 'text.secondary',
                    height: 26,
                    p: 0,
                    pointerEvents: 'auto',
                    position: 'relative',
                    width: 26,
                    zIndex: 1,
                    '&:hover': { bgcolor: 'background.paper' },
                    '&.Mui-disabled': { bgcolor: 'background.paper' },
                }}
            >
                <Box
                    sx={{
                        alignItems: 'center',
                        display: 'flex',
                        height: '100%',
                        justifyContent: 'center',
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
        </Box>
    )

    return <Tooltip title={tooltip}>{selectorDisabled ? <span>{button}</span> : button}</Tooltip>
}
