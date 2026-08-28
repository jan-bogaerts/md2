import { Stack } from '@mui/material'
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react'
import { dialogService } from '../../../services/dialog_service'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'
import { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { ActionConversationEvolvingGroups } from './action_conversation_evolving_groups'
import { ActionConversationHistory } from './action_conversation_history'
import { ActionConversationQueuedPrompts } from './action_conversation_queued_prompts'
import { ActionConversationReservedBlocks } from './action_conversation_reserved_blocks'
import type { ActionConversationStore } from './action_conversation_store'

const CHAT_END_TOLERANCE = 4
const MIN_CHAT_HEIGHT = 96

interface ActionConversationTranscriptProps {
    bindingStore: ActionRunBindingStore
    store: ActionConversationStore
    trackerFactory?: (
        bindingStore: ActionRunBindingStore,
        store: ActionConversationStore,
    ) => ActionConversationChatlogTracker
}

function createChatlogTracker(bindingStore: ActionRunBindingStore, store: ActionConversationStore) {
    return new ActionConversationChatlogTracker(bindingStore, store)
}

function viewportIsAtEnd(viewport: HTMLDivElement) {
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= CHAT_END_TOLERANCE
}

/** Owns tracker lifecycle and renders subscribed transcript leaves. */
export const ActionConversationTranscript = memo(function ActionConversationTranscript(
    { bindingStore, store, trackerFactory = createChatlogTracker }: ActionConversationTranscriptProps,
) {
    const [tracker, setTracker] = useState<ActionConversationChatlogTracker | null>(null)
    const viewportRef = useRef<HTMLDivElement>(null)
    const viewportHeightRef = useRef<number | null>(null)
    const conversationIdentityRef = useRef<string | null>(null)
    const stuckToEndRef = useRef(true)

    const scrollToEnd = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport || !stuckToEndRef.current) return

        viewport.scrollTop = viewport.scrollHeight
    }, [])

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
        stuckToEndRef.current = viewportIsAtEnd(event.currentTarget)
    }

    const handleViewportResize = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const previousViewportHeight = viewportHeightRef.current
        const viewportHeight = viewport.clientHeight
        viewportHeightRef.current = viewportHeight
        if (previousViewportHeight === viewportHeight) return

        scrollToEnd()
    }, [scrollToEnd])

    useEffect(() => {
        const nextTracker = trackerFactory(bindingStore, store)
        setTracker(null)
        try {
            nextTracker.load()
            setTracker(nextTracker)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not load conversation chatlog' })
        }

        return () => nextTracker.unload()
    }, [bindingStore, store, trackerFactory])

    useEffect(() => {
        if (!tracker) return undefined

        const handleContentChange = () => {
            scrollToEnd()
            queueMicrotask(scrollToEnd)
        }
        const handleConversationChange = () => {
            const conversationIdentity = tracker.getConversationIdentity()
            if (conversationIdentityRef.current !== conversationIdentity) stuckToEndRef.current = true
            conversationIdentityRef.current = conversationIdentity
            handleContentChange()
        }
        conversationIdentityRef.current = tracker.getConversationIdentity()
        const unsubscribers = [
            tracker.subscribeStableGroups(handleContentChange),
            tracker.subscribeEvolvingGroups(handleContentChange),
            tracker.subscribeReservedBlockCount(handleContentChange),
            tracker.subscribeQueuedPrompts(handleContentChange),
            tracker.subscribeConversation(handleConversationChange),
        ]

        return () => {
            for (const unsubscribe of unsubscribers) unsubscribe()
        }
    }, [scrollToEnd, tracker])

    useLayoutEffect(scrollToEnd, [scrollToEnd, tracker])

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
            {tracker ? <ActionConversationHistory tracker={tracker} /> : null}
            {tracker ? <ActionConversationEvolvingGroups tracker={tracker} /> : null}
            {tracker ? <ActionConversationReservedBlocks tracker={tracker} /> : null}
            {tracker ? <ActionConversationQueuedPrompts tracker={tracker} /> : null}
        </Stack>
    )
})
