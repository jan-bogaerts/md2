import { Box, IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import Circle from 'mdi-material-ui/Circle'
import HelpCircleOutline from 'mdi-material-ui/HelpCircleOutline'
import Play from 'mdi-material-ui/Play'
import Plus from 'mdi-material-ui/Plus'
import type { MouseEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionRunStatus } from '../../data/action_run_types'
import type { ActionDefinition } from '../../data/action_types'
import { useActiveActionRunsForContext } from '../hooks/use_action_runs'

interface ActionSelectorProps {
    adding: boolean
    actions: ActionDefinition[]
    context: ActionContext
    onAdd: () => void
    onSelect: (actionId: string) => void
    selectedAction: ActionDefinition
    unseenResultActionIds: string[]
}

/** Horizontally scrollable, mutually exclusive action selector used by the card Run popup. */
export function ActionSelector(props: ActionSelectorProps) {
    const { adding, actions, context, onAdd, onSelect, selectedAction, unseenResultActionIds } = props
    const activeRuns = useActiveActionRunsForContext(context)
    const activeActionStatuses: Record<string, ActionRunStatus> = {}
    for (const { rootActionId, status } of activeRuns) {
        if (status === 'waitingForInput' || !activeActionStatuses[rootActionId]) activeActionStatuses[rootActionId] = status
    }

    const handleChange = (_event: MouseEvent<HTMLElement>, actionId: string | null) => {
        if (actionId) onSelect(actionId)
    }

    return (
        <Box sx={{ alignItems: 'center', display: 'flex', flex: 1, flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
            <Box sx={{ minWidth: 0 }}>
                <ToggleButtonGroup
                    aria-label="Actions"
                    exclusive
                    onChange={handleChange}
                    size="small"
                    sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1,
                        '& .MuiToggleButtonGroup-grouped': {
                            bgcolor: 'action.selected',
                            border: '1px solid transparent',
                            borderRadius: '7px !important',
                            color: 'text.secondary',
                            fontSize: 12,
                            fontWeight: 600,
                            height: 26,
                            m: '0 !important',
                            px: 1.5,
                            textTransform: 'none',
                            '&:hover': { bgcolor: 'action.hover', borderColor: 'text.disabled', color: 'text.primary' },
                            '&.Mui-selected': {
                                bgcolor: 'action.selected',
                                borderColor: 'primary.main',
                                color: 'primary.main',
                                '&:hover': { bgcolor: 'action.selected' },
                            },
                        },
                    }}
                    value={selectedAction.id}
                >
                    {actions.map((action) => {
                        const isQueued = activeActionStatuses[action.id] === 'queued'
                        const isWaiting = activeActionStatuses[action.id] === 'waitingForInput'
                        const isRunning = activeActionStatuses[action.id] === 'running'
                        const hasUnseenResult = unseenResultActionIds.includes(action.id)
                        const stateDescription = isQueued
                            ? 'Action is queued'
                            : isWaiting
                                ? 'Agent is waiting for input'
                                : isRunning
                                    ? 'Agent is running'
                                    : hasUnseenResult
                                        ? 'New agent result available'
                                        : null

                        return (
                            <Tooltip
                                describeChild
                                key={action.id}
                                title={isQueued ? stateDescription : isWaiting ? stateDescription : action.description}
                            >
                                <ToggleButton
                                    aria-label={stateDescription ? `${action.label} — ${stateDescription}` : action.label}
                                    sx={(theme) => ({
                                        overflow: 'hidden',
                                        position: 'relative',
                                        ...(isWaiting && {
                                            '&.MuiToggleButton-root.MuiToggleButtonGroup-grouped': {
                                                borderColor: 'warning.main',
                                                color: 'warning.main',
                                                '&:hover': { borderColor: 'warning.main', color: 'warning.main' },
                                                '&.Mui-selected': {
                                                    borderColor: 'warning.main',
                                                    color: 'warning.main',
                                                },
                                            },
                                        }),
                                        ...(isRunning && {
                                            '@keyframes md2-action-run-spin': { to: { transform: 'rotate(1turn)' } },
                                            '&::after': {
                                                backgroundColor: theme.palette.action.selected,
                                                borderRadius: '5.5px',
                                                content: '""',
                                                inset: '1.5px',
                                                pointerEvents: 'none',
                                                position: 'absolute',
                                            },
                                            '&::before': {
                                                animation: 'md2-action-run-spin 1s linear infinite',
                                                background: `conic-gradient(from 0deg, ${theme.palette.primary.main}, transparent 55%)`,
                                                content: '""',
                                                inset: '-100%',
                                                pointerEvents: 'none',
                                                position: 'absolute',
                                            },
                                        }),
                                    })}
                                    value={action.id}
                                >
                                    <Box component="span" sx={{ alignItems: 'center', display: 'inline-flex', gap: 0.5, position: 'relative', zIndex: 1 }}>
                                        {isWaiting ? <HelpCircleOutline aria-hidden sx={{ fontSize: 13 }} /> : null}
                                        {isRunning ? <Play aria-hidden sx={{ fontSize: 13 }} /> : null}
                                        {action.label}
                                    </Box>
                                    {hasUnseenResult && !isQueued && !isWaiting && !isRunning ? (
                                        <Circle
                                            aria-hidden
                                            sx={{ color: 'info.main', fontSize: 8, position: 'absolute', right: 2, top: 2, zIndex: 1 }}
                                        />
                                    ) : null}
                                </ToggleButton>
                            </Tooltip>
                        )
                    })}
                </ToggleButtonGroup>
            </Box>
            <Tooltip title="Add action">
                <IconButton
                    aria-label="Add action"
                    onClick={onAdd}
                    size="small"
                    sx={{
                        bgcolor: adding ? 'action.selected' : 'background.paper',
                        border: 1,
                        borderColor: adding ? 'primary.main' : 'divider',
                        color: adding ? 'primary.main' : 'text.secondary',
                        height: 28,
                        width: 28,
                        '&:hover': { bgcolor: 'action.selected', borderColor: 'primary.main', color: 'primary.main' },
                    }}
                >
                    <Plus sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>
        </Box>
    )
}
