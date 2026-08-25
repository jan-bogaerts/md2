import { Stack } from '@mui/material'
import { memo, useCallback, useLayoutEffect, useRef, useState, type UIEvent } from 'react'
import type { AgentConversation } from '../../../data/data_types'
import type { ActionQueuedPrompt } from '../../../data/action_run_types'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import { ActionConversationEventRow } from './action_conversation_event_row'
import { ActionConversationMessage } from './action_conversation_message'
import { buildActionConversationRenderGroups } from './action_conversation_render_groups'
import {
    createActionConversationReservationState,
    reservedActionConversationBlockCount,
    updateActionConversationReservation,
} from './action_conversation_reservation'
import { ActionConversationReservedBlock } from './action_conversation_reserved_block'
import { ActionQueuedPromptRow } from './action_queued_prompt'
import { CompletedToolCallGroup } from './completed_tool_call_group'
import { reasoningDisplay } from './reasoning_display'
import { SubAgentGroup } from './sub_agent_group'

const CHAT_END_TOLERANCE = 4
const MIN_CHAT_HEIGHT = 96

export type ConversationTranscript = Pick<AgentConversation, 'cardInternalId' | 'entries' | 'path' | 'providerSessions'>

interface ActionConversationTranscriptProps {
    conversation: ConversationTranscript | null
    queuedPrompts?: ActionQueuedPrompt[]
    runId?: string | null
    status: PopupRunStatus
}

function viewportIsAtEnd(viewport: HTMLDivElement) {
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= CHAT_END_TOLERANCE
}

function hasAgentActivity(conversation: ConversationTranscript) {
    return conversation.providerSessions.some(({ agent }) => agent === 'codex')
        || conversation.entries.some((entry) => entry.kind === 'message' && entry.agent === 'codex')
        || conversation.entries.some((entry) => entry.kind === 'event' && !!entry.providerItemId)
}

function conversationEventIsVisible(entry: AgentConversation['entries'][number]) {
    if (entry.kind !== 'event' || entry.type === 'diagnostic') return false
    if (entry.type !== 'reasoning' || entry.status !== 'completed') return true

    return reasoningDisplay(entry).hasText
}

function visibleConversationGroups(conversation: ConversationTranscript | null) {
    if (!conversation) return []
    const showEvents = hasAgentActivity(conversation)
    const visibleEntries = conversation.entries.filter((entry) => entry.kind === 'message'
        || (showEvents && conversationEventIsVisible(entry)))

    return buildActionConversationRenderGroups(visibleEntries)
}

/** Renders only transcript data, isolated from conversation metadata updates. */
export const ActionConversationTranscript = memo(function ActionConversationTranscript(
    { conversation, queuedPrompts = [], runId = null, status }: ActionConversationTranscriptProps,
) {
    const groups = visibleConversationGroups(conversation)
    const viewportRef = useRef<HTMLDivElement>(null)
    const viewportHeightRef = useRef<number | null>(null)
    const conversationPathRef = useRef<string | null | undefined>(undefined)
    const stuckToEndRef = useRef(true)
    const conversationPath = conversation?.path ?? null
    const [reservationState, setReservationState] = useState(() => updateActionConversationReservation(
        createActionConversationReservationState(), conversationPath, groups, status,
    ))
    const nextReservationState = updateActionConversationReservation(reservationState, conversationPath, groups, status)
    if (nextReservationState !== reservationState) setReservationState(nextReservationState)
    const reservedBlockCount = reservedActionConversationBlockCount(nextReservationState)

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
        stuckToEndRef.current = viewportIsAtEnd(event.currentTarget)
    }

    const handleViewportResize = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const previousViewportHeight = viewportHeightRef.current
        const viewportHeight = viewport.clientHeight
        viewportHeightRef.current = viewportHeight
        if (previousViewportHeight === viewportHeight || !stuckToEndRef.current) return

        viewport.scrollTop = viewport.scrollHeight
    }, [])

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const currentConversationPath = conversation?.path ?? null
        const conversationChanged = conversationPathRef.current !== currentConversationPath
        conversationPathRef.current = currentConversationPath
        if (conversationChanged) stuckToEndRef.current = true
        if (!stuckToEndRef.current) return

        viewport.scrollTop = viewport.scrollHeight
    })

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        viewportHeightRef.current = viewport.clientHeight
        const resizeObserver = new ResizeObserver(handleViewportResize)
        resizeObserver.observe(viewport)

        return resizeObserver.disconnect.bind(resizeObserver)
    }, [handleViewportResize])

    return (
        <Stack aria-label="Conversation chat" onScroll={handleScroll} ref={viewportRef} spacing={1}
            sx={{ flex: 1, minHeight: MIN_CHAT_HEIGHT, overflowX: 'hidden', overflowY: 'auto' }}>
            {groups.map((group) => {
                if (group.kind === 'completedToolCalls') {
                    return <CompletedToolCallGroup entries={group.entries} key={group.key} />
                }
                if (group.kind === 'subAgent') {
                    return <SubAgentGroup entry={group.entry} groups={group.groups} key={group.key} label={group.label} />
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
            {runId ? queuedPrompts.map((entry) => (
                <ActionQueuedPromptRow entry={entry} key={entry.id} runId={runId} />
            )) : null}
        </Stack>
    )
})
