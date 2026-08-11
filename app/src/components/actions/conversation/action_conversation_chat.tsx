import { Stack, Typography } from '@mui/material'
import { useLayoutEffect, useRef, useState, type UIEvent } from 'react'
import type { AgentConversation } from '../../../data/data_types'
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

const CHAT_END_TOLERANCE = 4
const MIN_CHAT_HEIGHT = 96

interface ActionConversationChatProps {
    conversation: AgentConversation | null
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

function visibleConversationGroups(conversation: AgentConversation | null) {
    if (!conversation) return []
    const showEvents = hasAgentActivity(conversation)
    const visibleEntries = conversation.entries.filter((entry) => entry.kind === 'message'
        || (showEvents && entry.type !== 'diagnostic' && (entry.type !== 'reasoning' || entry.status !== 'completed')))

    return buildActionConversationRenderGroups(visibleEntries)
}

/** Ordered user/assistant transcript shown above the popup prompt. */
export function ActionConversationChat({ conversation, status }: ActionConversationChatProps) {
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
                    return <ActionConversationMessage cardInternalId={conversation?.cardInternalId ?? null} entry={entry} key={group.key} />
                }

                return <ActionConversationEventRow entry={entry} grouped={false} key={group.key} />
            })}
            {Array.from({ length: reservedBlockCount }, (_, index) => (
                <ActionConversationReservedBlock key={`reserved-block-${index}`} />
            ))}
            {status !== 'idle' ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
                    <Typography color={status === 'failed' ? 'error.main' : 'text.secondary'} role="status" variant="caption">
                        {actionStatusLabel(status)}
                    </Typography>
                    {conversation ? (
                        <ConversationTimer completedAt={conversation.completedAt} startedAt={conversation.startedAt} status={status} />
                    ) : null}
                </Stack>
            ) : null}
        </Stack>
    )
}
