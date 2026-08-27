import { Stack } from '@mui/material'
import { memo, useCallback, useLayoutEffect, useRef, useState, type UIEvent } from 'react'
import type { AgentConversation } from '../../../data/data_types'
import type { ActionConversationChange } from '../../../services/actions/action_run_registry'
import type { ActionQueuedPrompt } from '../../../data/action_run_types'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import { ActionConversationGroupList } from './action_conversation_group_list'
import { ActionConversationHistory } from './action_conversation_history'
import { ActionConversationRenderProjection } from './action_conversation_render_projection'
import {
    createActionConversationReservationState,
    reservedActionConversationBlockCount,
    updateActionConversationReservation,
} from './action_conversation_reservation'
import { ActionConversationReservedBlock } from './action_conversation_reserved_block'
import { ActionQueuedPromptRow } from './action_queued_prompt'

const CHAT_END_TOLERANCE = 4
const MIN_CHAT_HEIGHT = 96

export type ConversationTranscript = Pick<AgentConversation, 'cardInternalId' | 'entries' | 'path' | 'providerSessions'> & {
    change?: ActionConversationChange
}

interface ActionConversationTranscriptProps {
    conversation: ConversationTranscript | null
    queuedPrompts?: ActionQueuedPrompt[]
    runId?: string | null
    status: PopupRunStatus
}

function viewportIsAtEnd(viewport: HTMLDivElement) {
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= CHAT_END_TOLERANCE
}

function runIsActive(status: PopupRunStatus) {
    return status === 'queued' || status === 'running' || status === 'waitingForInput'
}

/** Renders only transcript data, isolated from conversation metadata updates. */
export const ActionConversationTranscript = memo(function ActionConversationTranscript(
    { conversation, queuedPrompts = [], runId = null, status }: ActionConversationTranscriptProps,
) {
    const [projection] = useState(() => new ActionConversationRenderProjection())
    const projectionSnapshot = projection.update(conversation, runIsActive(status))
    const viewportRef = useRef<HTMLDivElement>(null)
    const viewportHeightRef = useRef<number | null>(null)
    const conversationPathRef = useRef<string | null | undefined>(undefined)
    const stuckToEndRef = useRef(true)
    const conversationPath = conversation?.path ?? null
    const [reservationState, setReservationState] = useState(() => updateActionConversationReservation(
        createActionConversationReservationState(),
        conversationPath,
        projectionSnapshot.reservationGroups,
        projectionSnapshot.reservationSession,
        projectionSnapshot.sealedGroupKeys,
        status,
    ))
    const nextReservationState = updateActionConversationReservation(
        reservationState,
        conversationPath,
        projectionSnapshot.reservationGroups,
        projectionSnapshot.reservationSession,
        projectionSnapshot.sealedGroupKeys,
        status,
    )
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
            <ActionConversationHistory
                cardInternalId={conversation?.cardInternalId ?? null}
                groups={projectionSnapshot.historyGroups}
                projection={projection}
            />
            <ActionConversationGroupList
                cardInternalId={conversation?.cardInternalId ?? null}
                groups={projectionSnapshot.tailGroups}
                projection={projection}
            />
            {Array.from({ length: reservedBlockCount }, (_, index) => (
                <ActionConversationReservedBlock key={`reserved-block-${index}`} />
            ))}
            {runId ? queuedPrompts.map((entry) => (
                <ActionQueuedPromptRow entry={entry} key={entry.id} runId={runId} />
            )) : null}
        </Stack>
    )
})
