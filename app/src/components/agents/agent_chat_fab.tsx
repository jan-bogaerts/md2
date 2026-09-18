import { Box } from '@mui/material'
import Circle from 'mdi-material-ui/Circle'
import HelpCircleOutline from 'mdi-material-ui/HelpCircleOutline'
import RobotOutline from 'mdi-material-ui/RobotOutline'
import { useEffect } from 'react'
import { projectContext } from '../../data/action_context'
import { cardPopupService } from '../../services/card_popup_service'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { agentStateDescription } from '../../services/agents/card_agent_state'
import { useProjectAgentState } from '../hooks/use_agent_acknowledgements'
import { useActiveActionRunsForContext } from '../hooks/use_action_runs'
import { MovableFab } from '../movable_fab'

const PROJECT_CONTEXT = projectContext()

/** Project-wide free-form agent launcher, movable anywhere in application viewport. */
export function AgentChatFab() {
    const agentState = useProjectAgentState()
    const activeRuns = useActiveActionRunsForContext(PROJECT_CONTEXT)
    const isWaiting = activeRuns.some(({ status }) => status === 'waitingForInput')
        || agentState === 'waiting for input'
    const isRunning = !isWaiting && (
        activeRuns.some(({ status }) => status === 'running')
        || agentState === 'running'
    )
    const isQueued = !isWaiting && !isRunning && activeRuns.some(({ status }) => status === 'queued')
    const isUnseen = !isQueued && !isWaiting && !isRunning && agentState === 'unseen result'
    const stateDescription = isQueued
        ? 'Action is queued'
        : isWaiting
            ? agentStateDescription('waiting for input')
            : isRunning && agentState !== 'running'
                ? 'Action is running'
                : agentStateDescription(agentState)
    const label = stateDescription ? `Project agent — ${stateDescription}` : 'Project agent'
    const handleActivate = (nextAnchorElement: HTMLElement) => cardPopupService.toggleAction(PROJECT_CONTEXT, nextAnchorElement)
    const handleDragStart = () => cardPopupService.closeAction(PROJECT_CONTEXT)

    useEffect(() => {
        void dataService.listAgentConversations(PROJECT_CONTEXT).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not load project agent conversations' })
        })
    }, [])

    return (
        <>
            <MovableFab
                ariaLabel={label}
                fabSx={(theme) => ({
                    bgcolor: isWaiting ? 'warning.main' : isUnseen ? 'info.main' : undefined,
                    isolation: 'isolate',
                    overflow: 'visible',
                    position: 'relative',
                    ...(isRunning && {
                        '@keyframes md2-project-run-spin': { to: { transform: 'rotate(1turn)' } },
                        '&::before': {
                            animation: 'md2-project-run-spin 1s linear infinite',
                            background: `conic-gradient(from 0deg, ${theme.palette.primary.main}, transparent 55%)`,
                            borderRadius: '50%',
                            content: '""',
                            inset: -4,
                            pointerEvents: 'none',
                            position: 'absolute',
                            zIndex: -1,
                        },
                    }),
                })}
                onActivate={handleActivate}
                onDragStart={handleDragStart}
                tooltip={label}
            >
                <Box component="span" sx={{ alignItems: 'center', display: 'inline-flex', position: 'relative' }}>
                    <RobotOutline />
                    {isWaiting ? (
                        <HelpCircleOutline sx={{ color: 'warning.contrastText', fontSize: 15, position: 'absolute', right: -9, top: -9 }} />
                    ) : null}
                    {isUnseen ? (
                        <Circle sx={{ color: 'info.contrastText', fontSize: 9, position: 'absolute', right: -7, top: -7 }} />
                    ) : null}
                </Box>
            </MovableFab>
        </>
    )
}
