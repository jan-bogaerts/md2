import { Box, Button, Tooltip } from '@mui/material'
import Circle from 'mdi-material-ui/Circle'
import HelpCircleOutline from 'mdi-material-ui/HelpCircleOutline'
import Play from 'mdi-material-ui/Play'
import type { MouseEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ProjectCard } from '../../data/data_types'
import { cardActionPopupService } from '../../services/actions/card_action_popup_service'
import { agentStateDescription, cardAgentState } from '../../services/agents/card_agent_state'
import { useCardAcknowledgements } from '../hooks/use_agent_acknowledgements'
import { useRunningActionForContext } from '../hooks/use_action_runs'

interface CardRunButtonProps {
    card: ProjectCard
    context: ActionContext
}

/** Opens the card action selector and run popup, and surfaces the card's agent state. */
export function CardRunButton({ card, context }: CardRunButtonProps) {
    useCardAcknowledgements(card.path)
    const agentState = cardAgentState(card)
    const runningRun = useRunningActionForContext(context)
    const liveStatus = runningRun?.status
    const isQueued = liveStatus === 'queued'
    const isWaiting = liveStatus ? liveStatus === 'waitingForInput' : agentState === 'waiting for input'
    const isRunning = liveStatus ? liveStatus === 'running' : agentState === 'running'
    const isUnseen = !isQueued && !isWaiting && !isRunning && agentState === 'unseen result'
    const stateDescription = isQueued
        ? 'Action is queued'
        : isWaiting
            ? agentStateDescription('waiting for input')
            : isRunning && agentState !== 'running'
                ? 'Action is running'
                : agentStateDescription(agentState)
    const accent = isWaiting ? 'warning.main' : isUnseen ? 'info.main' : 'primary.main'
    const handleRun = (event: MouseEvent<HTMLButtonElement>) => {
        cardActionPopupService.toggle(context, event.currentTarget)
    }

    const button = (
        <Box
            sx={(theme) => ({
                borderRadius: 99,
                display: 'inline-flex',
                overflow: 'hidden',
                p: isRunning ? '1.5px' : 0,
                position: 'relative',
                ...(isRunning && {
                    '@keyframes md2-run-spin': { to: { transform: 'rotate(1turn)' } },
                    '&::before': {
                        animation: 'md2-run-spin 1s linear infinite',
                        background: `conic-gradient(from 0deg, ${theme.palette.primary.main}, transparent 55%)`,
                        content: '""',
                        inset: '-50%',
                        pointerEvents: 'none',
                        position: 'absolute',
                    },
                }),
            })}
        >
            <Button
                aria-label={stateDescription ? `Run — ${stateDescription}` : 'Run'}
                onClick={handleRun}
                size="small"
                startIcon={<Play sx={{ fontSize: '13px !important' }} />}
                sx={{
                    bgcolor: 'background.paper',
                    borderColor: isRunning ? 'transparent' : isWaiting ? 'warning.main' : isUnseen ? 'info.main' : undefined,
                    borderRadius: 99,
                    color: isWaiting ? 'warning.main' : isUnseen ? 'info.main' : undefined,
                    fontSize: 11.5,
                    height: 26,
                    minWidth: 0,
                    position: 'relative',
                    px: 1.25,
                    zIndex: 1,
                    '&:hover': { bgcolor: 'background.paper' },
                }}
                variant="outlined"
            >
                Run
            </Button>
            {isWaiting ? <HelpCircleOutline sx={{ color: accent, fontSize: 11, position: 'absolute', right: -2, top: -2, zIndex: 2 }} /> : null}
            {isUnseen ? <Circle sx={{ color: accent, fontSize: 8, position: 'absolute', right: 0, top: 0, zIndex: 2 }} /> : null}
        </Box>
    )

    return (
        <Tooltip title={stateDescription ?? ''}>{button}</Tooltip>
    )
}
