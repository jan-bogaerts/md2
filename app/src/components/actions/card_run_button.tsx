import { Box, Button, Tooltip } from '@mui/material'
import Circle from 'mdi-material-ui/Circle'
import HelpCircleOutline from 'mdi-material-ui/HelpCircleOutline'
import Play from 'mdi-material-ui/Play'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { AgentConversation, ProjectCard } from '../../data/data_types'
import { hasUnseenAgentResult } from '../../services/agents/agent_acknowledgement_service'
import { agentStateDescription, cardAgentState } from '../../services/agents/card_agent_state'
import { useRunningActionForContext } from '../hooks/use_action_executions'
import { ActionPopup } from './action_popup'

interface CardRunButtonProps {
    card: ProjectCard
    context: ActionContext
    onConversationViewed: (conversation: AgentConversation) => void
    projectKey: string
}

/** Opens the card action selector and execution popup, and surfaces the card's agent state. */
export function CardRunButton({ card, context, onConversationViewed, projectKey }: CardRunButtonProps) {
    const [popupAnchor, setPopupAnchor] = useState<HTMLElement | null>(null)
    const agentState = cardAgentState(projectKey, card)
    const runningExecution = useRunningActionForContext(context)
    const isWaiting = agentState === 'waiting for input'
    const isRunning = !isWaiting && (agentState === 'running' || !!runningExecution)
    const isUnseen = !isRunning && agentState === 'unseen result'
    const stateDescription = isRunning && agentState !== 'running'
        ? 'Action is running'
        : agentStateDescription(agentState)
    const accent = isWaiting ? 'warning.main' : isUnseen ? 'info.main' : 'primary.main'
    const unseenResultActionIds = [...new Set(card.agentConversations.flatMap((conversation) => {
        if (!conversation.actionId || !hasUnseenAgentResult(projectKey, card.path, [conversation])) return []

        return [conversation.actionId]
    }))]

    const closePopup = () => {
        setPopupAnchor(null)
    }

    const handleRun = (event: MouseEvent<HTMLButtonElement>) => {
        if (popupAnchor) {
            closePopup()
            return
        }

        setPopupAnchor(event.currentTarget)
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
        <>
            <Tooltip title={stateDescription ?? ''}>{button}</Tooltip>
            {popupAnchor ? (
                <ActionPopup
                    anchorElement={popupAnchor}
                    context={context}
                    draggable
                    onClose={closePopup}
                    onConversationViewed={onConversationViewed}
                    unseenResultActionIds={unseenResultActionIds}
                />
            ) : null}
        </>
    )
}
