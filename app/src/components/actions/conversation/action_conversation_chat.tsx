import { Stack, Typography } from '@mui/material'
import { useLayoutEffect, useRef, type UIEvent } from 'react'
import type { AgentConversation } from '../../../data/data_types'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import { ActionConversationEventRow } from './action_conversation_event_row'
import { ActionConversationMessage } from './action_conversation_message'
import { actionStatusLabel } from '../shared/action_status'
import { ConversationTimer } from './conversation_timer'
import { eventIdentity } from './event_display'

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

function visibleConversationEntries(conversation: AgentConversation | null) {
    if (!conversation) return []
    const showEvents = hasAgentActivity(conversation)

    return conversation.entries.filter((entry) => entry.kind === 'message'
        || (showEvents && (entry.type !== 'reasoning' || entry.status !== 'completed')))
}

/** Ordered user/assistant transcript shown above the popup prompt. */
export function ActionConversationChat({ conversation, status }: ActionConversationChatProps) {
    const entries = visibleConversationEntries(conversation)
    const viewportRef = useRef<HTMLDivElement>(null)
    const conversationPathRef = useRef<string | null | undefined>(undefined)
    const stuckToEndRef = useRef(true)

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
            {entries.map((entry) => entry.kind === 'message' ? (
                <ActionConversationMessage entry={entry} key={entry.id} />
            ) : (
                <ActionConversationEventRow entry={entry} key={eventIdentity(entry)} />
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
