import { Box, CircularProgress, Stack, Tooltip, Typography } from '@mui/material'
import { useLayoutEffect, useRef, useState, type UIEvent } from 'react'
import type { AgentConversation } from '../../../data/data_types'
import type { ActionQueuedPrompt } from '../../../data/action_run_types'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import { ActionConversationEventRow } from './action_conversation_event_row'
import { ActionConversationMessage } from './action_conversation_message'
import { actionStatusLabel } from '../shared/action_status'
import { ConversationTimer } from './conversation_timer'
import { buildActionConversationRenderGroups } from './action_conversation_render_groups'
import { CompletedToolCallGroup } from './completed_tool_call_group'
import {
    createActionConversationReservationState,
    reservedActionConversationBlockCount,
    updateActionConversationReservation,
} from './action_conversation_reservation'
import { ActionConversationReservedBlock } from './action_conversation_reserved_block'
import { contextWindowUsedPercent } from './conversation_context_window'
import { reasoningDisplay } from './reasoning_display'
import { ActionQueuedPromptRow } from './action_queued_prompt'

const CHAT_END_TOLERANCE = 4
const MIN_CHAT_HEIGHT = 96

interface ActionConversationChatProps {
    conversation: AgentConversation | null
    queuedPrompts?: ActionQueuedPrompt[]
    runId?: string | null
    status: PopupRunStatus
}

function viewportIsAtEnd(viewport: HTMLDivElement) {
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= CHAT_END_TOLERANCE
}

function hasAgentActivity(conversation: AgentConversation) {
    return conversation.providerSessions.some(({ agent }) => agent === 'codex')
        || conversation.entries.some((entry) => entry.kind === 'message' && entry.agent === 'codex')
        || conversation.entries.some((entry) => entry.kind === 'event' && !!entry.providerItemId)
}

function conversationEventIsVisible(entry: AgentConversation['entries'][number]) {
    if (entry.kind !== 'event' || entry.type === 'diagnostic') return false
    if (entry.type !== 'reasoning' || entry.status !== 'completed') return true

    return reasoningDisplay(entry).hasText
}

function visibleConversationGroups(conversation: AgentConversation | null) {
    if (!conversation) return []
    const showEvents = hasAgentActivity(conversation)
    const visibleEntries = conversation.entries.filter((entry) => entry.kind === 'message'
        || (showEvents && conversationEventIsVisible(entry)))

    return buildActionConversationRenderGroups(visibleEntries)
}

/** Ordered user/assistant transcript shown above the popup prompt. */
export function ActionConversationChat({ conversation, queuedPrompts = [], runId = null, status }: ActionConversationChatProps) {
    const groups = visibleConversationGroups(conversation)
    const viewportRef = useRef<HTMLDivElement>(null)
    const conversationPathRef = useRef<string | null | undefined>(undefined)
    const stuckToEndRef = useRef(true)
    const conversationPath = conversation?.path ?? null
    const [reservationState, setReservationState] = useState(() => updateActionConversationReservation(
        createActionConversationReservationState(),
        conversationPath,
        groups,
        status,
    ))
    const nextReservationState = updateActionConversationReservation(reservationState, conversationPath, groups, status)
    if (nextReservationState !== reservationState) setReservationState(nextReservationState)
    const reservedBlockCount = reservedActionConversationBlockCount(nextReservationState)
    const contextUsedPercent = contextWindowUsedPercent(conversation?.contextWindowUsage)

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
        stuckToEndRef.current = viewportIsAtEnd(event.currentTarget)
    }

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const conversationPath = conversation?.path ?? null
        const conversationChanged = conversationPathRef.current !== conversationPath
        conversationPathRef.current = conversationPath
        if (conversationChanged) stuckToEndRef.current = true
        if (!stuckToEndRef.current) return

        viewport.scrollTop = viewport.scrollHeight
    })

    return (
        <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
            <Stack
                aria-label="Conversation chat"
                onScroll={handleScroll}
                ref={viewportRef}
                spacing={1}
                sx={{ flex: 1, minHeight: MIN_CHAT_HEIGHT, overflowX: 'hidden', overflowY: 'auto' }}
            >
                {groups.map((group) => {
                    if (group.kind === 'completedToolCalls') {
                        return <CompletedToolCallGroup entries={group.entries} key={group.key} />
                    }

                    const { entry } = group
                    if (entry.kind === 'message') {
                        return (
                            <ActionConversationMessage
                                cardInternalId={conversation?.cardInternalId ?? null}
                                entry={entry}
                                key={group.key}
                            />
                        )
                    }

                    return <ActionConversationEventRow entry={entry} grouped={false} key={group.key} />
                })}
                {Array.from({ length: reservedBlockCount }, (_, index) => (
                    <ActionConversationReservedBlock key={`reserved-block-${index}`} />
                ))}
                {runId ? queuedPrompts.map((entry) => (
                    <ActionQueuedPromptRow entry={entry} key={entry.id} runId={runId} />
                )) : null}
                {conversation || status !== 'idle' ? (
                    <Stack
                        aria-label="Conversation metadata"
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: 'baseline', flexShrink: 0 }}
                    >
                        {status !== 'idle' ? (
                            <Typography color={status === 'failed' ? 'error.main' : 'text.secondary'} role="status" variant="caption">
                                {actionStatusLabel(status)}
                            </Typography>
                        ) : null}
                        {conversation ? (
                            <ConversationTimer status={status} timer={conversation.timer} />
                        ) : null}
                        <Box sx={{ flex: 1 }} />
                        {contextUsedPercent !== null ? (
                            <Box sx={{ display: 'inline-flex', height: 16, position: 'relative', width: 16 }}>
                                <CircularProgress
                                    aria-hidden="true"
                                    size={16}
                                    sx={{ color: 'action.disabledBackground', left: 0, position: 'absolute', top: 0 }}
                                    value={100}
                                    variant="determinate"
                                />
                                <Tooltip describeChild title={`Context usage: ${contextUsedPercent}%`}>
                                    <CircularProgress
                                        aria-label="Context usage"
                                        color="info"
                                        size={16}
                                        sx={{ left: 0, position: 'absolute', top: 0 }}
                                        value={contextUsedPercent}
                                        variant="determinate"
                                    />
                                </Tooltip>
                            </Box>
                        ) : null}
                    </Stack>
                ) : null}
            </Stack>
        </Stack>
    )
}
