import { Box, ToggleButton, Tooltip } from '@mui/material'
import Circle from 'mdi-material-ui/Circle'
import HelpCircleOutline from 'mdi-material-ui/HelpCircleOutline'
import Play from 'mdi-material-ui/Play'
import type { ActionContext } from '../../../../data/action_context'
import type { ActionRunStatus } from '../../../../data/action_run_types'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../../../data/action_types'
import { useCardActionAgentState } from '../../../hooks/use_card_action_agent_state'

interface ActionSelectorButtonProps {
    action: ActionDefinition
    context: ActionContext
    liveStatus?: ActionRunStatus
}

/** One action selector leaf, including scoped live and persisted agent state. */
export function ActionSelectorButton({ action, context, liveStatus }: ActionSelectorButtonProps) {
    const persistedState = useCardActionAgentState(action.id, context)
    const hasLiveState = liveStatus === 'queued' || liveStatus === 'running' || liveStatus === 'waitingForInput'
    const isQueued = liveStatus === 'queued'
    const isWaiting = liveStatus === 'waitingForInput' || (!hasLiveState && persistedState === 'waiting for input')
    const isRunning = liveStatus === 'running' || (!hasLiveState && persistedState === 'running')
    const hasUnseenResult = !hasLiveState && persistedState === 'unseen result'
    const accessibleLabel = action.id === CUSTOM_PROMPT_ACTION_ID ? 'Custom prompt' : action.label
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
            title={isQueued ? stateDescription : isWaiting ? stateDescription : action.description}
        >
            <ToggleButton
                aria-label={stateDescription ? `${accessibleLabel} — ${stateDescription}` : accessibleLabel}
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
                {hasUnseenResult ? (
                    <Circle
                        aria-hidden
                        sx={{ color: 'info.main', fontSize: 8, position: 'absolute', right: 2, top: 2, zIndex: 1 }}
                    />
                ) : null}
            </ToggleButton>
        </Tooltip>
    )
}
